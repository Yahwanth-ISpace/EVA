/**
 * Conversation guardrails: intent detection, identity Q&A helpers, benefit-field heuristics, hold/resume.
 */
import type { PatientCallContext } from '../../verification/verification.service';
import { PURPOSE_OF_CALL_LINE_VARIANTS } from './constants';

export function pickPurposeOfCallPhrase(): string {
  const i = Math.floor(Math.random() * PURPOSE_OF_CALL_LINE_VARIANTS.length);
  return PURPOSE_OF_CALL_LINE_VARIANTS[i] ?? PURPOSE_OF_CALL_LINE_VARIANTS[0];
}

/** Enough substance that we can assume the live agent (not IVR noise) has spoken — then EVA may give her intro. */
export function isSubstantiveTpaOpener(userSaid: string): boolean {
  const t = userSaid.trim();
  if (t.length < 10) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (/\b(how can i help|how may i help|what can i do for you)\b/i.test(t))
    return true;
  if (
    /\b(my name is|thank you for calling|good (morning|afternoon|evening)|i'?ll be (happy|glad) to help|this is \w+\s+(from|with))\b/i.test(
      t,
    )
  )
    return true;
  return t.length >= 36 || words >= 6;
}

/** TPA explicitly moved to "what benefit details do you need about this patient?" — OK to ask verbatim benefit questions (once identity is cleared). */
export function isTpaBenefitQnaHandoff(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 12) return false;
  return (
    /\bwhat\s+(would you|do you want to)\s+like\s+to\s+know\s+about\s+(the\s+)?(patient|member|subscriber)\b/.test(
      t,
    ) ||
    /\bwhat\s+(do you|would you)\s+(need|want)\s+to\s+know\s+about\s+(the\s+)?(patient|member|this\s+case|their)\b/.test(
      t,
    ) ||
    /\bwhat\s+(benefit|coverage|eligibility)\s+(details|information)\s+(do you|would you|can i)\s+(need|like|get)\b/.test(
      t,
    ) ||
    /\bwhat\s+(details|information)\s+(can i|do you need|would you like)\s+(on|about|for)\s+(the\s+)?(patient|member|benefits)\b/.test(
      t,
    ) ||
    /\b(go ahead|feel free)\s+with\s+your\s+questions\b/.test(t) ||
    /\bwhat\s+questions\s+did\s+you\s+have\b/.test(t) ||
    /\b(let me know|tell me)\s+what\s+(you\s+need|information\s+you\s+need)\b/.test(
      t,
    ) ||
    /\bso\s+what\s+(are you|do you)\s+(looking\s+for|calling\s+about|need\s+today)\b/.test(
      t,
    ) ||
    /\banything\s+(else\s+)?(you\s+)?(need|want)\s+(to\s+know\s+)?(on|about)\s+(the\s+)?(patient|benefits|coverage)\b/.test(
      t,
    ) ||
    /\bready\s+when\s+you\s+are\s+for\s+your\s+(benefit|verification)\s+questions\b/.test(
      t,
    ) ||
    /\bokay,?\s+so\s+(now\s+)?what\s+(kind\s+of\s+)?(benefit|benefits)\b/i.test(
      t,
    ) ||
    /\bnow,?\s+what\s+(benefit|benefits|details|information)\b/i.test(t) ||
    /\bwhat\s+(kind\s+of\s+)?benefit\s+details\b.*\b(do you|you)\s+need\b/i.test(
      t,
    ) ||
    /\b(regarding|about)\s+(the\s+)?(patient|member|subscriber)\b.*\b(what|which|need)\b.*\b(benefit|details|information|fields)\b/i.test(
      t,
    )
  );
}

/** TPA asks why we are calling / purpose / what they can help with in that sense. */
export function userAsksPurposeOfCallOrOpening(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 3) return false;
  return (
    /how can i help|how may i help|what can i do for you|how can i (direct|assist)|need help with/i.test(
      t,
    ) ||
    /why are you calling|purpose of (this|your|the)?\s*call|reason for (this|your)?\s*call/i.test(
      t,
    ) ||
    /what (is this|do you need) (call )?regarding|what'?s this (call )?about/i.test(
      t,
    ) ||
    /what (kind of )?information do you need|what details (are you|do you) (looking|calling) for/i.test(
      t,
    )
  );
}

const EVA_HOLD_ACK = "Sure, I'll hold. Take your time.";
/** After they say "thanks for waiting", "are you there" etc. — acknowledge only; do not re-ask the question yet. */
const EVA_RESUME_ACK =
  "No problem, thank you for getting back. I'm on the call.";

