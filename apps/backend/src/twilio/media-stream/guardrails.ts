/**
 * Conversation guardrails: intent detection, identity Q&A helpers, benefit-field heuristics, hold/resume.
 */
import type { PatientCallContext } from '../../verification/verification.service';
import {
  EVA_HOW_ARE_YOU_REPLY,
  EVA_INTRO_IDENTITY_LINE,
  EVA_INTRO_LINE,
  EVA_MID_CALL_CONTINUE_LINE,
  EVA_POST_VALUE_ACK_PHRASES,
  EVA_SIMPLE_PURPOSE_FOR_OPENING,
  EVA_SOCIAL_GREETING_REPLY,
  EVA_TIME_OF_DAY_PURPOSE_FOLLOWUP,
} from './constants';

export function pickPurposeOfCallPhrase(): string {
  return EVA_SIMPLE_PURPOSE_FOR_OPENING;
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

/** TPA asked how EVA is doing (often with their own name/office intro in the same turn). */
export function tpaAskedHowAreYou(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 8) return false;
  return (
    /\bhow\s+are\s+you\b/.test(t) ||
    /\bhow(?:'s|\s+is)\s+(?:your\s+)?day\b/.test(t) ||
    /\bhow\s+(?:are\s+)?you\s+doing\b/.test(t) ||
    /\bhow\s+do\s+you\s+do\b/.test(t)
  );
}

/** Short hi / hello / good morning only — EVA says she is doing great and waits for the rep's next line. */
export function isTpaSocialGreetingOnly(userSaid: string): boolean {
  const t = userSaid.trim();
  if (t.length < 2) return false;
  if (tpaAskedHowAreYou(userSaid)) return false;
  if (userAsksPurposeOfCallOrOpening(userSaid)) return false;
  if (/\b(how can i help|how may i help|what can i do for you)\b/i.test(t)) {
    return false;
  }
  if (detectIdentityAsk(userSaid)) return false;
  if (tpaTimeOfDayGreeting(userSaid)) return false;
  if (isSubstantiveTpaOpener(userSaid) && t.length >= 28) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > 14) return false;
  return (
    /^(hi|hello|hey)\b/i.test(t) ||
    /\b(thank\s+you\s+for\s+calling|thanks\s+for\s+calling)\b/i.test(t) ||
    (/^(hi|hello|hey)\b/i.test(t) && words <= 6)
  );
}

/** Live rep spoke first — greeting, how-are-you, or substantive opener; EVA should reply (not stay silent). */
export function isTpaLiveOpener(userSaid: string): boolean {
  return (
    isSubstantiveTpaOpener(userSaid) ||
    isTpaSocialGreetingOnly(userSaid) ||
    tpaAskedHowAreYou(userSaid)
  );
}

export type EvaOpeningCompose = {
  text: string;
  /** EVA replied to hi/hello only — "I'm Reena…" comes on the rep's next turn. */
  socialGreetOnly: boolean;
  introIdentitySaid: boolean;
  purposeSaid: boolean;
};

/** TPA introduced themselves (name / company) — do not echo their name ("Hi John…"). */
export function tpaIntroducedSelf(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 10) return false;
  return (
    /\b(my name is|i'?m\s+[a-z][a-z'-]+|i am\s+[a-z][a-z'-]+|this is\s+[a-z][a-z'-]+)\b/.test(
      t,
    ) &&
    /\b(from|with|insurance|company|group|department|office)\b/.test(t)
  );
}

/** Brief polite ack — not "Of course" or "Understood" (reserved for re-confirmation). */
export function pickBriefAcknowledgement(): string {
  const options = ['Thank you.', 'Okay, thank you.', 'Thanks.'];
  return options[Math.floor(Math.random() * options.length)];
}

/** After TPA re-confirms a value we stated — "Understood" is appropriate here only. */
export function pickReconfirmationAcknowledgement(): string {
  const options = ['Understood.', 'Got it.', 'Okay, thank you.'];
  return options[Math.floor(Math.random() * options.length)];
}

export type TimeOfDayGreeting = 'morning' | 'afternoon' | 'evening';

