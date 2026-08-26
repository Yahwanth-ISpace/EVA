import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ModelParams } from '@google/generative-ai';
import type { PatientCallContext } from '../verification/verification.service';
import { VerificationService } from '../verification/verification.service';
import { scrubRawBenefitValue } from '../twilio/media-stream/guardrails';

/** Stable Pro model for conversation, extraction, and classification. */
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';

/**
 * Gemini 2.5+ can use an internal "thinking" step before responding, which adds latency.
 * `thinkingBudget: 0` turns it off where the API supports it (often Flash / Flash-Lite; Pro may ignore or error — then set GEMINI_THINKING_BUDGET=default).
 * @see https://ai.google.dev/gemini-api/docs/thinking
 */
function parseGeminiThinkingBudget(): number | null {
  const raw = process.env.GEMINI_THINKING_BUDGET?.trim();
  if (raw === undefined || raw === '') return 0;
  const lower = raw.toLowerCase();
  if (
    lower === 'default' ||
    lower === 'model' ||
    lower === 'auto' ||
    lower === 'unset'
  ) {
    return null;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Optional hints from the voice stream handler (TPA-led verification, purpose flag). */
export type ConversationCallHints = {
  /** Rep has confirmed after DOB (or no DB patient — handler may set true). */
  patientIdentityReadyForBenefits: boolean;
  purposeStated: boolean;
  /** TPA invited benefit-specific Q&A (e.g. what to know about the patient). */
  tpaBenefitQnaOpen: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private gemini: GoogleGenerativeAI;

  constructor(
    @Inject(forwardRef(() => VerificationService))
    private readonly verificationService: VerificationService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('❌ Missing GEMINI_API_KEY environment variable.');
    }

    this.gemini = new GoogleGenerativeAI(apiKey);

    parseGeminiThinkingBudget();
  }

  /**
   * Model init for all Gemini calls — disables thinking by default to reduce voice-call latency.
   * `thinkingConfig` is supported by the API but not yet on SDK `GenerationConfig` types — cast to ModelParams.
   */
  private getGeminiModelInit(): ModelParams {
    const thinkingBudget = parseGeminiThinkingBudget();
    if (thinkingBudget === null) {
      return { model: GEMINI_MODEL };
    }
    return {
      model: GEMINI_MODEL,
      generationConfig: {
        thinkingConfig: { thinkingBudget },
      },
    } as ModelParams;
  }

  /**
   * Generate a short conversational reply to the user (e.g. for voice/streaming).
   * EVA is a customer care agent from the dental practice calling to get patient benefit details from the insurance company.
   */
  /**
   * @param patientInfo Optional patient (payee) details from the DB; when provided, EVA can answer questions about patient name, DOB, SSN/tax ID.
   */
  public async replyToUser(
    userMessage: string,
    patientInfo?: {
      firstName: string;
      lastName: string;
      fullName: string;
      dobFormatted: string | null;
      ssn: string | null;
    } | null,
    orderedFields?: string[] | null,
  ): Promise<string> {
    const model = this.gemini.getGenerativeModel(this.getGeminiModelInit());
    const fieldsList = (
      orderedFields?.length ? orderedFields : AiService.INSURANCE_FIELDS
    ).join(', ');
    const patientBlock = patientInfo
      ? `
  PATIENT DETAILS (from database — use only when they ask): Full name: ${patientInfo.fullName}. Date of birth: ${patientInfo.dobFormatted ?? 'not provided'}. ${patientInfo.ssn ? `SSN/tax ID available; disclose only when they specifically ask for SSN or tax ID (e.g. "last four is ..." or full if required).` : 'No SSN on file.'}
`
      : '';
    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company (or their representative) to obtain patient benefit details — ${fieldsList}.
${patientBlock}
  CORE PERSONALITY:
  - Professional, polite, patient, and empathetic. You represent the dental facility and need the other party's help to get benefit information.
  - If they ask how you are, respond naturally and briefly (e.g., "I'm doing well, thank you! How about you?").
  - If they say you sound harsh or robotic, apologize warmly (e.g., "I'm so sorry — I just want to make sure we get the details right for our patient. I appreciate your help.").
  - Never admit to being an AI or a bot. If they joke that you sound like a bot: a brief natural laugh in words ("Ha!") then say you are a representative from Went Dentals — not a machine.
  - Keep replies to 1-2 short sentences. No markdown.

  END-OF-CALL CONTEXT (when this is used after we've already said goodbye): Answer their question briefly in one short sentence. Do NOT repeat the full intro ("I'm Reena from Went Dentals", "I want to verify the patient details", "hoping you can help"). NEVER say "That's great to hear. I'm calling to verify benefits for a patient, [name]." unless they explicitly asked "How can I help you?" or "How can I help?" — and even then prefer a short "I'm calling to verify benefits for a patient. Is there anything else you need?"

  User (person on the insurance side) said: ${userMessage}
  Reply:`;

    const result = await model.generateContent(prompt);
    const reply =
      result.response.text()?.trim() ??
      "I'm sorry, I missed that. What was that?";
    return reply;
  }

  /**
   * Persist extracted call verification details to the database when the call ends.
   * Called by the media-stream handler as soon as the call is ended.
   * When verificationRequirementId is set, extracted can be any record of field names → values.
   */
  async saveCallVerification(
    payeeId: string,
    extracted:
      | Record<string, string | null | undefined>
      | {
          coverage?: string | null;
          deductible?: string | null;
          copay?: string | null;
          validity?: string | null;
        },
    transcriptToAppend?: string,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ) {
    this.verificationService.parseTranscriptForVerification(
      payeeId,
      extracted,
      transcriptToAppend,
      verificationRequirementId,
      appointmentId,
    );
    return this.verificationService.verifyFromExtractedCall(
      payeeId,
      extracted,
      transcriptToAppend,
      verificationRequirementId,
      appointmentId,
    );
  }

  /** Default insurance fields when no VerificationRequirement is used (order preserved) */
  public static readonly INSURANCE_FIELDS = [
    'coverage',
    'deductible',
    'copay',
    'validity',
  ] as const;

  /** Ordered field names to use for verification (from DB or default) */
  public static getOrderedFields(orderedFields?: string[] | null): string[] {
    return orderedFields?.length
      ? orderedFields
      : [...AiService.INSURANCE_FIELDS];
  }

  /** Fallback benefit questions when the appointment payload has no `verificationFields`. */
  private static readonly LEGACY_VERBATIM_BENEFIT_QUESTIONS: Record<
    string,
    string
  > = {
    coverage: 'What is the basic coverage?',
    deductible: 'Can you provide the deductible?',
    copay: 'What is the copay?',
    validity: 'What is the validity of the insurance?',
  };

  private fieldQuestionMapFromContext(
    ctx: PatientCallContext | null | undefined,
  ): Record<
    string,
    {
      question: string;
      rule?: string;
    }
  > {
    if (!ctx?.verificationSteps?.length) return {};

    const map: Record<string, { question: string; rule?: string }> = {};

    for (const step of ctx.verificationSteps) {
      if (!step.field) continue;

      map[step.field] = {
        question: step.question?.trim() ?? '',
        rule: step.rule?.trim() ?? '',
      };
    }

    return map;
  }

  /** Exact line EVA should speak for a benefit field (from appointment payload when present). */
  private verbatimBenefitQuestion(
    field: string | null | undefined,
    fieldQ: Record<
      string,
      {
        question: string;
        rule?: string;
      }
    >,
  ): string {
    if (!field) return '';

    const fromPayload = fieldQ[field]?.question?.trim();

    if (fromPayload) return fromPayload;

    return AiService.LEGACY_VERBATIM_BENEFIT_QUESTIONS[field] ?? String(field);
  }

  private hasValue(v: string | null | undefined): boolean {
    return v != null && String(v).trim().length > 0;
  }

  /** True when the field key refers to insurance group name (not group number). */
  public static isGroupNameField(field: string): boolean {
    const f = field
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    return f === 'groupname' || f === 'insurancegroupname';
  }

  /** True when the spoken question is asking for group name (not group number). */
  public static isGroupNameQuestion(question: string): boolean {
    const q = question.trim().toLowerCase();
    return q.includes('group name') && !q.includes('group number');
  }

  /**
   * Pull the group name token from a conversational answer, e.g.
   * "That is My India." → "My India", "That would be My india" → "My India".
   */
  public extractGroupNameFromAnswer(raw: string): string {
    let v = String(raw ?? '')
      .trim()
      .replace(/[.!?]+$/g, '')
      .trim();
    v = v
      .replace(
        /^(?:yes|no|yeah|okay|so|well|um|uh|it\s+is|it's|that\s+is|that's|that\s+would\s+be|that\s+would|this\s+is|the\s+group\s+name\s+is|group\s+name\s+is|the\s+name\s+is|name\s+is)[,\s:]+/gi,
        '',
      )
      .trim();
    v = v
      .replace(
        /^(?:that\s+is|that's|that\s+would\s+be|it\s+is|it's)[,\s:]+/gi,
        '',
      )
      .trim();
    if (!v) return '';
    return v
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  /** Returns missing field names in required order (uses orderedFields or default four) */
  private getMissingFields(
    state: Record<string, string | null | undefined>,
    orderedFields?: string[] | null,
  ): string[] {
    const fields = AiService.getOrderedFields(orderedFields);
    const missing: string[] = [];
    for (const f of fields) {
      if (!this.hasValue(state[f])) missing.push(f);
    }
    return missing;
  }

  private allFieldsCollected(
    state: Record<string, string | null | undefined>,
    orderedFields?: string[] | null,
  ): boolean {
    return this.getMissingFields(state, orderedFields).length === 0;
  }

  /** First missing field in order; null if all collected */
  private getNextFieldToAsk(
    state: Record<string, string | null | undefined>,
    orderedFields?: string[] | null,
  ): string | null {
    const missing = this.getMissingFields(state, orderedFields);
    return missing.length > 0 ? missing[0] : null;
  }

  /**
   * Classify whether the user is answering the current question or interrupting (correcting a value / asking something else).
   * Context: benefits verification call — dental practice (EVA) is speaking with the insurance company to get patient benefit details.
   */
  public async classifySegment(
    transcript: string,
    currentQuestion: string,
    orderedFields?: string[] | null,
  ): Promise<'answer' | 'interruption'> {
    const model = this.gemini.getGenerativeModel(this.getGeminiModelInit());
    const fieldsList = (
      orderedFields?.length ? orderedFields : AiService.INSURANCE_FIELDS
    ).join(', ');
    const prompt = `You are classifying a short voice transcript from a patient benefit verification call. The caller (EVA) is from health care provider; the other party is from the insurance company and is providing benefit details (${fieldsList}).

Current question EVA asked: "${currentQuestion}"

What the person on the insurance side just said: "${transcript}"

Are they:
- Answering that question (giving a benefit value: ${fieldsList}, or similar)? Reply: answer
- Interrupting to correct a value they said before (e.g. "actually copay is 25% not 60%", "please update deductible to 500") or asking something else (e.g. who is the patient, what do you need)? Reply: interruption

Reply with ONLY one word: answer OR interruption`;

    const result = await model.generateContent(prompt);
    const text = (result.response.text()?.trim() ?? '').toLowerCase();
    return text.includes('interruption') ? 'interruption' : 'answer';
  }

  /**
   * Handle user interruption: parse corrections (e.g. "copay is 25% not 60%") or identity/off-topic questions; return updates + reply to speak.
   */
  /**
   * @param patientInfo Optional patient (payee) details from the DB; when provided, EVA can answer questions about patient name, DOB, SSN/tax ID.
   */
  public async handleInterruption(
    userMessage: string,
    currentExtracted:
      | Record<string, string | null>
      | {
          coverage: string | null;
          deductible: string | null;
          copay: string | null;
          validity: string | null;
        },
    patientInfo?: {
      firstName: string;
      lastName: string;
      fullName: string;
      dobFormatted: string | null;
      ssn: string | null;
    } | null,
    orderedFields?: string[] | null,
  ): Promise<{ updates: Record<string, string | null>; reply: string }> {
    const model = this.gemini.getGenerativeModel(this.getGeminiModelInit());
    const fieldsList = (
      orderedFields?.length ? orderedFields : AiService.INSURANCE_FIELDS
    ).join(', ');
    const current = JSON.stringify(currentExtracted, null, 0);
    const patientBlock = patientInfo
      ? `
Patient details (from database — use when they ask): Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. ${patientInfo.ssn ? 'SSN/tax ID available; disclose when they ask for SSN or tax ID.' : 'No SSN on file.'}
`
      : '';
    const prompt = `You are handling an interruption during a patient benefit verification call. You are Reena, a customer care representative from Went Dentals, speaking with the insurance company to obtain benefit details (${fieldsList}) for a patient. Be professional, polite, and patient. Never say you are a bot or AI.
${patientBlock}
Current benefit data we have: ${current}

What the person on the insurance side just said: "${userMessage}"

- If they ask what we have for a field (recall): set "updates" to {} and reply with the value only — no "Are we good?" or similar. If we don't have it: "I don't have that one yet."
- When they confirm (yes / yeah it's clear / we're good): reply "Thanks." then ask for the next missing field with "Can I get the [field]?" or "May I have the [field]?" only. Never say "I don't have that on my end" or "please provide the details" for benefit fields (${fieldsList}).
- If they ask to repeat or "what was the question?": set "updates" to {} and reply with ONLY a varied phrase for the field (e.g. "Can I get the deductible?"). Do NOT add "Are we good?" or "Is the value correct?"
- If they correct a value: put ONLY that field in "updates" with the new value. Reply "Got it. So the [field] is [value], right?" Do NOT ask for the next field in the same turn. Wait for yes; then ask for next field.
- If they ask "why do you need that?": set "updates" to {} and reply "We're verifying benefit details for our patient." Do NOT add "Are we good?" or "Is the value correct?"
- If they complain about your tone or ask a general question, answer politely and briefly, then offer to continue.
- If they ask for information we do NOT have (e.g. policy number, member ID): set "updates" to {} and reply "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?"
- If they ask who you are or to verify yourself: set "updates" to {} and reply "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details. I appreciate your help."
- If they provide a benefit value (number/dollar/percent) without correcting: acknowledge "Got it, thanks." / "Thanks." / "Okay, thank you." and ask for the next field if needed. Do NOT re-ask the same field or say "Are we good?"
- For any other question, set "updates" to {} and give a brief, professional reply, then return to the next field if needed.

Respond with ONLY a single JSON object. No markdown. Format: {"updates": {} or {"copay": "25%"}, "reply": "Short spoken reply"}

Examples (use current data to fill [value] and next field):
- "Who is this?" → {"updates": {}, "reply": "I'm Reena from Went Dentals. I'm calling to verify patient benefit details. I appreciate your help."}
- "What did you have for deductible?" → {"updates": {}, "reply": "I have the deductible as 500 dollars."} (recall — do NOT ask for next field in same turn)
- When they say "yes" / "yeah it's clear" → {"updates": {}, "reply": "Thanks. Can I get the next field?" or "Can I get the validity?"}
- "Can you repeat the question?" → {"updates": {}, "reply": "Can I get the deductible?"} (varied phrase only; do NOT add "Are we good?")
- "Actually copay is 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Got it. So the copay is 25%, right?"} (do NOT ask for next field in same turn; wait for yes)
- "Why do you need that?" → {"updates": {}, "reply": "We're verifying benefit details for our patient."} (do NOT add "Are we good?")`;

    const result = await model.generateContent(prompt);
    let jsonString = result.response.text()?.trim() ?? '{}';
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/```json|```/gi, '').trim();
    }
    try {
      const parsed = JSON.parse(jsonString);
      const updates = parsed.updates ?? {};
      const reply =
        typeof parsed.reply === 'string' && parsed.reply.trim()
          ? parsed.reply.trim()
          : 'Got it.';
      return { updates, reply };
    } catch {
      return { updates: {}, reply: 'Got it. I noted that.' };
    }
  }

  /**
   * Conversational turn: given what the user said and what we have so far,
   * return the next thing for the bot to say and any extracted field updates.
   * Used for the streaming flow: bot speaks → user speaks → silence → process → bot responds.
   * EVA is Reena from Went Dentals; purpose is to verify patient benefits. Never say virtual bot.
   * All four fields (coverage, deductible, copay, validity) must be collected; general queries are answered briefly then flow resumes.
   */
  public async getNextConversationTurn(
    transcript: string,
    currentExtracted:
      | Record<string, string | null>
      | {
          coverage: string | null;
          deductible: string | null;
          copay: string | null;
          validity: string | null;
        },
    patientInfo?: {
      firstName: string;
      lastName: string;
      fullName: string;
      dobFormatted: string | null;
      ssn: string | null;
    } | null,
    /** When set, the user may have just resumed from hold; we were asking for this field. Treat their reply as the value for this field, or if they ask "what do you need?" say "What is the [lastAskedField]?" only. */
    lastAskedField?: string | null,
    /** Ordered list of verification field names (from VerificationRequirement or default). */
    orderedFields?: string[] | null,
    callHints?: ConversationCallHints | null,
    /**
     * Pre-loaded patient / subscriber / payer / provider / office context plus `verificationSteps`
     * (exact benefit questions from the appointment payload).
     */
    callContext?: PatientCallContext | null,
  ): Promise<{
    nextMessage: string;
    extractedUpdates: Record<string, string | null>;
    endCall?: boolean;
  }> {
    const tr = typeof transcript === 'string' ? transcript.trim() : '';
    if (
      !tr ||
      tr === 'User did not respond or was inaudible.' ||
      tr === 'User did not respond or was inaudible'
    ) {
      return { nextMessage: '', extractedUpdates: {}, endCall: false };
    }

    const identityCleared =
      callHints?.patientIdentityReadyForBenefits === true ||
      patientInfo === null ||
      patientInfo === undefined;
    const benefitQnaAllowed =
      identityCleared &&
      (callHints?.tpaBenefitQnaOpen === true ||
        patientInfo === null ||
        patientInfo === undefined);

    const hintsBlock = `
INTERNAL CALL STATE (never read aloud verbatim):
- purpose_already_stated: ${callHints?.purposeStated === true ? 'YES — DO NOT say "I am calling..." / "I need benefit details" / any purpose line again in this turn or any future turn. Answer what they just asked, directly, using the cheat-sheet.' : 'no — on the first opening question you may say purpose once, briefly.'}
- patient_identity_cleared: ${identityCleared ? 'yes — TPA identity verification is far enough along that you may answer identity questions from the cheat-sheet.' : 'no — wait for TPA identity questions first; answer name/DOB/NPI when asked with no confirmation question afterward'}
- benefit_qna_allowed: ${benefitQnaAllowed ? 'yes — you MAY ask the next missing benefit item using the exact verbatim question when appropriate.' : 'no — do NOT ask any benefit verification question yet (no coverage/deductible/copay/validity or custom benefit lines). Wait until the TPA asks what you need to know about the patient or similar; until then only intro, purpose (once), identity answers, brief small talk, and neutral acknowledgements.'}
`;

    const model = this.gemini.getGenerativeModel(this.getGeminiModelInit());
    const fields = AiService.getOrderedFields(orderedFields);
    const current = JSON.stringify(currentExtracted);

    const nextFieldToAsk = this.getNextFieldToAsk(
      currentExtracted,
      orderedFields,
    );
    const fieldsList = fields.join(', ');
    const numFields = fields.length;
    const fieldQ = this.fieldQuestionMapFromContext(callContext);
    const firstFieldName = nextFieldToAsk ?? fields[0];
    const firstFieldQuestion = this.verbatimBenefitQuestion(
      firstFieldName,
      fieldQ,
    );
    const nextFieldQuestion = nextFieldToAsk
      ? this.verbatimBenefitQuestion(nextFieldToAsk, fieldQ)
      : '';
    const lastFieldQuestion =
      lastAskedField && fields.includes(lastAskedField)
        ? this.verbatimBenefitQuestion(lastAskedField, fieldQ)
        : '';

    const oneFieldRule =
      nextFieldToAsk === null
        ? `All ${numFields} fields (${fieldsList}) are collected. TWO-STEP ENDING FLOW (never skip step 1): (1) If the user JUST GAVE a value in this turn (completing the last field): say "That's all I have. Thank you for your help." and set endCall FALSE — do NOT say "Have a good day" yet. (2) On the NEXT turn, if the user said thank you / welcome / you're welcome / yes / okay / that's all / we're done / goodbye / I'm good / have a good day / nothing else: say "You're welcome. Have a wonderful day." and set endCall TRUE. (3) If the user asked a question AFTER we said "That's all I have": answer it completely from the call context (or briefly if not in context), then ask "Anything else?" and set endCall FALSE; when they say yes/thank you in a later turn, say "You're welcome. Have a wonderful day." and set endCall TRUE. Do NOT say your name, company, or repeat the introduction. Do NOT collapse steps 1 and 2 into a single turn.`
        : `BENEFIT-COLLECTION RULE — if benefit_qna_allowed is no, do NOT ask benefit fields. Answer identity from CHEAT-SHEET; short filler "okay" → "Thank you." or "Thanks." (never "Of course." or "Understood." unless they are re-confirming a value you stated). Only when benefit_qna_allowed is YES, ask ONE benefit item (handler may prefix "I would need" on first field only). If they confirm a value ("is it 1020 as I said?"): "Yes, that's correct." or "Yes, it is." — not "Of course." When TPA asks what patient/details/fields you need, or says they found the patient and asks how they can help: ask the first missing benefit field (verbatim). Hold/wait phrases ("one moment", "hold", "let me check") ONLY then: "Sure, I'll hold. Take your time." extractedUpdates: ONLY the bare value (e.g. "80%", "$500", "21st Dec 2028") — never the full TPA sentence. Keep nextMessage under 25 words.`;

    const patientBlock = patientInfo
      ? `
Patient info (database — disclose only when the TPA/rep ASKS): Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. ${patientInfo.ssn ? `SSN/tax ID: only if they ask for SSN or tax ID.` : 'No SSN on file.'}

TPA-LED PATIENT VERIFICATION — CRITICAL:
- NEVER volunteer patient name or date of birth in your first reply or on "How can I help?" / "Hello" alone. The insurance rep asks; you answer. Do NOT recite name and DOB proactively.

PURPOSE OF CALL — SAY IT ONCE, THEN MOVE ON (this is the single biggest source of EVA sounding like a bot; follow strictly):
- If purpose_already_stated is NO and the TPA asked an opening question ("How can I help?", "What can I do for you?", "Why are you calling?", "Reason for your call?"): Your nextMessage must be EXACTLY this one sentence (no coverage, deductible, copay, validity, or other field names; no second sentence): "I need a few benefit details of a patient." extractedUpdates {}.
- If purpose_already_stated is YES: NEVER say "I am calling to verify...", "I'm calling to get patient details", "I need benefit details", "I'm here to verify", "we're looking to confirm", or ANY variant of the purpose sentence again. If the TPA asks purpose again, give ONE brief acknowledgement like "As I mentioned, just a few benefit details for our patient." and stop — do NOT re-list the reason, do NOT introduce yourself again.
- CRITICAL: The purpose sentence is a FILLER. Say it once at the start of the call only. After that, respond to what the TPA ACTUALLY asked. If they asked for NPI / Tax ID / member ID / patient DOB / patient name / provider name / subscriber name / subscriber DOB — use the CHEAT-SHEET below and answer directly. Do NOT pad the answer with "I am calling to verify..." — just give the value.
- If the TPA says something unclear / inaudible: ask them to repeat the SPECIFIC item ("Can you repeat the member ID?" / "Sorry, can you say that once again?"). Do NOT fall back to the purpose sentence.
- OPENING / GREETING ("Hello" / "Hi" alone, nothing asked): One short greeting acknowledgement is fine; do NOT proactively state purpose unless they asked. Do NOT ask for ${firstFieldName} until benefit_qna_allowed is YES (see INTERNAL CALL STATE). extractedUpdates {}.
- WHEN they ask for patient name / "what is the patient's name" / full name (without asking to spell): Answer ONLY with the name, e.g. "The patient is ${patientInfo.fullName}." — English only. Do NOT give DOB unless they also asked for DOB in this turn. Do NOT ask for benefit fields in the same turn. extractedUpdates {}.
- WHEN they ask to spell the name ("spell it", "spell it out", "letter by letter", "phonetically"): Use NATO phonetics for each letter, e.g. "J as in Juliet, O as in Oscar, H as in Hotel, N as in November" — say "space" between first and last name. Do NOT repeat the plain name first unless they asked for both in one turn. extractedUpdates {}.
- WHEN they ask for DOB / date of birth / birthday: Answer with DOB only in English, e.g. "The date of birth is ${patientInfo.dobFormatted ?? 'not provided'}." — no confirmation question ("Does that match?", "Are we good?", etc.). Do NOT ask for ${firstFieldName} until benefit_qna_allowed is YES. extractedUpdates {}.
- BENEFIT FIELDS (${fieldsList}): HARD RULE — do NOT ask for any benefit field until benefit_qna_allowed is YES (see INTERNAL CALL STATE). If benefit_qna_allowed is NO, your reply must NOT contain any of those field names as a question.
   • If the TPA replies with a short "okay" / "alright" / "sure" / "got it" after identity: "Thank you." or "Thanks." — not "Of course." or "Understood." (use "Understood." only when re-confirming a value they stated) — unless benefit_qna_allowed is YES.
   • If the TPA explicitly opens benefit Q&A ("what would you like to know about the patient", "what fields/benefits/details do you need", etc.): ONLY THEN (benefit_qna_allowed YES) ask the first missing benefit — the voice system may say "I would need …" once, then the verbatim question: """${firstFieldQuestion}""".
   • If benefit_qna_allowed is NO and the TPA says anything else that is not a question: answer if needed, otherwise stay brief. Never re-state name+DOB in full unless they ask again.
   • extractedUpdates {} unless they clearly give a benefit value — then extract it.
- EXAMPLES while benefit_qna_allowed is NO:
   • TPA "Okay." → EVA: "Thank you." (NOT a benefit question unless benefit_qna_allowed is YES)
   • TPA "Alright, go ahead." → EVA: brief ack only (NOT a benefit question yet) unless benefit_qna_allowed just flipped to YES in this turn.
   • TPA "Sure, what do you need?" → If that phrase is only about purpose, give purpose once; do NOT ask benefit fields until benefit_qna_allowed is YES.
   • TPA "Thanks." after EVA gave DOB → EVA: "Thanks." or brief ack — benefit question only when benefit_qna_allowed is YES (TPA asked what you need).
- WHO is calling: ONLY if they ask "who is this?" / "identify yourself" / "who are you": "I'm Reena from Went Dentals. I'm calling to get benefit details." extractedUpdates {}.
- SSN / tax ID: ${patientInfo.ssn ? 'Give only what they ask for. No confirmation question. Do not ask benefit fields same turn.' : `"I don't have that on file."`}
- WHAT do you need / benefit topic: If benefit_qna_allowed is YES, ask first missing benefit field only. If NO, do not ask benefit fields — say you are standing by for their verification steps or for them to tell you what they need on benefits for this patient. extractedUpdates {}.
`
      : `
- No patient on file: The TPA must lead; collect name and DOB from the rep when they offer or ask what you have. Before benefit fields, agree on identity. Opening: one sentence purpose in English only. extractedUpdates {}.
- If we are collecting fields, do NOT repeat long intros. extractedUpdates {}.
`;

    const recallBlock = `
NO CONFIRMATION AFTER IDENTITY — Never append "Does that match your records?", "Is that correct?", "Are we good?", or similar after patient name, DOB, NPI, member ID, or recall of a benefit value. Give the value and stop (or wait for the TPA's next question).
- When they GIVE a value (number/amount) for a field: extract it. If that was the LAST missing field, say "That's all I have. Thank you for your help." endCall FALSE. Otherwise acknowledge ("Got it, thanks." / "Thanks." / "Noted.") then ask the NEXT field verbatim. Never add "Are we good?" after a normal value.
- TWO-STEP CLOSING (strict): (1) last field collected → "That's all I have. Thank you for your help." endCall FALSE. (2) NEXT turn when they thank you / goodbye → "You're welcome. Have a wonderful day." endCall TRUE.
- Value after hold: say "So the [field] is [value], right?" then wait for yes; then ask next field. extractedUpdates {}.
- When they ask for RECALL ("what is the [field]?"): give the stored value only — no confirmation question. Do NOT ask for next field same turn. extractedUpdates {}.
- When they correct a value: put NEW value in extractedUpdates, say "Got it. So the [field] is [value], right?" Wait for yes then ask next field.
- Benefit collection starts ONLY when benefit_qna_allowed is YES (TPA asked what fields/benefits/details you need). Do NOT ask benefit fields after DOB alone.
`;

    const afterResumeBlock =
      lastAskedField && fields.includes(lastAskedField)
        ? `
AFTER-HOLD CONTEXT: They just came back from hold. We were asking for "${lastAskedField}" ONLY.
- If they now gave a value (number, dollar, percent): put it in extractedUpdates for "${lastAskedField}" ONLY. Do NOT put it in any other field. Then VERIFY with acknowledgment: say "So the ${lastAskedField} is [value], right?" or "Just to confirm, the value for this field is [value], correct?" Do NOT ask for the next field in this turn. Wait for them to say "yes" in the next turn; only then ask for the next field.
- When they CONFIRM after this ("yes" / "correct" / "that's right" / "yeah"): then say "Thanks." and ask for the next missing field using ONLY that field's exact question from BENEFIT QUESTIONS (verbatim). extractedUpdates {}.
- If they ask what we need or what was the question: speak ONLY this exact question verbatim: """${lastFieldQuestion}""". set extractedUpdates {}.
- If they did not give a value (inaudible/unclear): speak ONLY this exact question verbatim again: """${lastFieldQuestion}""" and set extractedUpdates {}.
`
        : '';

    // Pre-loaded identity cheat-sheet: direct, ready-to-speak answers for every TPA
    // verification question. The model should simply quote the value under "ANSWER:" — no
    // reasoning required. Keeps EVA's reply latency at "repeat a string" speed.
    const formatKnown = (v: string | null | undefined): string =>
      v && String(v).trim() ? String(v).trim() : '—';
    const notOnFileLine =
      '"I am sorry, I do not have that on my end. Is there anything else I can share so we can continue?"';
    const callContextBlock = callContext
      ? `
PRE-LOADED IDENTITY CHEAT-SHEET (already fetched from our records — do NOT say "let me check", do NOT ask us for these, just answer directly when the TPA asks):

PATIENT
- First name: ${formatKnown(callContext.patient.firstName)}
- Last name:  ${formatKnown(callContext.patient.lastName)}
- Full name:  ${formatKnown(callContext.patient.fullName)}
- DOB:        ${formatKnown(callContext.patient.dobFormatted)}
- SSN:        ${callContext.patient.ssn ? 'available (share only if they specifically ask for SSN or tax ID of the patient)' : '—'}

SUBSCRIBER (policy holder — same as patient unless noted)
- First name: ${formatKnown(callContext.subscriber.firstName)}
- Last name:  ${formatKnown(callContext.subscriber.lastName)}
- Full name:  ${formatKnown(callContext.subscriber.fullName)}
- DOB:        ${formatKnown(callContext.subscriber.dobFormatted)}

MEMBER / INSURANCE
- Member ID:     ${formatKnown(callContext.memberId)}
- Payer / plan:  ${formatKnown(callContext.payer?.companyName)} ${callContext.payer?.planName ? '— ' + callContext.payer.planName : ''}
- Group name:    ${formatKnown(callContext.payer?.groupName)}
- Group number:  ${formatKnown(callContext.payer?.groupNumber)}

PROVIDER (rendering / treating)
- Name:          ${callContext.provider ? 'Dr. ' + formatKnown(callContext.provider.fullName) : '—'}
- Specialty:     ${formatKnown(callContext.provider?.specialty)}
- NPI:           ${formatKnown(callContext.provider?.npi)}
- Billing NPI:   ${formatKnown(callContext.provider?.billingNpi ?? callContext.provider?.npi)}
- Tax ID (EIN):  ${formatKnown(callContext.provider?.taxId)}

OFFICE
- Office name:   ${formatKnown(callContext.office?.name)}
- City / state:  ${callContext.office ? callContext.office.city + ', ' + callContext.office.state : '—'}

HOW TO ANSWER EACH TPA VERIFICATION QUESTION (answer in ONE short English sentence, then stop — do NOT ask a benefit field in the same turn; wait for them to ask the next identity question):
1. "What is the provider / billing provider NPI?" → ${callContext.provider?.npi ? `"The provider NPI is ${callContext.provider.npi}."` : notOnFileLine} If they specifically said "billing provider NPI" and it differs: ${callContext.provider?.billingNpi && callContext.provider.billingNpi !== callContext.provider.npi ? `"The billing provider NPI is ${callContext.provider.billingNpi}."` : 'give the same NPI.'} extractedUpdates {}.
2. "What is the provider / billing provider Tax ID?" → ${callContext.provider?.taxId ? `"The provider tax ID is ${callContext.provider.taxId}."` : notOnFileLine} extractedUpdates {}.
3. "What is the member ID?" → ${callContext.memberId ? `"The member ID is ${callContext.memberId}."` : notOnFileLine} extractedUpdates {}.
4. "What is the patient date of birth / DOB?" → ${callContext.patient.dobFormatted ? `"The patient's date of birth is ${callContext.patient.dobFormatted}."` : notOnFileLine} No confirmation question. extractedUpdates {}.
5. "What is the patient's first name / last name / name?" → Answer with ONLY the part they asked for: first = "${callContext.patient.firstName}", last = "${callContext.patient.lastName}", full = "${callContext.patient.fullName}". If they asked to spell it / spell it out / letter by letter / phonetically: NATO phonetics only (e.g. "M as in Mike, A as in Alpha, …"; say "space" between name parts). extractedUpdates {}.
6. "Who is the provider / what is the provider name / rendering / treating provider?" → ${callContext.provider ? `"The treating provider is Dr. ${callContext.provider.fullName}."` : notOnFileLine} extractedUpdates {}.
7. "What is the subscriber DOB / date of birth?" → ${callContext.subscriber.dobFormatted ? `"The subscriber's date of birth is ${callContext.subscriber.dobFormatted}."` : notOnFileLine} extractedUpdates {}.
8. "What is the subscriber's first name / last name / name?" → Answer with ONLY the part they asked for: first = "${callContext.subscriber.firstName}", last = "${callContext.subscriber.lastName}", full = "${callContext.subscriber.fullName}". extractedUpdates {}.

CRITICAL — For any identity question above:
- Answer DIRECTLY from the cheat-sheet. Never say "let me check", "one moment", or "I need to look that up" — the data is already in front of you.
- One piece of information per turn. Do NOT volunteer other identity fields they did not ask for.
- After answering an identity question, do NOT jump straight to asking for a benefit field in the SAME turn unless benefit_qna_allowed is YES. Let the TPA move the verification forward; when they open benefit Q&A and benefit_qna_allowed is YES, THEN ask the first missing benefit field.
- If a field on the cheat-sheet is "—" (missing), say: ${notOnFileLine} extractedUpdates {}.
`
      : `
PRE-LOADED IDENTITY CHEAT-SHEET: (no patient appointment context on file — TPA will lead identity verification; answer only when they give you the value, otherwise say ${notOnFileLine})
`;

    const benefitQuestionsBlock =
      callContext?.verificationSteps?.length &&
      callContext.verificationSteps.some((s) => s.question?.trim())
        ? `
BENEFIT QUESTIONS — speak EXACTLY one line per field below (verbatim). Keys (${fieldsList}) are for extraction only; do not invent new wording.
${callContext.verificationSteps
  .filter((s) => s.field && s.question?.trim())
  .map(
    (s) => `- (Field: ${s.field}) 

    Question: 
    ${s.question.trim()} 

    Rule:
    ${s.rule?.trim() || 'No additional rule.'}`,
  )
  .join('\n\n-----------------------------\n\n')}
`
        : '';

    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company to obtain patient benefit details: ${fieldsList}.

LANGUAGE — Speak ONLY American/English. Never respond in Spanish or any other language. Numbers and dates in English.

${hintsBlock}

CRITICAL — TPA leads patient identity: Do NOT proactively state patient name or DOB on greeting or "How can I help?" Wait until they ask; then answer briefly in English. Do NOT repeat name+DOB together unless they ask again. Once benefit collection has started, do not restart identity verification unless they ask.

CRITICAL — NO REPEATED OPENING: The live call flow is: TPA greets first; the voice system handles the first reply (e.g. "I'm doing great" when they ask how you are, then "I'm Reena — I'm calling from Went Dentals." without a second "Hi, I'm Reena"). NEVER say "please proceed with your verification questions" or push the rep to start verification — let them lead. NEVER repeat "Hi, this is Reena from Went Dentals" mid-call. If they ask who is calling: ONE short line ("I'm Reena from Went Dentals."). When they ask how you are: "I'm doing great, thank you!" only — no purpose or benefit fields in that turn.

STAY IN SYNC — Reply to what the user JUST said. One turn = one exchange.

PACE — Short sentences. Acknowledge values quickly; ask one thing at a time.

CONVERSATION FLOW:
- They ask DOB: give DOB only — no "Does that match?" or similar; no benefit field until benefit_qna_allowed is YES.
- They ask patient name: give name only; no benefit field until benefit_qna_allowed is YES.
- They ask what fields/benefits/details you need (benefit_qna_allowed YES): ask first missing benefit (handler may prefix "I would need …" once) using: """${firstFieldQuestion}""".
- "How can I help" / "what can I do for you": If purpose_already_stated is NO, say EXACTLY "I need a few benefit details of a patient." If already stated, brief ack only. Never echo the TPA's name ("Hi John"). extractedUpdates {}.
- Benefit values (${fieldsList}): extract, thank, ask next — only when benefit_qna_allowed is YES and missing fields.
- When all fields collected and user JUST GAVE the last value: "That's all I have. Thank you for your help." endCall FALSE. The NEXT turn, when the TPA says any of ("thank you" / "welcome" / "you're welcome" / "have a good day" / "bye" / "yes" / "okay"), reply "You're welcome. Have a wonderful day." and endCall TRUE.
- END-OF-CALL when all fields collected AND user thanks / goodbye: "Thank you for helping me with the verification. Have a great day." endCall TRUE.

ROLE & TONE:
- Professional, polite, patient — sound like a real billing representative focused on collecting benefit details for one patient. One thing per turn.
- If the TPA gives a calendar date for the patient that would still be in the future as a date of birth, say that cannot be right and ask them to repeat the date of birth clearly.
- Light chit-chat ("how was your day", weather, small talk): one short warm reply, then gently steer back to the benefit details you need from them for this patient. Never let small talk replace verification work.
- If they ask whether you are a bot / AI / robot / "are you real?": never confirm that. Start with a brief natural laugh in words ("Ha!" or "Oh!") then say something like: "Thanks for the compliment on my voice — I'm with Went Dentals as a representative for the provider, here for benefit verification."
- If they ask a substantive question ("What is that for?", "Why do you need it?"): one clear sentence, then continue the flow. extractedUpdates {}.
- If they ask you to hold / wait / need a moment to look something up: "Sure, I'll hold. Take your time." Otherwise do NOT say "take your time." extractedUpdates {}.
- Never say you are an AI, bot, automated system, or language model.

${patientBlock}
${callContextBlock}
${benefitQuestionsBlock}
${recallBlock}
${afterResumeBlock}

CROSS-QUESTIONING:
- Recall ("what is the [field]?"): give stored value only — no confirmation tag. extractedUpdates {}.
- "Can you repeat?" / "What was the question?" → verbatim BENEFIT QUESTIONS line for current field only. extractedUpdates {}.
- Corrections: "Got it. So the [field] is [value], right?" then wait for yes. extractedUpdates {}.
- "Why do you need that?" → "We're verifying benefit details for our patient." extractedUpdates {}.
- Identity (name/DOB/NPI): answer from cheat-sheet only — never add "Does that match your records?" or "Are we good?"

Data we have so far (use ONLY these values for recall — never invent or guess): ${current}
Explicit values (— means we do not have that field yet; never say "not collected" or "the field is not collected" to the user—just ask for the field): ${fields.map((f) => `${f} = ${(currentExtracted as Record<string, string | null>)[f] ?? '—'}`).join(', ')}.
We are currently asking for: ${nextFieldToAsk ?? 'nothing (all done)'}.

CRITICAL — SOURCE OF TRUTH: The "Data we have so far" and "Explicit values" above are what we have already collected. If a field shows a value (not —), we HAVE it. NEVER ask for that field again. ONLY ask for fields that show —. When asking for a missing benefit item, speak ONLY the exact question line for that field from BENEFIT QUESTIONS above (verbatim). If BENEFIT QUESTIONS is empty, ask using the fixed legacy lines only — never improvise from the field key. Reserve "I don't have that on my end" ONLY for things like policy number or member ID that we truly do not have.

What they just said (respond only to this): "${transcript}"
→ If they asked a question: answer it, then continue (e.g. ask for next field if needed). If they gave a value: extract it, acknowledge, ask for next field. If they confirmed (yes/thanks): say Thanks and ask for next field. If unclear/inaudible: ask to repeat for the current field only. Do not skip or answer something they did not say.

What they just said (respond only to this): "${transcript}"
→ If they asked a question: answer it, then continue (e.g. ask for next field if needed). If they gave a value: extract it, acknowledge, ask for next field. If they confirmed (yes/thanks): say Thanks and ask for next field. If unclear/inaudible: ask to repeat for the current field only. Do not skip or answer something they did not say.

RECALL (what is the deductible / what did I say for X): When they ask what value we have for a field, reply with EXACTLY the value from "Data we have so far" above. E.g. if deductible is "500 dollars" say "I have the deductible as 500 dollars." Never use a different number or value. If we don't have that field yet, say "I don't have that one yet."

EXTRACTION (CRITICAL — values only, never full sentences):
- extractedUpdates values must be ONLY the benefit token: "80%" not "the coverage is 80 percent"; "$1020" not "is the insurance value 1020 as I said". Strip all surrounding words.
EXTRACTION (CRITICAL — field assignment and multi-value in one go):
- When the user provides MULTIPLE benefit values in one turn (e.g. "coverage is 80%, deductible 500, copay 20 dollars" or "80%, 500 dollars, 20 dollars, valid through December 2024"), extract EVERY value mentioned into extractedUpdates in a single response. Put each value in its correct field (coverage = %, deductible/copay = dollars, validity = date). Return all of them in one extractedUpdates object so we collect them in one go. Then acknowledge briefly and ask only for the next missing field (or "That's all I need, thank you." if none left).
- We are currently asking for: "${nextFieldToAsk ?? 'none'}". When the user gives a single number, dollar amount, or percentage in response to our question, put it ONLY in "${nextFieldToAsk}". Do NOT put it in any other field (e.g. if we asked for deductible and they say "20 dollars", set ONLY {"deductible": "20 dollars"}, NOT copay). Your nextMessage must: acknowledge with one short varied phrase ("Okay.", "Got you.", "Thank you.", "Thanks.", "Awesome.", "Done.", "Okay, and next.", "Yup.") then ask for the NEXT field only by speaking that field's exact question from BENEFIT QUESTIONS verbatim. NEVER re-ask the same field they just answered. Do NOT add "right?" or "correct?" after their value.
- If they explicitly name a field and a value (e.g. "deductible is 500 and copay is 25 percent"), extract each into the correct field. Otherwise, a single value goes ONLY into "${nextFieldToAsk}".
- VALIDITY: Only set validity when the user explicitly says a date, month, or year (e.g. "December 31st 2024", "valid through Dec 2024"). Do NOT set validity to any default or assumed date (e.g. "31st Dec 2024", "July 17 2025"). If they did not say anything about validity or a date, leave validity empty. Never invent a date. CRITICAL — If we do NOT have validity in "Data we have so far", never say a date in your nextMessage and never ask "is it [date] right?". Only ask "What is the validity?" or "Can I get the validity?" or "Can you provide the validity?". Only confirm a date for validity ("So the validity is [date], right?") if the user JUST said that date in this turn.
- Only ask them to repeat when transcript is exactly "User did not respond or was inaudible". Do not ask to repeat if they gave a number or amount.
- After extracting a value (or multiple): acknowledge once and ask for the NEXT missing field only.
FIELD RULE EXECUTION

Each verification field contains:

1. Field Name
2. Question
3. Rule

The Rule is mandatory.

Whenever collecting a value:

• Read the Rule for the current field before accepting the answer.

• If the answer satisfies the Rule:
    - Extract the value.
    - Populate extractedUpdates.
    - Continue to the next field.

• If the answer violates the Rule:
    - Do NOT populate extractedUpdates.
    - Do NOT move to the next field.
    - Politely explain what format or information is expected based on the Rule.
    - Ask the representative for the same field again.

Never guess.
Never transform values.
Never convert values.
Never ignore a Rule.

A field is considered complete ONLY after its Rule has been satisfied.

The Rule has higher priority than generic extraction instructions.
Example:
Examples

Field:
Coverage

Question:
What is the coverage?

Rule:
Coverage must be provided as percentage only.

TPA:
Twenty dollars.

Correct Response:
"I would need the coverage in percentage. Could you provide it as a percentage?"

extractedUpdates:
{}

----------------------------------------

Field:
Deductible

Rule:
Deductible must be a dollar amount.

TPA:
80 percent.

Correct Response:
"I would need the deductible as a dollar amount."

extractedUpdates:
{}

----------------------------------------

Field:
Validity

Rule:
Validity must be a date.

TPA:
It is active.

Correct Response:
"Could you provide the validity date?"

extractedUpdates:
{}

----------------------------------------

Field:
Coverage

Rule:
Coverage must be percentage.

TPA:
80 percent.

Correct Response:
"Thank you."

extractedUpdates:
{
    "coverage":"80%"
}

WHAT TO SAY (check in this order). NEVER use "Does that match your records?", "Are we good?", or similar after DOB, name, recall, or a normal benefit value.
- If they GAVE a value for the current field: extract, acknowledge briefly, ask NEXT field verbatim from BENEFIT QUESTIONS.
- If they say bare "yes" / "okay" / "yup" only (not confirming a specific value you stated): short ack only ("Okay.", "Got you.", "Thank you.", "Thanks.", "Awesome.", "Done.", "Okay, and next.", "Yup." — vary) then ask the NEXT missing field verbatim — never "right?", "is that correct?", or "yes it is". extractedUpdates {}.
- If they CONFIRM with thanks after a value: if all fields collected, closing per TWO-STEP CLOSING; else same short ack style and next missing field if benefit_qna_allowed is YES. extractedUpdates {}.
- If they ask what we have for a field (recall): state the value only — no confirmation question. extractedUpdates {}.
- If they ask to repeat or "what was the question?": Speak ONLY the exact current question line from BENEFIT QUESTIONS for the field we are on. Do NOT add a confirmation phrase after repeat. extractedUpdates {}. If we have all ${numFields} fields: "We have everything we need. Thanks." set endCall true only if they said thank you / that's all.
- If they say "goodbye" / "that's all" / "thank you" / "we're done" and we have all ${numFields} fields: say "Thank you for helping me with the verification. Have a great day." and set endCall true. If we are MISSING any field: do NOT set endCall true. Ask for the first missing field using ONLY that field's exact line from BENEFIT QUESTIONS. extractedUpdates {}.
- If they correct a value: "Got it. So the [field] is [value], right?" Wait for yes, then next field. extractedUpdates {}.
- If they ask "why do you need that?": "We're verifying benefit details for our patient." extractedUpdates {}.
- If they ask to confirm ("so deductible is 500?"): "Yes, that's correct." or "I have it as [value]." extractedUpdates {}.
- If they need a moment / hold / let me check (they are looking something up): "Sure, I'll hold. Take your time." extractedUpdates {}.
- If they ask for info you don't have (e.g. policy number, member ID — NOT benefit fields): "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a benefit field still missing: ask using that field's exact line from BENEFIT QUESTIONS. extractedUpdates {}.
- If they ask "what fields/benefits/details do you need" / "what do you want to know about the patient": ONLY if benefit_qna_allowed is YES, ask first missing field (voice may say "I would need …" once) using BENEFIT QUESTIONS verbatim. Otherwise wait — do not ask benefit fields yet. extractedUpdates {}.
- CRITICAL: NEVER say "I didn't get you" or "couldn't catch" when the user said something substantive. Only use a repeat phrase when transcript is EXACTLY "User did not respond or was inaudible." extractedUpdates as needed.
- If they say "how can I help" / "why are you calling" / "what's the purpose": If purpose_already_stated is NO, nextMessage EXACTLY "I need a few benefit details of a patient." If YES, brief ack. No benefit questions until benefit_qna_allowed is YES. extractedUpdates {}.
- If transcript is EXACTLY "User did not respond or was inaudible" or silence: Say ONLY one short repeat request. Do NOT add a confirmation phrase or next field in this turn. extractedUpdates {}.
- If they ask to update or correct a value: put new value in extractedUpdates, say "Updated. I've got that. Thanks." Then "So can I get the next field?" if more needed.
- If they asked a general question (how are you): answer briefly. Do NOT add "Are we good?" Do not ask for a field in same turn. extractedUpdates {}.
- Otherwise: ${oneFieldRule}

Set endCall to true ONLY when (1) all ${numFields} fields are present AND (2) the user said thank you / yes / that's all / we're done / goodbye / welcome / you're welcome / okay / have a good day AND (3) we have already delivered the "That's all I have" line on a previous turn. When they JUST gave the last value (completing all fields), say "That's all I have. Thank you for your help." and set endCall FALSE. On the NEXT TPA turn when they offer any courtesy, say "You're welcome. Have a wonderful day." and set endCall TRUE. Never collapse the two steps into a single turn. If even one field is missing, set endCall to false and ask for the first missing field when benefit_qna_allowed is YES.

Respond with ONLY a JSON object. No markdown. Format:
{"nextMessage": "Short sentence", "extractedUpdates": {} or {"deductible": "100 dollars"} etc., "endCall": true or false}`;

    const result = await model.generateContent(prompt);
    let jsonString = result.response.text()?.trim() ?? '{}';
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/```json|```/gi, '').trim();
    }
    try {
      const parsed = JSON.parse(jsonString);
      let nextMessage =
        typeof parsed.nextMessage === 'string' && parsed.nextMessage.trim()
          ? parsed.nextMessage.trim()
          : 'What else can you tell me?';
      let extractedUpdates = parsed.extractedUpdates ?? {};
      let endCall = parsed.endCall === true;

      const transcriptHasValue =
        transcript !== 'User did not respond or was inaudible.' &&
        transcript !== 'User did not respond or was inaudible' &&
        /\d+|dollar|percent|%\s*\$/.test(transcript);

      // Safeguard: if we were asking for a specific field and AI put the value in a different field (e.g. copay when we asked deductible), reassign to the field we asked for
      if (nextFieldToAsk && transcriptHasValue) {
        const keys = Object.keys(extractedUpdates);
        if (keys.length === 1 && keys[0] !== nextFieldToAsk) {
          const wrongKey = keys[0];
          const value = extractedUpdates[wrongKey];
          if (
            value &&
            typeof value === 'string' &&
            this.valueFitsField(value, nextFieldToAsk)
          ) {
            extractedUpdates = { [nextFieldToAsk]: value };
          }
        }
        // Never accept an extracted validity if the user didn't say anything that looks like a date
        if (extractedUpdates.validity && !this.looksLikeDate(transcript)) {
          const { validity, ...rest } = extractedUpdates;
          extractedUpdates = rest;
        }
      }

      const looksLikeDidntGet =
        /didn'?t\s+(get|catch|understand)|can you (repeat|share|say)/i.test(
          nextMessage,
        );
      if (
        nextFieldToAsk &&
        transcriptHasValue &&
        Object.keys(extractedUpdates).length === 0
      ) {
        const fallback = this.tryExtractFieldFromTranscript(
          transcript,
          nextFieldToAsk,
        );
        if (fallback) {
          extractedUpdates = { [nextFieldToAsk]: fallback };
          const nextAfter = this.getNextFieldAfter(
            currentExtracted,
            nextFieldToAsk,
            fallback,
            orderedFields,
          );
          nextMessage = nextAfter
            ? `Thanks. ${this.verbatimBenefitQuestion(nextAfter, fieldQ)}`
            : 'Thanks. Is there anything else?';
        }
      } else if (looksLikeDidntGet && nextFieldToAsk && transcriptHasValue) {
        const fallback = this.tryExtractFieldFromTranscript(
          transcript,
          nextFieldToAsk,
        );
        if (fallback) {
          extractedUpdates = { [nextFieldToAsk]: fallback };
          const nextAfter = this.getNextFieldAfter(
            currentExtracted,
            nextFieldToAsk,
            fallback,
            orderedFields,
          );
          nextMessage = nextAfter
            ? `Thanks. ${this.verbatimBenefitQuestion(nextAfter, fieldQ)}`
            : 'Thanks. Is there anything else?';
        }
      }

      const mergedState: Record<string, string | null> = {
        ...currentExtracted,
      };
      for (const [k, v] of Object.entries(extractedUpdates)) {
        if (v !== undefined && v !== null && typeof v === 'string')
          mergedState[k] = v;
        else if (v === null) mergedState[k] = null;
      }

      const missingFields = this.getMissingFields(mergedState, orderedFields);
      if (endCall && missingFields.length > 0) {
        endCall = false;
        const firstMissing = missingFields[0];
        nextMessage = `Sorry, I missed certain fields. First, can you provide the ${firstMissing}?`;
      }

      const maxMessageLength = 200;
      if (nextMessage.length > maxMessageLength) {
        nextMessage = nextMessage.slice(0, maxMessageLength).trim();
        const lastPeriod = nextMessage.lastIndexOf('.');
        if (lastPeriod > 80) nextMessage = nextMessage.slice(0, lastPeriod + 1);
      }
      return { nextMessage, extractedUpdates, endCall };
    } catch {
      return {
        nextMessage: 'What else can you tell me?',
        extractedUpdates: {},
        endCall: false,
      };
    }
  }

  private getNextFieldAfter(
    current: Record<string, string | null>,
    justFilled: string,
    value: string,
    orderedFields?: string[] | null,
  ): string | null {
    const updated = { ...current, [justFilled]: value };
    return this.getNextFieldToAsk(updated, orderedFields);
  }

  /** Benefit field validation: coverage = percentage, deductible/copay = dollars, validity = date (month and year). */
  private isPercentage(s: string): boolean {
    const t = String(s).trim().toLowerCase();
    return /\d+\s*%|\d+\s*percent|%\s*\d+/.test(t);
  }

  private normalizeDollarAmount(value: string | number | null): string | null {
    if (value === null || value === undefined) return null;

    const raw = String(value).trim().toLowerCase();

    // Already numeric
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      return raw;
    }

    // Handle "17 dollars and 50 cents"
    const dollarCentsMatch = raw.match(
      /(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?)\s*(?:and\s*)?(\d+)\s*cents?/i,
    );

    if (dollarCentsMatch) {
      const dollars = Number(dollarCentsMatch[1]);
      const cents = Number(dollarCentsMatch[2]);

      return (dollars + cents / 100).toString();
    }

    // Handle "17 dollars"
    const dollarsMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?)/i);

    if (dollarsMatch) {
      return Number(dollarsMatch[1]).toString();
    }

    return raw;
  }

  private isDollars(s: string): boolean {
    const t = String(s).trim().toLowerCase();

    // Percent sign disqualifies.
    if (/%/.test(t)) return false;

    // Dollar + cents:
    // "17 dollars and 50 cents"
    // "seventeen dollars and fifty cents"
    if (/\bdollars?\b.*\bcents?\b/.test(t)) {
      return true;
    }

    // Explicit dollar indicators:
    // "$17"
    // "17 dollars"
    // "17 dollar"
    // "17 usd"
    if (
      /\$\s*\d+/.test(t) ||
      /\d+(?:\.\d+)?\s*dollars?\b/.test(t) ||
      /\b\d+(?:\.\d+)?\s*usd\b/.test(t)
    ) {
      return true;
    }

    // Bare integer/decimal.
    // Since this function is called for a dollar question,
    // "24", "$24", "2500.00" are valid.
    if (/^\$?\d{1,6}(?:\.\d{1,2})?$/.test(t)) {
      return true;
    }

    // Spelled-out dollar amount:
    // "twenty-four dollars"
    // "fourteen dollars"
    // "one hundred dollars"
    if (/\bdollars?\b/.test(t) && this.wordsToNumber(t) != null) {
      return true;
    }

    // Spelled-out dollar + cents:
    // "seventeen dollars and fifty cents"
    if (
      /\bdollars?\b/.test(t) &&
      /\bcents?\b/.test(t) &&
      this.parseMoneyWords(t) != null
    ) {
      return true;
    }

    return false;
  }

  /** Parse a simple English number phrase like "twenty-four", "one hundred", "fourteen" → 24, 100, 14.
   *  Returns null if unrecognised. Supports 0–9999. */
  private wordsToNumber(phrase: string): number | null {
    const words: Record<string, number> = {
      zero: 0,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
      hundred: 100,
      thousand: 1000,
    };

    const tokens = phrase
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/-/g, ' ')
      .split(/\s+/)
      .filter((w) => w && w in words);
    if (!tokens.length) return null;
    let total = 0;
    let current = 0;
    for (const tok of tokens) {
      const val = words[tok];
      if (val === 100) current = Math.max(current, 1) * 100;
      else if (val === 1000) {
        total += Math.max(current, 1) * 1000;
        current = 0;
      } else current += val;
    }
    total += current;
    return total > 0 ? total : null;
  }

  private parseMoneyWords(value: string): number | null {
    const t = String(value)
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/,/g, ' ')
      .trim();

    // "seventeen dollars and fifty cents"
    const dollarCentsMatch = t.match(
      /^(.+?)\s+dollars?\s+(?:and\s+)?(.+?)\s+cents?$/,
    );

    if (dollarCentsMatch) {
      const dollars = this.wordsToNumber(dollarCentsMatch[1]);
      const cents = this.wordsToNumber(dollarCentsMatch[2]);

      if (dollars != null && cents != null) {
        return dollars + cents / 100;
      }
    }

    // "17 dollars and 50 cents"
    const numericDollarCentsMatch = t.match(
      /^(\d+(?:\.\d+)?)\s+dollars?\s+(?:and\s+)?(\d+)\s+cents?$/,
    );

    if (numericDollarCentsMatch) {
      const dollars = Number(numericDollarCentsMatch[1]);
      const cents = Number(numericDollarCentsMatch[2]);

      return dollars + cents / 100;
    }

    // "seventeen dollars"
    const dollarWordMatch = t.match(/^(.+?)\s+dollars?$/);

    if (dollarWordMatch) {
      const dollars = this.wordsToNumber(dollarWordMatch[1]);

      if (dollars != null) {
        return dollars;
      }
    }

    return null;
  }

  public normalizeMoney(value?: string | null): string {
    if (!value) return '';

    const raw = String(value).toLowerCase().replace(/,/g, '').trim();

    // -----------------------------------------
    // Numeric dollars + cents
    // "10 dollars 7 cents" -> 10.7
    // "10 dollars and 7 cents" -> 10.7
    // "10 dollars 50 cents" -> 10.5
    // -----------------------------------------
    const numericDollarCents = raw.match(
      /^(\d+(?:\.\d+)?)\s*dollars?\s*(?:and\s*)?(\d+)\s*cents?$/,
    );

    if (numericDollarCents) {
      const dollars = Number(numericDollarCents[1]);
      const cents = Number(numericDollarCents[2]);

      return String(dollars + Number(`0.${cents}`));
    }

    // -----------------------------------------
    // Numeric cents only
    // "7 cents" -> 0.7
    // "50 cents" -> 0.5
    // -----------------------------------------
    const numericCents = raw.match(/^(\d+)\s*cents?$/);

    if (numericCents) {
      const cents = Number(numericCents[1]);

      return String(Number(`0.${cents}`));
    }

    // -----------------------------------------
    // Word dollars + cents
    // "ten dollars seven cents" -> 10.7
    // "ten dollars fifty cents" -> 10.5
    // -----------------------------------------
    const wordDollarCents = raw.match(
      /^(.+?)\s+dollars?\s*(?:and\s*)?(.+?)\s+cents?$/,
    );

    if (wordDollarCents) {
      const dollars = this.wordsToNumber(wordDollarCents[1]);
      const cents = this.wordsToNumber(wordDollarCents[2]);

      if (dollars != null && cents != null) {
        return String(dollars + Number(`0.${cents}`));
      }
    }

    // -----------------------------------------
    // Word cents only
    // "seven cents" -> 0.7
    // "fifty cents" -> 0.5
    // -----------------------------------------
    const wordCents = raw.match(/^(.+?)\s+cents?$/);

    if (wordCents) {
      const cents = this.wordsToNumber(wordCents[1]);

      if (cents != null) {
        return String(Number(`0.${cents}`));
      }
    }

    // -----------------------------------------
    // Remove currency words/symbols
    // -----------------------------------------
    const cleaned = raw.replace(/dollars?|usd|\$/g, '').trim();

    // -----------------------------------------
    // Numeric amount
    // -----------------------------------------
    const numeric = cleaned.match(/\d+(?:\.\d+)?/);

    if (numeric) {
      return String(Number(numeric[0]));
    }

    // -----------------------------------------
    // Spelled-out number
    // -----------------------------------------
    const wordNumber = this.wordsToNumber(cleaned);

    return wordNumber != null ? String(wordNumber) : '';
  }

  public normalizeHistoryDates(value?: string | null): string {
    if (!value) return '';

    const input = value.trim();

    // Already normalized
    if (/^\d{2}-\d{2}-\d{4}(,\d{2}-\d{2}-\d{4})*$/.test(input)) {
      return input;
    }

    // Split on common separators between multiple dates
    const parts = input
      .split(/\s*(?:,| and | & )\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const results: string[] = [];

    for (const part of parts) {
      const dt = new Date(part);

      if (!Number.isNaN(dt.getTime())) {
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();

        results.push(`${day}-${month}-${year}`);
        continue;
      }

      // Fallback: extract embedded date phrases
      const matches =
        part.match(
          /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4})\b/gi,
        ) ?? [];

      for (const m of matches) {
        const d = new Date(m);

        if (!Number.isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();

          results.push(`${day}-${month}-${year}`);
        }
      }
    }

    // Remove duplicates while preserving order
    return [...new Set(results)].join(',');
  }

  /** Normalize validity to "21st Dec 2028" format. Returns null if not parseable. */
  private normalizeValidity(value: string): string | null {
    const t = value.trim();
    if (!t) return null;
    const months: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const ord = (n: number) => {
      if (n >= 11 && n <= 13) return n + 'th';
      const d = n % 10;
      if (d === 1) return n + 'st';
      if (d === 2) return n + 'nd';
      if (d === 3) return n + 'rd';
      return n + 'th';
    };

    // Try "21st december 2028" / "21 december 2028" / "dec 21 2028"
    const dmy = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{2,4})/i);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const monthKey = dmy[2]
        .toLowerCase()
        .replace(/ember$/, '')
        .replace(/uary$/, '')
        .slice(0, 3);
      const monthNum =
        months[monthKey] ?? months[dmy[2].toLowerCase().slice(0, 3)];
      const year = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
      if (monthNum !== undefined && day >= 1 && day <= 31) {
        return `${ord(day)} ${monthNames[monthNum]} ${year}`;
      }
    }

    // Try "21/12/2028" or "21/12/28" or "12/21/2028" (month/day/year)
    const slash = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (slash) {
      const a = parseInt(slash[1], 10);
      const b = parseInt(slash[2], 10);
      const y = slash[3].length === 2 ? '20' + slash[3] : slash[3];
      let day: number, month: number;
      if (b <= 12 && a <= 31) {
        month = b - 1;
        day = a;
      } else if (a <= 12 && b <= 31) {
        month = a - 1;
        day = b;
      } else {
        return null;
      }
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return `${ord(day)} ${monthNames[month]} ${y}`;
      }
    }

    // Try "december 21 2028" / "Dec 21, 2028"
    const mdy = t.match(/(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/i);
    if (mdy) {
      const monthNum =
        months[mdy[1].toLowerCase().slice(0, 3)] ??
        months[mdy[1].toLowerCase()];
      const day = parseInt(mdy[2], 10);
      const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3];
      if (monthNum !== undefined && day >= 1 && day <= 31) {
        return `${ord(day)} ${monthNames[monthNum]} ${year}`;
      }
    }

    // Try "December 2028" / "Dec 2028" (month and year only) → treat as 1st of that month
    const my = t.match(/(\w+)\s+(\d{2,4})/i);
    if (my) {
      const monthNum =
        months[my[1].toLowerCase().slice(0, 3)] ?? months[my[1].toLowerCase()];
      const year = my[2].length === 2 ? '20' + my[2] : my[2];
      if (monthNum !== undefined && /^\d{4}$/.test(year)) {
        return `1st ${monthNames[monthNum]} ${year}`;
      }
    }

    return null;
  }

  /** Parse normalized validity "21st Dec 2028" to a UTC midnight Date for the calendar day. */
  private validityNormalizedStartUtc(normalized: string): Date | null {
    const m = normalized.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const monStr = m[2].toLowerCase().slice(0, 3);
    const months: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      sept: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const mo = months[monStr];
    if (mo === undefined || day < 1 || day > 31) return null;
    const y = parseInt(m[3], 10);
    if (!Number.isFinite(y)) return null;
    return new Date(Date.UTC(y, mo, day));
  }

  private looksLikeDate(s: string): boolean {
    const t = s.trim().toLowerCase();
    return (
      /\d{1,2}(\/|-)\d{1,2}(\/|-)\d{2,4}/.test(t) ||
      /\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(
        t,
      ) ||
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i.test(
        t,
      ) ||
      /\d{4}|20\d{2}/.test(t)
    );
  }

  /** True if value format fits the benefit field (for reassigning misassigned extractions). */
  private valueFitsField(value: string, field: string): boolean {
    const v = value.trim().toLowerCase();
    if (field === 'coverage') return this.isPercentage(v);
    if (field === 'deductible') return this.isDollars(v);
    if (field === 'copay') return this.isDollars(v);
    if (field === 'validity') return this.looksLikeDate(v);
    return true;
  }

  /**
   * Validates and normalizes extracted benefit values.
   * - coverage: must be percentage
   * - deductible, copay: must be dollars
   * - validity: must be date (month and year); normalized to "21st Dec 2028"
   * Returns either normalized updates to merge, or a polite correction message for the user.
   */
  public validateAndNormalizeBenefitExtracted(
    extracted: Record<string, string | null | undefined>,
    userSaid: string,
    orderedFields?: string[] | null,
  ):
    | { ok: true; normalized: Record<string, string> }
    | { ok: false; correctionMessage: string; invalidField: string } {
    const quote = (v: string) =>
      (v && v.length > 25 ? v.slice(0, 22) + '...' : v) || 'that';
    const out: Record<string, string> = {};
    const fields = AiService.getOrderedFields(orderedFields);

    for (const field of fields) {
      const raw = extracted[field];
      if (raw == null || String(raw).trim() === '') continue;
      const v = scrubRawBenefitValue(field, String(raw).trim(), userSaid);
      if (field.startsWith('history.') || field === 'effectiveDate') {
        out[field] = this.normalizeHistoryDates(v);
        continue;
      }
      if (!v?.trim()) continue;
      if (field === 'coverage') {
        if (!this.isPercentage(v)) {
          return {
            ok: false,
            invalidField: 'coverage',
            correctionMessage: `I noticed you said "${quote(v)}". For coverage, I need that as a percentage. Could you share it again?`,
          };
        }
        const pct = v.match(/(\d+)\s*%|(\d+)\s*percent/i);
        out.coverage = pct ? `${pct[1] || pct[2]}%` : v;
      } else if (field === 'deductible') {
        if (!this.isDollars(v)) {
          return {
            ok: false,
            invalidField: 'deductible',
            correctionMessage: `I noticed you said "${quote(v)}". For the deductible, I need that in dollars. Could you share it again?`,
          };
        }
        const dol = v.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
        const bareDol = !dol ? v.match(/^\$?(\d{1,6})(?:\.\d{1,2})?$/) : null;
        const wordNum = !dol && !bareDol ? this.wordsToNumber(v) : null;
        out.deductible = dol
          ? `$${dol[1] || dol[2] || dol[3]}`
          : bareDol
            ? `$${bareDol[1]}`
            : wordNum != null
              ? `$${wordNum}`
              : v;
      } else if (field === 'copay') {
        const pct = v.match(/(\d+)\s*%|(\d+)\s*percent/i);
        const dol = v.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
        const bareDol = !dol ? v.match(/^\$?(\d{1,6})(?:\.\d{1,2})?$/) : null;
        const wordNum = !dol && !bareDol && !pct ? this.wordsToNumber(v) : null;
        if (pct) {
          out.copay = `${pct[1] || pct[2]}%`;
        } else if (this.isDollars(v) && dol) {
          out.copay = `$${dol[1] || dol[2] || dol[3]}`;
        } else if (this.isDollars(v) && bareDol) {
          out.copay = `$${bareDol[1]}`;
        } else if (this.isDollars(v) && wordNum != null) {
          out.copay = `$${wordNum}`;
        } else if (!this.isDollars(v) && !this.isPercentage(v)) {
          return {
            ok: false,
            invalidField: 'copay',
            correctionMessage: `I noticed you said "${quote(v)}". For the copay, I need that in dollars or percentage. Could you share it again?`,
          };
        } else {
          out.copay = v;
        }
      } else if (field === 'validity') {
        const normalized = this.normalizeValidity(v);
        if (!normalized || !this.looksLikeDate(v)) {
          return {
            ok: false,
            invalidField: 'validity',
            correctionMessage: `I noticed you said "${quote(v)}". For validity, I need a date with month and year. Could you share it again?`,
          };
        }
        const yearFromNorm = parseInt(
          /(\d{4})\s*$/i.exec(normalized)?.[1] ?? '',
          10,
        );
        if (
          Number.isFinite(yearFromNorm) &&
          yearFromNorm > new Date().getFullYear() + 30
        ) {
          return {
            ok: false,
            invalidField: 'validity',
            correctionMessage: `I heard "${quote(v)}" — that year does not sound right for the plan validity. Could you confirm the month and year again?`,
          };
        }
        const rejectFuture =
          process.env.EVA_REJECT_FUTURE_VALIDITY === '1' ||
          process.env.EVA_REJECT_FUTURE_VALIDITY === 'true';
        if (rejectFuture) {
          const dtStart = this.validityNormalizedStartUtc(normalized);
          if (dtStart) {
            const now = new Date();
            const startTodayUtc = Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate(),
            );
            if (dtStart.getTime() > startTodayUtc) {
              return {
                ok: false,
                invalidField: 'validity',
                correctionMessage: `That validity date would be in the future — I need the plan end or expiry as of today. Could you confirm the month and year again?`,
              };
            }
          }
        }
        out.validity = normalized;
      } else if (AiService.isGroupNameField(field)) {
        const name = this.extractGroupNameFromAnswer(v || userSaid);
        if (name.trim()) out[field] = name;
      } else {
        out[field] = v;
      }
    }

    return { ok: true, normalized: out };
  }

  private tryExtractFieldFromTranscript(
    transcript: string,
    field: string,
  ): string | null {
    const t = transcript.trim().toLowerCase();
    const dollarMatch = t.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
    const percentMatch = t.match(/(\d+)\s*%|(\d+)\s*percent/i);
    const numberMatch = t.match(/\b(\d+)\b/);
    if (field === 'validity') {
      const validityMatch = t.match(
        /year|month|dec|jan|feb|valid|till|until|through/i,
      );
      if (validityMatch) return transcript.trim().replace(/\s+/g, ' ');
      return null;
    }
    if (dollarMatch) {
      const num = dollarMatch[1] || dollarMatch[2] || dollarMatch[3];
      return num ? `$${num}` : null;
    }
    if (percentMatch && (field === 'copay' || field === 'coverage')) {
      const num = percentMatch[1] || percentMatch[2];
      return num ? `${num}%` : null;
    }
    if (numberMatch) {
      const num = numberMatch[1];
      if (field === 'deductible' || field === 'copay') return `$${num}`;
      if (field === 'coverage') return `${num}%`;
      return num;
    }
    return null;
  }

  public async extractInsuranceDetails(
    text: string,
    orderedFields?: string[] | null,
  ): Promise<Record<string, string | null>> {
    const fields = AiService.getOrderedFields(orderedFields);
    try {
      const fieldList = fields
        .map((f) => `- ${f.charAt(0).toUpperCase() + f.slice(1)}`)
        .join('\n      ');
      const jsonKeys = fields.map((f) => `"${f}": "..."`).join(',\n        ');
      const prompt = `
      Extract the following details from the insurance text:
      ${fieldList}

      Return ONLY a valid JSON object with these keys (set to null if missing):
      {
        ${jsonKeys}
      }

      If any field is missing in the text, set it to null.

      Text:
      ${text}
    `;

      const model = this.gemini.getGenerativeModel(this.getGeminiModelInit());
      const result = await model.generateContent(prompt);
      let jsonString = result.response.text().trim() || '{}';

      if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/```json|```/gi, '').trim();
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        console.error('❌ Failed to parse Gemini JSON:', jsonString);
        parsed = {};
      }

      const out: Record<string, string | null> = {};
      for (const f of fields) {
        out[f] = parsed[f] ?? null;
      }
      return out;
    } catch (err) {
      console.error('❌ Error extracting insurance details from Gemini:', err);
      const out: Record<string, string | null> = {};
      for (const f of fields) {
        out[f] = null;
      }
      return out;
    }
  }

  /**
   * Extract verification fields from a transcript by matching EVA questions to USER responses.
   * Uses Gemini to parse the transcript and return a transcript-only list of question/answer pairs.
   * If the model returns detailed field values, those are still supported as a fallback.
   *
   * @param transcript The full transcript with EVA and User dialog
   * @param verificationFields Array of field definitions with questions
   * @returns Array of question/answer pairs or field extraction results
   */
  public async extractVerificationFieldsFromTranscript(
    transcript: string,
    verificationFields: Array<{
      question: string;
      field: string;
      required: boolean;
      order: number;
    }>,
  ): Promise<
    Array<{
      normalizedQuestion: string;
      question: string;
      answer: string | string[];
    }>
  > {
    if (!verificationFields || verificationFields.length === 0) {
      return [];
    }

    try {
      const prompt = `You are analyzing a call transcript between EVA (from a dental practice) and a USER (from an insurance company).

TASK: Extract the question text EVA asked and the USER answer that follows for each dialog turn.
- Use ONLY the transcript to determine the matching question and answer.
- Do NOT search the fieldDefinitions for answer content or validate answers against them.
- Do NOT invent any new questions or answers.

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
1. Identify every EVA turn that is a question or request for information.
2. For each EVA question, capture the USER response immediately after it.
3. Return a JSON array of objects with exactly two keys: "question" and "answer".
4. If the USER provided multiple distinct values (e.g., two dates), provide them in "answer" as an array of strings, or as a single string joined by " and " or a comma. Preserve the question text exactly as EVA spoke it in the transcript.
5. For the USER answer (answer), normalize it to a clean value:
  - Convert spoken numbers to digits: "twenty dollars" → "20", "one hundred" → "100", "fourteen" → "14"
  - Keep percentages as is or convert: "eighty percent" → "80", "twenty five %" → "25"
  - Remove filler words and normalize: "Uh, it is, uh, two forty-four" → "244"
  History procedure questions:
    - Preserve ALL dates mentioned.
    - Normalize every date to DD-MM-YYYY.
    - If multiple service dates are provided,
      return a single comma separated string.
      Examples
      "January 1st 2026 and February 5th 2025"
      ↓
      "01-01-2026,05-02-2025"
    - Never return only the year.
    - Never return only the month.
    - Never discard dates.
  - For insurance GROUP NAME questions: extract only the name from conversational answers — "That is My India." → "My India", "That would be My india" → "My India". Do NOT convert group names to numbers.
  - For other text answers, keep as clean text without extra words.
6. Do NOT include any field definitions, metadata, markdown, code fences, or extra text.
7. If a USER response is missing after an EVA question, omit that pair.
8. Return valid JSON only.
9. Extract only the questions and answers that are present in the transcript.
10. Do not infer or generate answers for questions that were not asked.
11. Preserve the order of the conversation exactly as it appears in the transcript.

EXAMPLE OUTPUT:
[
  { "question": "What is the insurance group name?", "answer": "My India" },
  { "question": "What is the insurance group number?", "answer": "1717" },
  { "question": "What is the patient's date of birth?", "answer": "March 26, 1984" },
  { "question": "What is the basic coverage?", "answer": "20" }
]`;

      const model = this.gemini.getGenerativeModel(this.getGeminiModelInit());
      const start = Date.now();
      const result = await model.generateContent(prompt);
      this.logger.log(
        `[Gemini] extractVerificationFieldsFromTranscript completed in ${Date.now() - start}ms`,
      );

      this.logger.log('Gemini Parsed Output:', JSON.stringify(result, null, 2));

      let jsonString = result.response.text().trim() || '[]';

      if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/```json|```/gi, '').trim();
      }

      let parsed: unknown = [];
      try {
        parsed = JSON.parse(jsonString);
      } catch (parseErr) {
        this.logger.error(
          '❌ Failed to parse Gemini JSON response:',
          jsonString,
        );
        parsed = [];
      }

      const parsedArray = Array.isArray(parsed) ? parsed : [];
      const hasQuestionAnswerPairs =
        parsedArray.length > 0 &&
        parsedArray.every(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as any).question === 'string' &&
            (typeof (item as any).answer === 'string' ||
              Array.isArray((item as any).answer)),
        );

      const questionAnswerPairs = hasQuestionAnswerPairs
        ? parsedArray.map((item) => {
            const itemObj = item as {
              question: string;
              answer: string | string[];
            };
            const rawVal = itemObj.answer;
            let answer: string | string[];
            const question = String(itemObj.question);
            if (Array.isArray(rawVal)) {
              answer = rawVal
                .map((v) => String(v).trim())
                .filter(Boolean)
                .map((v) =>
                  AiService.isGroupNameQuestion(question)
                    ? this.extractGroupNameFromAnswer(v)
                    : v,
                )
                .filter(Boolean);
            } else {
              const raw = String(rawVal);
              if (AiService.isGroupNameQuestion(question)) {
                answer = this.extractGroupNameFromAnswer(raw);
              } else {
                const parts = raw
                  .split(/\s+and\s+|(?<=\d{4}),\s*/i)
                  .map((s) => s.trim())
                  .filter(Boolean);
                answer = parts.length > 1 ? parts : raw;
              }
            }
            return {
              question,
              answer,
            };
          })
        : [];

      this.logger.log(
        'Gemini Raw:',
        JSON.stringify(questionAnswerPairs, null, 2),
      );

      const parsedRecords = parsedArray.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      );

      const normalizeText = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();

      const normalizedPairs = questionAnswerPairs.map((pair) => ({
        ...pair,
        normalizedQuestion: normalizeText(pair.question),
      }));

      // this.logger.log('normalized pairs:::::: {}', normalizedPairs);
      return normalizedPairs;
    } catch (err) {
      this.logger.error(
        '❌ Error extracting verification fields from transcript:',
        err,
      );
      // Return array with empty answers on failure
      return verificationFields.map((f) => ({
        question: f.question,
        normalizedQuestion: '',
        answer: '',
      }));
    }
  }
}