/** Duration (ms) to stay on the line after saying goodbye (in case user responds); then hang up if no input */
const POST_GOODBYE_LISTEN_MS = 10_000;

/** Detect if user is saying thank you / no more questions / goodbye / confirmation (used in post-goodbye phase). End call when they say e.g. "yeah I'm good", "yes thank you". */
export function isThankYouOrGoodbye(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 2) return false;
  return (
    /^(thank you|thanks|thank you so much|thanks a lot)/i.test(t) ||
    /^(yes|yeah|yep),?\s*(thank you|thanks)/i.test(t) ||
    /^(thank you|thanks),?\s*(yes|yeah)?/i.test(t) ||
    /^(yeah,?\s*)?(thank you|thanks)(\.?\s*)$/i.test(t) ||
    /^(no,?\s*)?(that'?s\s+all|nothing else|we'?re\s+done|goodbye|bye)$/i.test(
      t,
    ) ||
    /^(that'?s\s+all|nothing else|we'?re\s+done|goodbye|bye)(\s|$)/i.test(t) ||
    /goodbye|that'?s\s+all\s*\.?\s*$/i.test(t) ||
    /^(yes|yeah|yep|i'?m\s+all\s+set|we'?re\s+good|that'?s\s+it|all\s+good)$/i.test(
      t,
    ) ||
    /^(yeah,?\s*)?(i'?m\s+good|we'?re\s+good)(\.?\s*)$/i.test(t) ||
    /(i'?m\s+good|we'?re\s+good|that'?s\s+it)(\.?\s*)$/i.test(t)
  );
}

/** First missing field in order (uses orderedFields or default four). */
export function getFirstMissingField(
  data: Record<string, string | null>,
  orderedFields: string[],
): string | null {
  const has = (v: string | null) => v != null && String(v).trim().length > 0;
  const fields = orderedFields.length
    ? orderedFields
    : ['coverage', 'deductible', 'copay', 'validity'];
  for (const f of fields) {
    if (!has(data[f] ?? null)) return f;
  }
  return null;
}