/** TPA said good morning / afternoon / evening (match their greeting). */
export function tpaTimeOfDayGreeting(userSaid: string): TimeOfDayGreeting | null {
  const t = userSaid.trim().toLowerCase();
  if (/\bgood\s+morning\b/.test(t)) return 'morning';
  if (/\bgood\s+afternoon\b/.test(t)) return 'afternoon';
  if (/\bgood\s+evening\b/.test(t)) return 'evening';
  return null;
}

function timeOfDayGreetingPhrase(tod: TimeOfDayGreeting): string {
  if (tod === 'morning') return 'Good morning.';
  if (tod === 'afternoon') return 'Good afternoon.';
  return 'Good evening.';
}

/** Opening when TPA greets with good morning/evening — mirror their greeting + intro. */
export function composeTimeOfDayGreetingReply(
  tod: TimeOfDayGreeting,
  opts: { alsoPurpose: boolean },
): EvaOpeningCompose {
  const greet = timeOfDayGreetingPhrase(tod);
  const intro = 'I am Reena from Went Dentals.';
  const parts = [greet, intro];
  if (opts.alsoPurpose) parts.push(pickPurposeOfCallPhrase());
  return {
    text: parts.join(' '),
    socialGreetOnly: false,
    introIdentitySaid: true,
    purposeSaid: opts.alsoPurpose,
  };
}

/** Mid-call short hello — EVA is still on the line; do not re-introduce. */
export function isMidCallPresenceCheck(
  userSaid: string,
  opts: { openingDone: boolean },
): boolean {
  if (!opts.openingDone) return false;
  const t = userSaid
    .trim()
    .toLowerCase()
    .replace(/[.!,?]+$/, '');
  if (!t || t.length > 36) return false;
  if (userAsksPurposeOfCallOrOpening(userSaid)) return false;
  if (detectIdentityAsk(userSaid)) return false;
  if (isTpaBenefitQnaHandoff(userSaid)) return false;
  return (
    /^(hi|hello|hey|yo|are you there|you there|hello there)$/.test(t) ||
    (/^(hi|hello|hey)\b/.test(t) && t.split(/\s+/).length <= 4)
  );
}

export { EVA_MID_CALL_CONTINUE_LINE };

/** TPA confirmed the patient is on file / located. */
export function isTpaPatientLocated(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 8) return false;
  return (
    /\b(i'?ve?\s+)?(found|located|have)\s+(?:the\s+)?(?:patient|member|subscriber)\b/.test(
      t,
    ) ||
    /\bpatient\s+(?:has\s+been\s+)?(?:found|located)\b/.test(t) ||
    /\b(?:member|subscriber)\s+(?:is\s+)?(?:found|located|on\s+file)\b/.test(t)
  );
}

/** Whether this turn should open benefit Q&A (verbatim field questions). */
export function shouldOpenBenefitQna(
  userSaid: string,
  tpaPatientLocated: boolean,
): boolean {
  if (isTpaBenefitQnaHandoff(userSaid)) return true;
  if (isTpaPatientLocated(userSaid) && userAsksPurposeOfCallOrOpening(userSaid)) {
    return true;
  }
  if (tpaPatientLocated && userAsksPurposeOfCallOrOpening(userSaid)) {
    return true;
  }
  return false;
}

/** Short yes / okay only — advance to next benefit field; do not say "right?" or "yes it is". */
export function isTpaBareAffirmative(userSaid: string): boolean {
  const t = userSaid
    .trim()
    .toLowerCase()
    .replace(/[.!,]+$/, '');
  if (!t || t.length > 24) return false;
  return /^(yes|yeah|yep|yup|correct|that'?s\s+right|right|uh[-\s]?huh|ok|okay)$/.test(
    t,
  );
}

/** TPA confirms a specific value in the same utterance ("is it 1020 as I said?") — not bare "yes". */
export function isTpaConfirmingStatedValue(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 8) return false;
  if (isTpaBareAffirmative(userSaid)) return false;
  return (
    /\b(is\s+it|is\s+that|as\s+i\s+said|like\s+i\s+said|what\s+i\s+said|did\s+you\s+get|you\s+got)\b/.test(
      t,
    ) &&
    (/\d/.test(t) ||
      /\b(dollar|percent|%|\$)\b/.test(t) ||
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
        t,
      ))
  );
}

export function replyToValueConfirmation(): string {
  const options = [
    "Yes, that's correct.",
    'Yes, it is.',
    "That's right.",
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/** After TPA provides a benefit field value — varied short ack before the next question. */
export function pickPostValueAcknowledgement(): string {
  const phrases = [...EVA_POST_VALUE_ACK_PHRASES];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

const BENEFIT_FIELD_LABELS: Record<string, string> = {
  coverage: 'coverage',
  deductible: 'deductible',
  copay: 'copay',
  validity: 'validity',
};

export function benefitFieldDisplayName(field: string): string {
  const key = field.trim();
  if (BENEFIT_FIELD_LABELS[key]) return BENEFIT_FIELD_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').toLowerCase().trim() || key;
}

/** First benefit ask after TPA opens Q&A: "I would need the {field}." + verbatim question. */
export function formatFirstBenefitFieldAsk(
  field: string,
  verbatimQuestion: string,
): string {
  const name = benefitFieldDisplayName(field);
  const q = verbatimQuestion.trim();
  return `I would need the ${name}. ${q}`;
}

const DEFAULT_BENEFIT_ORDER = [
  'coverage',
  'deductible',
  'copay',
  'validity',
] as const;

/** Build the line to ask for a benefit field (prefix on first missing field only). Does not mutate state. */
export function buildBenefitFieldAskLine(
  field: string,
  extractedData: Record<string, string | null>,
  orderedFields: string[],
  fieldQuestionByKey: Record<string, string>,
  firstPrefixAlreadyUsed: boolean,
): string {
  const ordered =
    orderedFields.length > 0 ? orderedFields : [...DEFAULT_BENEFIT_ORDER];
  const q = verbatimBenefitQuestion(field, fieldQuestionByKey);
  const firstMissing = getFirstMissingField(extractedData, ordered);
  if (firstMissing && field === firstMissing && !firstPrefixAlreadyUsed) {
    return formatFirstBenefitFieldAsk(field, q);
  }
  return q;
}

/** Remove "is that right?", "correct?" etc. from EVA lines after collecting a value. */
export function stripTrailingBenefitConfirmation(text: string): string {
  let t = text.trim();
  if (!t) return t;
  t = t.replace(
    /\s*,?\s*(is\s+that|is\s+it)\s+(right|correct|ok|okay)\s*\??\s*$/gi,
    '',
  );
  t = t.replace(/\s*,?\s*right\s*\??\s*$/gi, '');
  t = t.replace(/\s*,?\s*correct\s*\??\s*$/gi, '');
  return t.trim();
}

/** Pull only the numeric/date token for a benefit field — never store the full TPA sentence. */
export function scrubRawBenefitValue(
  field: string,
  raw: string,
  userSaid: string,
): string {
  const fromSpeech = extractValueForField(userSaid, field);
  if (fromSpeech) return fromSpeech;
  const v = raw.trim();
  if (!v) return v;
  const fromRaw = extractValueForField(v, field);
  if (fromRaw) return fromRaw;
  const stripped = v
    .replace(
      /^(?:yes|no|yeah|okay|so|well|um|uh|it is|it's|that is|that's|the|a|an)[,\s]+/gi,
      '',
    )
    .trim();
  const fromStripped = extractValueForField(stripped, field);
  if (fromStripped) return fromStripped;
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length > 8 || stripped.length > 40) {
    return fromSpeech || fromRaw || stripped.slice(0, 36).trim();
  }
  return stripped;
}

/** First EVA spoken turn after the TPA opens the live call (context-driven; never "Hi {TPA name}"). */
export function composeEvaOpeningReply(
  userSaid: string,
  opts: { alsoPurpose: boolean },
): EvaOpeningCompose {
  const sameTurnPurpose =
    opts.alsoPurpose || userAsksPurposeOfCallOrOpening(userSaid);
  if (tpaAskedHowAreYou(userSaid)) {
    const parts = [EVA_HOW_ARE_YOU_REPLY, EVA_INTRO_IDENTITY_LINE];
    if (sameTurnPurpose) parts.push(pickPurposeOfCallPhrase());
    return {
      text: parts.join(' '),
      socialGreetOnly: false,
      introIdentitySaid: true,
      purposeSaid: sameTurnPurpose,
    };
  }
  if (isTpaSocialGreetingOnly(userSaid)) {
    return {
      text: EVA_SOCIAL_GREETING_REPLY,
      socialGreetOnly: true,
      introIdentitySaid: false,
      purposeSaid: false,
    };
  }
  if (tpaIntroducedSelf(userSaid) && !sameTurnPurpose) {
    return {
      text: EVA_INTRO_IDENTITY_LINE,
      socialGreetOnly: false,
      introIdentitySaid: true,
      purposeSaid: false,
    };
  }
  const parts: string[] = [EVA_INTRO_IDENTITY_LINE];
  if (sameTurnPurpose) parts.push(pickPurposeOfCallPhrase());
  return {
    text: parts.join(' '),
    socialGreetOnly: false,
    introIdentitySaid: true,
    purposeSaid: sameTurnPurpose,
  };
}

/** Second live turn: after a short hi/hello, EVA gives identity intro (no leading "Hi, I'm Reena"). */
export function composeEvaDeferredIntroReply(opts: {
  alsoPurpose: boolean;
  identityAnswer: string | null;
}): EvaOpeningCompose {
  const parts: string[] = [EVA_INTRO_IDENTITY_LINE];
  if (opts.alsoPurpose) parts.push(pickPurposeOfCallPhrase());
  if (opts.identityAnswer?.trim()) parts.push(opts.identityAnswer.trim());
  return {
    text: parts.join(' '),
    socialGreetOnly: false,
    introIdentitySaid: true,
    purposeSaid: opts.alsoPurpose,
  };
}

/** TPA explicitly moved to "what benefit details do you need about this patient?" — OK to ask verbatim benefit questions (once identity is cleared). */
export function isTpaBenefitQnaHandoff(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 8) return false;
  return (
    /\bwhat\s+(would you|do you want to)\s+like\s+to\s+know\s+about\s+(the\s+)?(patient|member|subscriber)\b/.test(
      t,
    ) ||
    /\bwhat\s+(do you|would you)\s+(need|want)\s+to\s+know\s+about\s+(the\s+)?(patient|member|this\s+case|their|othe)\b/.test(
      t,
    ) ||
    /\bwhat\s+(benefit|coverage|eligibility)\s+(details|information)\s+(do you|would you|can i)\s+(need|like|get)\b/.test(
      t,
    ) ||
    /\bwhat\s+(details|information)\s+(can i|do you need|would you like)\s+(on|about|for)\s+(the\s+)?(patient|member|benefits?)\b/.test(
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
    /\banything\s+(else\s+)?(you\s+)?(need|want)\s+(to\s+know\s+)?(on|about)\s+(the\s+)?(patient|benefits?|coverage)\b/.test(
      t,
    ) ||
    /\bready\s+when\s+you\s+are\s+for\s+your\s+(benefit|verification)\s+questions\b/.test(
      t,
    ) ||
    /\bokay,?\s+so\s+(now\s+)?what\s+(kind\s+of\s+)?(benefit|benefits)\b/i.test(
      t,
    ) ||
    /\b(okay|ok),?\s+so\b[\s\S]{0,60}\bwhat\s+do\s+you\s+want\s+to\s+know\b/.test(
      t,
    ) ||
    /\bnow,?\s+what\s+(benefit|benefits|details|information)\b/.test(t) ||
    /\bwhat\s+(kind\s+of\s+)?benefit\s+details\b[\s\S]{0,50}\b(do you|you)\s+need\b/.test(
      t,
    ) ||
    /\bwhat\s+are\s+the\s+benefit\s+details\b[\s\S]{0,60}\b(you\s+)?need\b[\s\S]{0,40}\b(regarding|about|for)\b[\s\S]{0,30}\b(the\s+)?patient\b/.test(
      t,
    ) ||
    /\bwhat\s+are\s+the\s+things\b[\s\S]{0,80}\b(you\s+)?(want\s+to\s+)?know\b[\s\S]{0,50}\b(about|for)\b[\s\S]{0,30}\b(the\s+)?patient\b/.test(
      t,
    ) ||
    /\bwhat\s+do\s+you\s+want\s+to\s+know\b[\s\S]{0,50}\b(about|for)\b[\s\S]{0,30}\b(the\s+)?(patient|benefits?)\b/.test(
      t,
    ) ||
    /\bwhat\s+are\s+the\s+fields\b[\s\S]{0,80}\b(you\s+)?(want|need)\s+to\s+collect\b/.test(
      t,
    ) ||
    /\bwhat\s+(fields|information)\s+(do you|would you)\s+(want|need)\s+to\s+(collect|gather|verify)\b/.test(
      t,
    ) ||
    /\b(regarding|about)\s+(the\s+)?(patient|member|subscriber)\b[\s\S]{0,80}\b(what|which)\b[\s\S]{0,40}\b(benefit|benefits|details|information|fields)\b/.test(
      t,
    ) ||
    /\b(what|which)\b[\s\S]{0,40}\b(benefit|benefits|details|fields)\b[\s\S]{0,60}\b(regarding|about)\s+(the\s+)?(patient|member)\b/.test(
      t,
    ) ||
    /\b(okay|ok),?\s+what\s+(do you|would you)\s+(want|need)\s+to\s+know\b/.test(
      t,
    ) ||
    /\bwhat\s+do\s+you\s+want\s+to\s+know\s+about\s+(the\s+)?(patient|member)\b/.test(
      t,
    ) ||
    /\bwhat\s+(benefit|benefits)\s+do\s+you\s+want\s+to\s+know\b/.test(t) ||
    /\bwhat\s+benefit\s+(details|information)\s+do\s+you\s+need\b/.test(t) ||
    /\bwhat\s+(fields|information)\s+(do you|would you)\s+want\s+me\s+to\s+provide\b/.test(
      t,
    ) ||
    /\bwhat\s+(?:fields|details)\s+(?:do you|would you)\s+(?:want|need)\s+(?:me\s+)?to\s+(?:provide|give|share)\b/.test(
      t,
    ) ||
    /\b(what|which)\s+(benefit|benefits|fields)\s+(?:are you|do you)\s+(?:looking for|needing|want)\b/.test(
      t,
    ) ||
    /\bwhat\s+(?:is\s+)?(?:the\s+)?(?:patient\s+)?details?\b[\s\S]{0,50}\b(?:do you|you)\s+need\b/.test(
      t,
    ) ||
    /\bwhat\s+(?:patient|member)\s+details?\s+(?:do you|you)\s+need\b/.test(t) ||
    /\bwhat\s+details?\s+(?:do you|you)\s+need\b/.test(t) ||
    /\bwhat\s+(?:information|info)\s+(?:do you|you)\s+need\b[\s\S]{0,60}\b(?:patient|member|benefit|verify|verification)\b/.test(
      t,
    ) ||
    (/\bwhat\s+(?:do you|you)\s+need\b/.test(t) &&
      /\b(patient|member|benefit|detail|information|verify|verification|fields?)\b/.test(
        t,
      )) ||
    (/\b(found|located|have)\s+(?:the\s+)?(?:patient|member)\b/.test(t) &&
      /\b(how can i help|how may i help|what can i do for you|what can i help)\b/.test(
        t,
      ))
  );
}

/** True only when the TPA has invited benefit Q&A — never infer from them asking for coverage directly. */
export function mayAskBenefitFields(tpaBenefitQnaOpen: boolean): boolean {
  return tpaBenefitQnaOpen;
}

/** TPA asks why we are calling / purpose / what they can help with in that sense. */
export function userAsksPurposeOfCallOrOpening(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 3) return false;
  if (isTpaBenefitQnaHandoff(userSaid)) return false;
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
  if (field === 'history') {
    if (/\b(no|none|false|don'?t\s+have|never)\b/i.test(t)) return 'no';
    if (/\b(yes|yeah|yep|yup|true|have)\b/i.test(t)) return 'yes';
    return null;
  }
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
  return (
    /\d+|dollar|percent|%\s*\$/.test(transcript) ||
    /\b(no|none|false|yes|yeah|yep|yup|true)\b/i.test(transcript)
  );
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
  if (/\b(i'?d|i would)\s+like\s+to\s+verify\b/i.test(t)) return true;
  if (/\b(i'?m|i am)\s+(calling|here)\s+to\s+(verify|get|obtain)\b/i.test(t)) {
    return true;
  }
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
        ? `The patient's date of birth is ${ctx.patient.dobFormatted}.`
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

/** NATO phonetic words for letter-by-letter name spelling on insurance verification calls. */
const NATO_PHONETIC: Record<string, string> = {
  a: 'Alpha',
  b: 'Bravo',
  c: 'Charlie',
  d: 'Delta',
  e: 'Echo',
  f: 'Foxtrot',
  g: 'Golf',
  h: 'Hotel',
  i: 'India',
  j: 'Juliet',
  k: 'Kilo',
  l: 'Lima',
  m: 'Mike',
  n: 'November',
  o: 'Oscar',
  p: 'Papa',
  q: 'Quebec',
  r: 'Romeo',
  s: 'Sierra',
  t: 'Tango',
  u: 'Uniform',
  v: 'Victor',
  w: 'Whiskey',
  x: 'X-ray',
  y: 'Yankee',
  z: 'Zulu',
};

/** Spell text letter-by-letter using NATO phonetics (e.g. "J as in Juliet, O as in Oscar"). */
export function spellTextPhonetically(text: string): string {
  const parts: string[] = [];
  for (const char of text.trim()) {
    if (char === ' ') {
      parts.push('space');
      continue;
    }
    if (char === '-') {
      parts.push('hyphen');
      continue;
    }
    if (char === "'") {
      parts.push('apostrophe');
      continue;
    }
    const lower = char.toLowerCase();
    const word = NATO_PHONETIC[lower];
    if (word) {
      parts.push(`${char.toUpperCase()} as in ${word}`);
    }
  }
  return parts.join(', ');
}

export type SpellNameTarget =
  | 'patient_first'
  | 'patient_last'
  | 'patient_full'
  | 'subscriber_first'
  | 'subscriber_last'
  | 'subscriber_full';

/** TPA wants the name spelled out (often right after EVA gave the plain name). */
export function detectSpellNameRequest(userSaid: string): SpellNameTarget | null {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 3) return null;

  const spellIntent =
    /\b(spell|spelling|spelled)\b/.test(t) ||
    /\bspell\s+(it|that|this|the\s+name|out)\b/.test(t) ||
    /\b(can|could|would)\s+you\s+spell\b/.test(t) ||
    /\bplease\s+spell\b/.test(t) ||
    /\blet'?s?\s+spell\b/.test(t) ||
    /\bletter[\s-]by[\s-]letter\b/.test(t) ||
    /\bphonetic(ally)?\b/.test(t) ||
    /\bhow\s+do\s+you\s+spell\b/.test(t);

  if (!spellIntent) return null;

  // Not a patient/subscriber name spell request (e.g. member ID, NPI).
  if (
    /\b(member\s*id|npi|tax\s*id|ein|tin|dob|date\s+of\s+birth|birthday)\b/.test(
      t,
    ) &&
    !/\b(patient|subscriber|first\s+name|last\s+name|full\s+name|spell\s+(it|that|the\s+name))\b/.test(
      t,
    )
  ) {
    return null;
  }

  if (
    /\bsubscriber'?s?\s+first\s+name\b/.test(t) ||
    (/\bfirst\s+name\b/.test(t) && /\bsubscriber\b/.test(t))
  ) {
    return 'subscriber_first';
  }
  if (
    /\bsubscriber'?s?\s+last\s+name\b/.test(t) ||
    (/\blast\s+name\b/.test(t) && /\bsubscriber\b/.test(t))
  ) {
    return 'subscriber_last';
  }
  if (
    /\b(subscriber'?s?\s+(full\s+)?name|name\s+of\s+(the\s+)?subscriber)\b/.test(
      t,
    ) ||
    (/\bsubscriber\b/.test(t) && /\bname\b/.test(t))
  ) {
    return 'subscriber_full';
  }

  if (/\bpatient'?s?\s+first\s+name\b/.test(t)) return 'patient_first';
  if (/\bpatient'?s?\s+last\s+name\b/.test(t)) return 'patient_last';
  if (
    /\b(patient'?s?\s+(full\s+)?name|name\s+of\s+(the\s+)?patient)\b/.test(t)
  ) {
    return 'patient_full';
  }
  if (/\blast\s+name\b/.test(t)) return 'patient_last';
  if (/\bfirst\s+name\b/.test(t)) return 'patient_first';

  return 'patient_full';
}

export function answerSpellNameFromContext(
  target: SpellNameTarget,
  ctx: PatientCallContext | null,
): string | null {
  if (!ctx) return null;
  const notOnFile =
    'I am sorry, I do not have that on my end. Is there anything else I can share so we can continue?';

  let name: string | null = null;
  let label: string;
  switch (target) {
    case 'patient_first':
      name = ctx.patient.firstName;
      label = "The patient's first name is spelled";
      break;
    case 'patient_last':
      name = ctx.patient.lastName;
      label = "The patient's last name is spelled";
      break;
    case 'patient_full':
      name = ctx.patient.fullName;
      label = "The patient's name is spelled";
      break;
    case 'subscriber_first':
      name = ctx.subscriber.firstName;
      label = "The subscriber's first name is spelled";
      break;
    case 'subscriber_last':
      name = ctx.subscriber.lastName;
      label = "The subscriber's last name is spelled";
      break;
    case 'subscriber_full':
      name = ctx.subscriber.fullName;
      label = "The subscriber's name is spelled";
      break;
    default:
      return null;
  }

  const trimmed = name?.trim();
  if (!trimmed) return notOnFile;
  return `${label}: ${spellTextPhonetically(trimmed)}.`;
}

/** Identity or phonetic spell reply from cached context (spell takes priority over plain name). */
export function resolveIdentityDirectReply(
  userSaid: string,
  ctx: PatientCallContext | null,
): string | null {
  if (!ctx) return null;
  const spellAsk = detectSpellNameRequest(userSaid);
  if (spellAsk) {
    return answerSpellNameFromContext(spellAsk, ctx);
  }
  const identityAsk = detectIdentityAsk(userSaid);
  if (identityAsk) {
    return answerIdentityFromContext(identityAsk, ctx);
  }
  return null;
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

/** TPA needs time to look something up — EVA may say hold / take your time. */
export function isHoldPhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 10) return false;
  if (isTpaConfirmingStatedValue(text)) return false;
  return (
    /putting?\s+(?:the\s+)?call\s+on\s+hold|put\s+(?:me\s+)?on\s+hold|stay\s+on\s+(?:the\s+)?line/i.test(
      t,
    ) ||
    /\b(can|could)\s+you\s+(?:hold|stay\s+on|wait\s+on\s+(?:the\s+)?line)/i.test(
      t,
    ) ||
    /\b(just\s+)?(one|a)\s+moment\b/.test(t) ||
    /\blet\s+me\s+(check|look|pull|grab|get\s+that)\b/.test(t) ||
    /\bbear\s+with\s+me\b/.test(t) ||
    /\bi'?ll\s+(check|look\s+that\s+up|pull\s+that\s+up|be\s+right\s+back)\b/.test(
      t,
    ) ||
    /\bhold\s+(?:for\s+a\s+moment|on|please)\b/.test(t) ||
    /\bplease\s+hold\b/.test(t)
  );
}

/** Remove hold-style lines when the TPA did not ask to wait. */
export function stripInappropriateHoldReply(
  toSpeak: string,
  userSaid: string,
): string {
  if (!toSpeak?.trim() || isHoldPhrase(userSaid)) return toSpeak;
  const t = toSpeak.trim();
  if (
    /\b(take your time|i'?ll hold|sure,?\s*(i'?ll\s+)?hold|wait\s+on\s+the\s+line)\b/i.test(
      t,
    )
  ) {
    return pickBriefAcknowledgement();
  }
  return toSpeak;
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