/** When we couldn't hear or had an error: only ask to repeat; do not mention the field. */
export function getRepeatOnlyPrompt(): string {
  const options = [
    'Can you please repeat that?',
    'Can you say that once again?',
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/** Exact benefit question for `field` from appointment payload (`fieldQuestionByKey`) or legacy default. */
export function verbatimBenefitQuestion(
  field: string,
  fieldQuestionByKey: Record<string, string>,
): string {
  const q = fieldQuestionByKey[field]?.trim();
  if (q) return q;
  const legacy: Record<string, string> = {
    coverage: 'What is the basic coverage?',
    deductible: 'Can you provide the deductible?',
    copay: 'What is the copay?',
    validity: 'What is the validity of the insurance?',
  };
  return legacy[field] ?? field;
}

/** Extract a single value for a benefit field from transcript (e.g. "28 dollars" -> "28 dollars"). Used to correct after-hold when AI puts value in wrong field. */
export function extractValueForField(
  transcript: string,
  field: string,
): string | null {
  const t = transcript.trim().toLowerCase();
  const dollarMatch = t.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
  const percentMatch = t.match(/(\d+)\s*%|(\d+)\s*percent/i);
  const numberMatch = t.match(/\b(\d+)\b/);
  if (field === 'validity') {
    // Validity MUST be a date. If the transcript is a dollar amount or a percentage,
    // it is clearly NOT a validity answer — return null so we don't pollute the field
    // with "twenty-four dollars" just because the word "twenty" appeared.
    if (/dollar|\$|%\s|\s%|\bpercent\b/i.test(t)) return null;
    // Require an explicit date marker: full month name, abbreviated month, 4-digit year,
    // "/YY", or a clear recurrence word. Dropped the overly-broad "twenty" and bare
    // "dec"/"feb" duplicates from the previous regex.
    const monthRe =
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/i;
    const yearRe = /\b(19|20)\d{2}\b/;
    const wordRe = /\b(valid|till|until|through|expires?|expiry|thru|to)\b/i;
    if (monthRe.test(t) || yearRe.test(t) || wordRe.test(t)) {
      return transcript.trim().replace(/\s+/g, ' ');
    }
    return null;
  }
  if (dollarMatch) {
    const num = dollarMatch[1] || dollarMatch[2] || dollarMatch[3];
    return num ? `${num} dollars` : null;
  }
  if (percentMatch && (field === 'copay' || field === 'coverage')) {
    const num = percentMatch[1] || percentMatch[2];
    return num ? `${num} percent` : null;
  }
  if (numberMatch) {
    const num = numberMatch[1];
    if (field === 'deductible' || field === 'copay') return `${num} dollars`;
    if (field === 'coverage') return num;
    return num;
  }
  return null;
}

/** Does the transcript contain an unambiguous dollar amount? Used to skip the
 *  "reassign to validity" rescue when the user clearly gave a money value. */
export function transcriptIsMoney(transcript: string): boolean {
  const t = transcript.trim().toLowerCase();
  return /\$\s*\d+|\d+\s*dollars?|\bdollars?\b/.test(t);
}

/** Does the transcript look like a date/validity answer (month name, 4-digit year, "till", etc.)? */
export function transcriptIsDate(transcript: string): boolean {
  const t = transcript.trim().toLowerCase();
  if (/dollar|\$|%\s|\s%|\bpercent\b/i.test(t)) return false;
  return (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/i.test(
      t,
    ) ||
    /\b(19|20)\d{2}\b/.test(t) ||
    /\b(valid|till|until|through|thru|expires?|expiry)\b/i.test(t)
  );
}

/** True if transcript looks like it contains a number, dollar amount, or percent (user may be giving a value). */
export function transcriptHasValue(transcript: string): boolean {
  return /\d+|dollar|percent|%\s*\$/.test(transcript);
}

/**
 * True if the reply is the intro/purpose phrase we only say once.
 * Catches all common variants the LLM produces: "I'm calling to verify / get / collect / confirm
 * ... patient / benefit / coverage details / information", "I need some benefit details",
 * "here to verify ...", "reaching out to confirm ...", etc. Keep this broad — any false
 * positive just gets swapped for an identity/next-field answer, which is always acceptable
 * once purpose has already been stated in the call.
 */
export function isIntroPurposePhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // "calling / here / reaching out ... to (verify|get|collect|confirm|obtain|gather|check) ... patient|benefit|coverage|details|information"
  if (
    /\b(i'?m|i am|we'?re|we are)\s+(calling|here|reaching\s+out|on\s+the\s+(phone|line))\s+(to|for)\s+(verify|get|collect|confirm|obtain|gather|check|follow\s+up|follow-up|look|ask)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\bcalling\s+to\s+(verify|get|collect|confirm|obtain|gather|check|follow\s+up|follow-up)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\bi\s+need\s+(a\s+few|some|to\s+get|to\s+collect|to\s+verify)\s+(benefit|patient|coverage|insurance)\s+(detail|info|information)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(verify|confirm|collect|gather|get)\s+(a\s+few\s+|some\s+|the\s+)?(benefit|patient|coverage|insurance)\s+(detail|info|information)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(i'?m|i am)\s+here\s+to\s+verify\b/i.test(t)) return true;
  if (/\bi\s+want\s+to\s+verify\s+(the\s+)?patient\b/i.test(t)) return true;
  if (
    /\bto\s+(verify|confirm|check)\s+(the\s+)?patient'?s?\s+(benefit|coverage|insurance|eligibility)/i.test(
      t,
    )
  )
    return true;
  if (/\bget\s+benefit\s+(detail|info|information)/i.test(t)) return true;
  if (/\bpurpose\s+of\s+(this|the|my)\s+call\s+is\b/i.test(t)) return true;
  return false;
}

/** Which identity/verification item the TPA just asked about, if any.
 *  Used so we can answer directly from `state.callContext` and avoid LLM drift (e.g.
 *  re-emitting the purpose sentence). Returns null when no identity question is detected. */
export type IdentityAsk =
  | 'provider_npi'
  | 'billing_npi'
  | 'tax_id'
  | 'member_id'
  | 'patient_dob'
  | 'patient_first_name'
  | 'patient_last_name'
  | 'patient_full_name'
  | 'provider_name'
  | 'subscriber_dob'
  | 'subscriber_first_name'
  | 'subscriber_last_name'
  | 'subscriber_full_name'
  | null;

export function detectIdentityAsk(userSaid: string): IdentityAsk {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 3) return null;
  // Tax ID / EIN
  if (/\b(tax\s*id|tin|ein|tax\s+identification)\b/.test(t)) return 'tax_id';
  // Billing vs rendering NPI
  if (/\b(billing\s+(provider\s+)?npi|billing\s+npi)\b/.test(t))
    return 'billing_npi';
  if (
    /\b(provider\s+npi|rendering\s+npi|npi\s+(number|of|for))\b/.test(t) ||
    /\bwhat(?:'s|\s+is)\s+(the\s+)?npi\b/.test(t) ||
    /\bnpi\s*\??$/.test(t)
  ) {
    return 'provider_npi';
  }
  // Member ID
  if (
    /\b(member\s*id|member\s+number|subscriber\s*id|policy\s*(number|id)|id\s+number)\b/.test(
      t,
    )
  )
    return 'member_id';
  // Subscriber questions (check before patient so "subscriber first name" matches here)
  if (
    /\bsubscriber'?s?\s+(date\s+of\s+birth|dob|birthday)\b/.test(t) ||
    /\bdob\s+(of\s+)?(the\s+)?subscriber\b/.test(t)
  ) {
    return 'subscriber_dob';
  }
  if (/\bsubscriber'?s?\s+first\s+name\b/.test(t))
    return 'subscriber_first_name';
  if (/\bsubscriber'?s?\s+last\s+name\b/.test(t)) return 'subscriber_last_name';
  if (/\b(subscriber'?s?\s+name|name\s+of\s+(the\s+)?subscriber)\b/.test(t))
    return 'subscriber_full_name';
  // Patient / provider
  if (
    /\b(patient'?s?\s+(date\s+of\s+birth|dob|birthday)|patient\s+dob)\b/.test(
      t,
    ) ||
    /\b(date\s+of\s+birth|dob|birthday)\b/.test(t)
  ) {
    return 'patient_dob';
  }
  if (/\bpatient'?s?\s+first\s+name\b/.test(t)) return 'patient_first_name';
  if (/\bpatient'?s?\s+last\s+name\b/.test(t)) return 'patient_last_name';
  if (/\b(patient'?s?\s+(full\s+)?name|name\s+of\s+(the\s+)?patient)\b/.test(t))
    return 'patient_full_name';
  if (
    /\b(provider'?s?\s+(full\s+)?name|name\s+of\s+(the\s+)?(provider|doctor|dentist)|treating\s+(provider|doctor|dentist)|rendering\s+(provider|doctor|dentist)|who\s+is\s+(the\s+)?(provider|doctor|dentist))\b/.test(
      t,
    )
  ) {
    return 'provider_name';
  }
  return null;
}

/** Compose a one-line reply for an identity question directly from cached call context.
 *  Returns null when we don't have the requested field (caller decides what to say).
 *  When this produces a value we use it verbatim and skip the LLM — that is what keeps
 *  EVA fast and on-script, and it is what stops the "I am calling to verify..." drift. */
export function answerIdentityFromContext(
  ask: NonNullable<IdentityAsk>,
  ctx: PatientCallContext | null,
): string | null {
  if (!ctx) return null;
  const notOnFile =
    'I am sorry, I do not have that on my end. Is there anything else I can share so we can continue?';
  switch (ask) {
    case 'provider_npi':
      return ctx.provider?.npi
        ? `The provider NPI is ${ctx.provider.npi}.`
        : notOnFile;
    case 'billing_npi': {
      const b = ctx.provider?.billingNpi || ctx.provider?.npi;
      return b ? `The billing provider NPI is ${b}.` : notOnFile;
    }
    case 'tax_id':
      return ctx.provider?.taxId
        ? `The provider tax ID is ${ctx.provider.taxId}.`
        : notOnFile;
    case 'member_id':
      return ctx.memberId ? `The member ID is ${ctx.memberId}.` : notOnFile;
    case 'patient_dob':
      return ctx.patient.dobFormatted
        ? `The patient's date of birth is ${ctx.patient.dobFormatted}. Does that match your records?`
        : notOnFile;
    case 'patient_first_name':
      return ctx.patient.firstName
        ? `The patient's first name is ${ctx.patient.firstName}.`
        : notOnFile;
    case 'patient_last_name':
      return ctx.patient.lastName
        ? `The patient's last name is ${ctx.patient.lastName}.`
        : notOnFile;
    case 'patient_full_name':
      return ctx.patient.fullName
        ? `The patient's name is ${ctx.patient.fullName}.`
        : notOnFile;
    case 'provider_name':
      return ctx.provider?.fullName
        ? `The treating provider is Dr. ${ctx.provider.fullName}.`
        : notOnFile;
    case 'subscriber_dob':
      return ctx.subscriber.dobFormatted
        ? `The subscriber's date of birth is ${ctx.subscriber.dobFormatted}.`
        : notOnFile;
    case 'subscriber_first_name':
      return ctx.subscriber.firstName
        ? `The subscriber's first name is ${ctx.subscriber.firstName}.`
        : notOnFile;
    case 'subscriber_last_name':
      return ctx.subscriber.lastName
        ? `The subscriber's last name is ${ctx.subscriber.lastName}.`
        : notOnFile;
    case 'subscriber_full_name':
      return ctx.subscriber.fullName
        ? `The subscriber's name is ${ctx.subscriber.fullName}.`
        : notOnFile;
    default:
      return null;
  }
}

/** Bare acknowledgement — "okay", "alright", "sure", "got it" — with no actual question or content.
 *  Used after purpose has been said to avoid EVA immediately volunteering a benefit field.
 *  Returns false for "yes" / "thank you" since those are handled as explicit confirmations elsewhere. */
export function isBareAcknowledgement(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!,]+$/, '');
  if (!t) return false;
  if (t.length > 28) return false;
  return /^(ok|okay|alright|all\s*right|sure|got\s*it|understood|i\s*see|gotcha|mm[-\s]?hmm|mhm|mmk)$/i.test(
    t,
  );
}

/** TPA is handing control to EVA ("go ahead" / "what do you need" / "what fields" / "what information" /
 *  "anything else" / "how can I help"). On this signal we flip `patientIdentityReadyForBenefits` to true,
 *  which allows EVA to start asking benefit fields. */
export function isTpaHandoff(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return false;
  return (
    /\b(go\s+ahead|please\s+proceed|you\s+(can|may)\s+proceed|proceed)\b/.test(
      t,
    ) ||
    /\bwhat\s+(do\s+you|can\s+i|may\s+i|is\s+it\s+you)\s+(need|want|want\s+to\s+know|looking\s+for|require)\b/.test(
      t,
    ) ||
    /\bwhat\s+(fields|information|details|benefits|info)\s+(do\s+you|are\s+you|you\s+need|you\s+want)\b/.test(
      t,
    ) ||
    /\b(anything|something)\s+else\s+(you\s+need|i\s+can\s+(help|share|provide))\b/.test(
      t,
    ) ||
    /\bhow\s+(can|may)\s+i\s+help\b/.test(t) ||
    /\bwhat\s+else\s+do\s+you\s+need\b/.test(t) ||
    /\b(ready|i\s+am\s+ready)\b/.test(t)
  );
}

/** Is EVA's proposed reply asking for a benefit field from the orderedFields list?
 *  We check for common "Can I get / May I have / What is / Could you provide / share"
 *  followed by any field name in its camel-case or space-separated form. */
export function isBenefitFieldAsk(
  toSpeak: string,
  orderedFields: string[],
  fieldQuestionByKey?: Record<string, string>,
): boolean {
  if (!toSpeak?.trim() || !orderedFields.length) return false;
  const t = toSpeak.toLowerCase();
  const hasQuestion =
    /\?|\bcan\s+(i|you)\b|\bmay\s+i\b|\bcould\s+(i|you)\b|\bwhat(?:'s|\s+is)\b|\bwhat\s+are\b|\bprovide|\bshare|\btell\s+me\b/i.test(
      t,
    );
  if (!hasQuestion) return false;
  if (fieldQuestionByKey) {
    for (const f of orderedFields) {
      const q = fieldQuestionByKey[f]?.trim().toLowerCase();
      if (q && t.includes(q)) return true;
    }
  }
  return orderedFields.some((f) => {
    if (!f) return false;
    const direct = f.toLowerCase();
    // camelCase → space separated, e.g. "groupId" → "group id"
    const spaced = f
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
    return t.includes(direct) || t.includes(spaced);
  });
}

/** Rep asks who is calling — a one-line identity answer is OK; full "Hi I'm Reena... how are you" is not. */
export function userAskedWhoIsCalling(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 4) return false;
  return (
    /\bwho\s+is\s+(this|calling|that)\b/.test(t) ||
    /\bwho\s+are\s+you\b/.test(t) ||
    /\bidentify\s+yourself\b/.test(t) ||
    /\bwhat\s+(company|office)\s+is\s+this\b/.test(t) ||
    /\bwhere\s+are\s+you\s+calling\s+from\b/.test(t)
  );
}

/**
 * Matches the opening stream greeting or close variants the LLM sometimes repeats mid-call.
 */
export function isFullOpeningSelfIntro(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 15) return false;
  if (
    /(hi|hey|hello),?\s+this\s+is\s+reena\b/.test(t) &&
    /went\s+dentals/.test(t)
  ) {
    return true;
  }
  // Any greeting-style "Hi / Hey + I'm Reena from Went Dentals" (with or without "how are you")
  if (/(hi|hey|hello),?\s+i'?m\s+reena\s+from\s+went\s+dentals/.test(t)) {
    return true;
  }
  if (/(hi|hey|hello),?\s+i\s+am\s+reena\s+from\s+went\s+dentals/.test(t)) {
    return true;
  }
  if (
    /i\s+am\s+reena\s+from\s+went\s+dentals/.test(t) &&
    /how\s+are\s+you/.test(t)
  ) {
    return true;
  }
  if (
    t.includes('reena') &&
    t.includes('went dentals') &&
    (t.includes('how are you') || t.includes('how are you doing'))
  ) {
    return true;
  }
  return false;
}

/** Detect if user is asking to put the call on hold */
export function isHoldPhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /putting?\s+(?:the\s+)?call\s+on\s+hold/i.test(t) ||
    /put\s+(?:me\s+)?(?:on\s+)?hold/i.test(t) ||
    /(?:please\s+)?hold\s+(?:please)?/i.test(t) ||
    /(?:can you\s+)?(?:please\s+)?(?:wait|hold)/i.test(t) ||
    /one\s+moment/i.test(t) ||
    /putting\s+you\s+on\s+hold/i.test(t) ||
    /i'?m\s+putting\s+(?:the\s+)?call\s+on\s+hold/i.test(t) ||
    /please\s+wait/i.test(t)
  );
}

/** Detect if user is saying they are back from hold. When matched, we stop hold, speak ack, and transcription + full conversation flow resume from the next user message. */
export function isResumePhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /i'?m\s+back/i.test(t) ||
    /(?:thank you|thanks)\s+for\s+(?:waiting|holding)/i.test(t) ||
    /thanks?\s+for\s+staying\s+on\s+hold/i.test(t) ||
    /thanks?\s+for\s+waiting\s+on\s+(?:the\s+)?call/i.test(t) ||
    /thanks?\s+for\s+waiting\s+on\s+hold/i.test(t) ||
    /(?:we'?re\s+)?back\s+on\s+(?:the\s+)?line/i.test(t) ||
    /(?:are\s+)?you\s+(?:still\s+)?(?:there|online)/i.test(t) ||
    /(?:are\s+)?you\s+there/i.test(t) ||
    /(?:are\s+)?you\s+online/i.test(t) ||
    /let'?s\s+continue/i.test(t) ||
    /ready\s+(?:to\s+)?continue/i.test(t) ||
    /(?:i'?m\s+)?ready/i.test(t) ||
    /continue\s+(?:please)?/i.test(t) ||
    /hold\s+(?:is\s+)?(?:removed|off)/i.test(t)
  );
}

/** If the user is asking what value we have for a benefit field (recall), return the reply from stored extractedData. */
export function getRecallReply(
  userSaid: string,
  extractedData: Record<string, string | null>,
  orderedFields: string[],
): string | null {
  const t = userSaid.trim().toLowerCase();
  if (!t || t.length < 3) return null;
  const fields = orderedFields.length
    ? orderedFields
    : ['coverage', 'deductible', 'copay', 'validity'];
  for (const field of fields) {
    const re = new RegExp(
      `\\bwhat('s| is)?\\s+(the\\s+)?${field}\\b|\\b${field}\\s+(provided|did you get|do you have|was that|we said)|\\bwhat did (i say|you get|you have)\\s+(for\\s+)?(the\\s+)?${field}|\\b(do you have|what (value|number|did you get))\\s+(for\\s+)?(the\\s+)?${field}`,
      'i',
    );
    if (re.test(t)) {
      const val = extractedData[field];
      if (val != null && String(val).trim())
        return `I have the ${field} as ${val}.`;
      return `I don't have that one yet.`;
    }
  }
  if (/\bwhat is the deductible\b/i.test(t)) {
    const val = extractedData.deductible;
    if (val != null && String(val).trim())
      return `I have the deductible as ${val}.`;
    return `I don't have that one yet.`;
  }
  if (/\bwhat is the (coverage|copay|validity)\b/i.test(t)) {
    const k = t.includes('coverage')
      ? 'coverage'
      : t.includes('copay')
        ? 'copay'
        : 'validity';
    const val = extractedData[k];
    if (val != null && String(val).trim()) return `I have the ${k} as ${val}.`;
    return `I don't have that one yet.`;
  }
  return null;
}