import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ModelParams } from '@google/generative-ai';
import { VerificationService } from '../verification/verification.service';

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

    const tb = parseGeminiThinkingBudget();
    this.logger.log(
      `[Gemini] model=${GEMINI_MODEL} thinkingBudget=${tb === null ? 'default' : tb} (env GEMINI_THINKING_BUDGET: 0=off, -1=dynamic, default=omit)`,
    );
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
  - Professional, polite, patient, and empathetic. You represent the dental practice and need the other party's help to get benefit information.
  - If they ask how you are, respond naturally and briefly (e.g., "I'm doing well, thank you! How about you?").
  - If they say you sound harsh or robotic, apologize warmly (e.g., "I'm so sorry — I just want to make sure we get the details right for our patient. I appreciate your help.").
  - Never admit to being an AI or a bot.
  - Keep replies to 1–2 short sentences. No markdown.

  END-OF-CALL CONTEXT (when this is used after we've already said goodbye): Answer their question briefly in one short sentence. Do NOT repeat the full intro ("I'm Reena from Went Dentals", "I want to verify the patient details", "hoping you can help"). NEVER say "That's great to hear. I'm calling to verify benefits for a patient, [name]." unless they explicitly asked "How can I help you?" or "How can I help?" — and even then prefer a short "I'm calling to verify benefits for a patient. Is there anything else you need?"

  User (person on the insurance side) said: ${userMessage}
  Reply:`;

    const replyStart = Date.now();
    const result = await model.generateContent(prompt);
    const reply =
      result.response.text()?.trim() ??
      "I'm sorry, I missed that. What was that?";
    this.logger.log(
      `[Gemini] replyToUser completed in ${Date.now() - replyStart}ms`,
    );
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

  private hasValue(v: string | null | undefined): boolean {
    return v != null && String(v).trim().length > 0;
  }

  /** Pick a random phrase for asking a benefit field (varied so we don't repeat the same question) */
  private askForFieldPhrase(field: string): string {
    const templates = [
      `What is the ${field}?`,
      `Can I get the ${field}?`,
      `May I have the ${field}?`,
      `Can you provide the ${field}?`,
      `Can I have the ${field}?`,
      `Could you share the ${field}?`,
      `What's the ${field}?`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
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
    const prompt = `You are classifying a short voice transcript from a patient benefit verification call. The caller (EVA) is from the dental practice; the other party is from the insurance company and is providing benefit details (${fieldsList}).

Current question EVA asked: "${currentQuestion}"

What the person on the insurance side just said: "${transcript}"

Are they:
- Answering that question (giving a benefit value: ${fieldsList}, or similar)? Reply: answer
- Interrupting to correct a value they said before (e.g. "actually copay is 25% not 60%", "please update deductible to 500") or asking something else (e.g. who is the patient, what do you need)? Reply: interruption

Reply with ONLY one word: answer OR interruption`;

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const text = (result.response.text()?.trim() ?? '').toLowerCase();
    this.logger.log(
      `[Gemini] classifySegment completed in ${Date.now() - start}ms`,
    );
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
    const prompt = `You are handling an interruption during a patient benefit verification call. You are EVA (Reena), a customer care representative from Went Dentals, speaking with the insurance company to obtain benefit details (${fieldsList}) for a patient. Be professional, polite, and patient. Never say you are a bot or AI.
${patientBlock}
Current benefit data we have: ${current}

What the person on the insurance side just said: "${userMessage}"

- If they ask what we have for a field (recall): set "updates" to {} and reply with full details. If we have it: "I have the [field] as [value]." Then "Are we good?" only. Do NOT ask for the next field in the same turn. If we don't have it: "I don't have that one yet. Are we good?" only.
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
- "What did you have for deductible?" → {"updates": {}, "reply": "I have the deductible as 500 dollars. Are we good?"} (recall — do NOT ask for next field in same turn)
- When they say "yes" / "yeah it's clear" → {"updates": {}, "reply": "Thanks. Can I get the next field?" or "Can I get the validity?"}
- "Can you repeat the question?" → {"updates": {}, "reply": "Can I get the deductible?"} (varied phrase only; do NOT add "Are we good?")
- "Actually copay is 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Got it. So the copay is 25%, right?"} (do NOT ask for next field in same turn; wait for yes)
- "Why do you need that?" → {"updates": {}, "reply": "We're verifying benefit details for our patient."} (do NOT add "Are we good?")`;

    const start = Date.now();
    const result = await model.generateContent(prompt);
    this.logger.log(
      `[Gemini] handleInterruption completed in ${Date.now() - start}ms`,
    );
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
      this.logger.log(
        '[CallFlow] step=gemini_skipped | reason=empty_or_inaudible_transcript',
      );
      return { nextMessage: '', extractedUpdates: {}, endCall: false };
    }

    const identityReady =
      callHints?.patientIdentityReadyForBenefits === true ||
      patientInfo === null ||
      patientInfo === undefined;

    const hintsBlock = `
INTERNAL CALL STATE (never read aloud verbatim):
- purpose_already_stated: ${callHints?.purposeStated === true ? 'yes' : 'no'}
- patient_identity_cleared_for_benefits: ${identityReady ? 'yes — you may ask for coverage/deductible/copay/validity when appropriate' : 'no — wait for TPA identity questions first; after DOB answered and confirmed, proceed'}
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
    const firstFieldName = nextFieldToAsk ?? fields[0];

    const oneFieldRule =
      nextFieldToAsk === null
        ? `All ${numFields} fields (${fieldsList}) are collected. ENDING FLOW: (1) If the user JUST GAVE a value in this turn (completing the last field): say "That's all I need, thank you." and set endCall FALSE — do NOT say "Have a good day" yet. (2) If the user said thank you / yes / that's all / we're done / goodbye / I'm good / nothing else: say "Thank you for helping me with the verification. Have a great day." and set endCall TRUE. (3) If the user asked a question: answer it completely, then ask "Is that all you have?" or "Anything else?" and set endCall FALSE; when they say yes or thank you in a later turn, say "Thank you for helping me with the verification. Have a great day." and set endCall TRUE. Do NOT say your name, company, or repeat the introduction.`
        : `Ask for ONE field only. VARY the phrase every time — use a different one each turn: "What is the ${nextFieldToAsk}?" / "Can I get the ${nextFieldToAsk}?" / "May I have the ${nextFieldToAsk}?" / "Can you provide the ${nextFieldToAsk}?" / "Can I have the ${nextFieldToAsk}?" / "Could you share the ${nextFieldToAsk}?" / "What's the ${nextFieldToAsk}?" If you just got a value from them: acknowledge with ONE of "Got it, thanks." / "Thanks." / "Okay, thank you." / "Noted." then IMMEDIATELY ask for the NEXT field. EXCEPTION: If that value was the LAST missing field (so after this turn all fields are collected), say "That's all I need, thank you." and set endCall FALSE — do NOT ask for another field or say "Have a good day." NEVER say "Thank you, what is the ${nextFieldToAsk}?" or re-ask the same field they just answered. Do NOT say "Is that all you have?" or "Are we good?" after a normal value. Keep nextMessage under 25 words.`;

    const patientBlock = patientInfo
      ? `
Patient info (database — disclose only when the TPA/rep ASKS): Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. ${patientInfo.ssn ? `SSN/tax ID: only if they ask for SSN or tax ID.` : 'No SSN on file.'}

TPA-LED PATIENT VERIFICATION — CRITICAL:
- NEVER volunteer patient name or date of birth in your first reply or on "How can I help?" / "Hello" alone. The insurance rep asks; you answer. Do NOT recite name and DOB proactively.

PURPOSE OF CALL — ANSWER INTELLIGENTLY (vary wording every time; never copy the same sentence twice when they ask again):
- Triggers include: "How can I help?", "What can I do for you?", "Why are you calling?", "What's the purpose of this call?", "What is this regarding?", "What information do you need?", "Reason for your call?", "How may I help you today?"
- Respond with ONE short sentence in English that explains you need benefit / coverage-related details for a patient from their plan — same meaning, different words each time they ask (paraphrase). Do NOT give patient name or DOB here unless they already moved to identity questions.
- Examples of varied intent (pick one style; invent similar phrasing as needed): "I'm calling to verify a few benefit details for a patient." / "I need to collect some insurance benefit information for one of our patients." / "We're looking to confirm coverage and related benefit information for a patient visit." / "I need benefit verification details for a patient on our side."
- If purpose_already_stated is yes and they ask the purpose again (e.g. "Sorry, why are you calling again?"), give a fresh paraphrase — do NOT repeat your previous sentence verbatim and do NOT restart the full "Hi I'm Reena" intro.
- OPENING / GREETING ("How can I help?" / "Hello" / "Hi" only): One short sentence — purpose as above — no name, no DOB. Do NOT ask for ${firstFieldName} yet unless patient_identity_cleared_for_benefits is yes. extractedUpdates {}.
- WHEN they ask for patient name / spell name / "what is the patient's name" / full name: Answer ONLY with the name, e.g. "The patient is ${patientInfo.fullName}." — English only. Do NOT give DOB unless they also asked for DOB in this turn. Do NOT ask for benefit fields in the same turn. extractedUpdates {}.
- WHEN they ask for DOB / date of birth / birthday: Answer with DOB only in English, e.g. "The date of birth is ${patientInfo.dobFormatted ?? 'not provided'}." Then ONE short confirmation: "Is that correct?" or "Does that match your records?" Do NOT ask for ${firstFieldName} in this turn. extractedUpdates {}.
- WHEN they confirm after you gave DOB in the previous turn ("yes" / "correct" / "thanks") and internal state shows patient_identity_cleared_for_benefits is yes: Say "Thanks." then ask for the first missing benefit field (${firstFieldName}) with a varied phrase. extractedUpdates {}.
- BENEFIT FIELDS (${fieldsList}): Do NOT ask for any benefit field until patient_identity_cleared_for_benefits is yes in INTERNAL CALL STATE. If still "no", only answer identity/purpose questions; wait for them to ask name/DOB. Never re-ask or re-state name+DOB in full unless they ask again. extractedUpdates {} unless they clearly give a benefit value — then extract it.
- WHO is calling: ONLY if they ask "who is this?" / "identify yourself" / "who are you": "I'm Reena from Went Dentals. I'm calling to get benefit details." extractedUpdates {}.
- SSN / tax ID: ${patientInfo.ssn ? 'Give only what they ask for. One confirmation phrase. Do not ask benefit fields same turn.' : `"I don't have that on file."`}
- WHAT do you need: If patient_identity_cleared_for_benefits is yes, ask first missing benefit field only. If no, say you are waiting for them to verify patient name or date of birth as per their process. extractedUpdates {}.
`
      : `
- No patient on file: The TPA must lead; collect name and DOB from the rep when they offer or ask what you have. Before benefit fields, agree on identity. Opening: one sentence purpose in English only. extractedUpdates {}.
- If we are collecting fields, do NOT repeat long intros. extractedUpdates {}.
`;

    const recallBlock = `
CONFIRMATION PHRASES — Use "Is it okay?" / "Is that all you have?" / "Are we good?" / "Are we clear?" / "Does that match?" ONLY when: (1) After you gave DATE OF BIRTH because they asked — one confirmation phrase; next turn after they affirm, ask benefit field if patient_identity_cleared_for_benefits applies. (2) After RECALL — when they ask "what is the [field]?" give the stored value then ONE confirmation phrase at random. (3) When they correct a value. (4) When all benefit fields collected and waiting for goodbye. Never after a normal benefit value (${fieldsList}).
- When they GIVE a value (number/amount) for a field in normal flow: extract it. If that was the LAST missing field (all ${numFields} now collected), say "That's all I need, thank you." and set endCall FALSE. Otherwise say "Got it, thanks." or "Thanks." or "Okay, thank you." or "Noted." then ask for the NEXT field. Do NOT say "Is that all you have?" or "Are we good?" after a normal value. Do NOT re-ask the same field they just answered.
- When they CONFIRM ("yes" / "thank you" / "we're good") after you asked "Are we good?" (e.g. after DOB or after recall): say "Thanks." and ask for the next field, or if all ${numFields} collected and they said thank you, say "Thank you for helping me with the verification. Have a great day." and set endCall true.
- Value after hold: say "So the [field] is [value], right?" then wait for yes; then ask next field. extractedUpdates {}.
- After patient DOB: give DOB then ONE of "Are we good?" / "Is that all you have?" / "Are we clear?" Only when they say "yes" / "we're good" ask for first benefit field (${firstFieldName}). extractedUpdates {}.
- When they ask for RECALL ("what is the [field]?" / "do you have the [field]?"): give the value from data then ONE of "Is that all you have?" / "Are we good?" / "Are we clear?" (random). Do NOT ask for next field in same turn. extractedUpdates {}.
- When they correct a value: put NEW value in extractedUpdates, say "Got it. So the [field] is [value], right?" Wait for yes then ask next field. extractedUpdates for the corrected field only.
`;

    const afterResumeBlock =
      lastAskedField && fields.includes(lastAskedField)
        ? `
AFTER-HOLD CONTEXT: They just came back from hold. We were asking for "${lastAskedField}" ONLY.
- If they now gave a value (number, dollar, percent): put it in extractedUpdates for "${lastAskedField}" ONLY. Do NOT put it in any other field. Then VERIFY with acknowledgment: say "So the ${lastAskedField} is [value], right?" or "Just to confirm, the value for this field is [value], correct?" Do NOT ask for the next field in this turn. Wait for them to say "yes" in the next turn; only then ask for the next field.
- When they CONFIRM after this ("yes" / "correct" / "that's right" / "yeah"): then say "Thanks." and ask for the next missing field with a varied phrase. extractedUpdates {}.
- If they ask what we need or what was the question: re-ask "${lastAskedField}" with a varied phrase. set extractedUpdates {}.
- If they did not give a value (inaudible/unclear): "Can I get the ${lastAskedField}?" again and set extractedUpdates {}.
`
        : '';

    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company to obtain patient benefit details: ${fieldsList}.

LANGUAGE — Speak ONLY American/English. Never respond in Spanish or any other language. Numbers and dates in English.

${hintsBlock}

CRITICAL — TPA leads patient identity: Do NOT proactively state patient name or DOB on greeting or "How can I help?" Wait until they ask; then answer briefly in English. Do NOT repeat name+DOB together unless they ask again. Once benefit collection has started, do not restart identity verification unless they ask.

CRITICAL — NO REPEATED OPENING: The call already began with a greeting. NEVER say again "Hi, I'm Reena from Went Dentals" or "Hi, I am Reena..." or ask "how are you doing?" as an opener. NEVER repeat a full self-introduction mid-call. The ONLY exception is if the user explicitly asks who is calling / to identify yourself — then ONE short sentence ("I'm Reena from Went Dentals...") with NO greeting-style "how are you". Do not restate the dental office intro after verification questions or when moving to benefit fields.

STAY IN SYNC — Reply to what the user JUST said. One turn = one exchange.

PACE — Short sentences. Acknowledge values quickly; ask one thing at a time.

CONVERSATION FLOW:
- They ask DOB: give DOB from PATIENT INFO + one confirmation phrase only; no benefit field same turn.
- They confirm after DOB (yes / correct): if patient_identity_cleared_for_benefits is yes, ask first missing benefit (${firstFieldName}). extractedUpdates {}.
- They ask patient name: give name only in English; no benefit field same turn unless identity already cleared and they moved on.
- Greeting / purpose-of-call questions ("how can I help", "why are you calling", etc.): one varied sentence of purpose in English — no name, no DOB; never the exact same wording as your last purpose line if they ask again. extractedUpdates {}.
- Benefit values (${fieldsList}): extract, thank, ask next — only when allowed by INTERNAL CALL STATE and missing fields.
- When all fields collected and user JUST GAVE the last value: "That's all I need, thank you." endCall FALSE.
- END-OF-CALL when all fields collected AND user thanks / goodbye: "Thank you for helping me with the verification. Have a great day." endCall TRUE.

ROLE & TONE:
- Professional, polite, patient. One thing per turn. Answer the user's questions properly and directly—do not deflect or give a generic "didn't catch" when they asked something specific.
- If they ask a question (e.g. "What is that for?", "Why do you need it?", "Can you explain?"): answer in one clear, short sentence. Then continue with the flow (e.g. ask for the next field if needed). extractedUpdates {}.
- Professional, polite, patient. One thing per turn. Answer the user's questions properly and directly—do not deflect or give a generic "didn't catch" when they asked something specific.
- If they ask a question (e.g. "What is that for?", "Why do you need it?", "Can you explain?"): answer in one clear, short sentence. Then continue with the flow (e.g. ask for the next field if needed). extractedUpdates {}.
- If they say "let me check" / "one moment": "Sure, take your time." extractedUpdates {}.
- Never say you are a bot or AI.

${patientBlock}
${recallBlock}
${afterResumeBlock}

CROSS-QUESTIONING — two-step: answer fully, then confirm only when it's recall or DOB.
- "What did I say for [field]?" / "Do you have the [field]?" → Give full details. Then "Are we good?" only. Do NOT ask for next field in this turn. extractedUpdates {}.
- When they CONFIRM ("yes" / "yeah" / "we're good"): Say "Thanks." and ask for the next field with a varied phrase. extractedUpdates {}.
- "Can you repeat?" / "What was the question?" → Ask for the CURRENT field with a VARIED phrase only. Do NOT add "Are we good?" after repeat. extractedUpdates {}. If we have all ${numFields} fields and they said thank you / that's all: "Thank you for helping me with the verification. Have a great day." set endCall true.
- "Goodbye" / "That's all" / "We're done" when we are missing any field → Do NOT set endCall true. "I still need the [first missing]. Can you provide that?" extractedUpdates {}.
- "Actually I said X not Y" / "Update [field] to X" → Put the corrected value in extractedUpdates, say "Got it. So the [field] is [value], right?" Do NOT ask for next field in same turn. Wait for yes. extractedUpdates {}.
- "Why do you need that?" → "We're verifying benefit details for our patient." Do NOT add "Are we good?" extractedUpdates {}.
- "What about [other field]?" → Answer. Do NOT add "Are we good?" unless it was a recall. extractedUpdates {}.
- "So you have [field] as [value]?" / "Confirm [field] is [value]" → "Yes, that's correct." or "I have it as [value]." If more needed, ask for next field. Do NOT add "Are we good?" here. extractedUpdates {}.
- Recall or DOB (when asked alone): give full details, then ONE confirmation phrase. If they ask only patient name: give name only in English; no benefit field that turn unless identity already cleared.

Data we have so far (use ONLY these values for recall — never invent or guess): ${current}
Explicit values (— means we do not have that field yet; never say "not collected" or "the field is not collected" to the user—just ask for the field): ${fields.map((f) => `${f} = ${(currentExtracted as Record<string, string | null>)[f] ?? '—'}`).join(', ')}.
We are currently asking for: ${nextFieldToAsk ?? 'nothing (all done)'}.

CRITICAL — SOURCE OF TRUTH: The "Data we have so far" and "Explicit values" above are what we have already collected. If a field shows a value (not —), we HAVE it. NEVER ask for that field again. ONLY ask for fields that show —. When asking for a missing benefit field (${fieldsList}), use ONLY phrases like "Can I get the [field]?" / "May I have the [field]?" / "What's the [field]?" — NEVER say "I don't have that on my end" or "I don't have these noted" or "please provide the details" for benefit fields. Reserve "I don't have that on my end" ONLY for things like policy number or member ID that we truly do not have.

What they just said (respond only to this): "${transcript}"
→ If they asked a question: answer it, then continue (e.g. ask for next field if needed). If they gave a value: extract it, acknowledge, ask for next field. If they confirmed (yes/thanks): say Thanks and ask for next field. If unclear/inaudible: ask to repeat for the current field only. Do not skip or answer something they did not say.

What they just said (respond only to this): "${transcript}"
→ If they asked a question: answer it, then continue (e.g. ask for next field if needed). If they gave a value: extract it, acknowledge, ask for next field. If they confirmed (yes/thanks): say Thanks and ask for next field. If unclear/inaudible: ask to repeat for the current field only. Do not skip or answer something they did not say.

RECALL (what is the deductible / what did I say for X): When they ask what value we have for a field, reply with EXACTLY the value from "Data we have so far" above. E.g. if deductible is "500 dollars" say "I have the deductible as 500 dollars." Never use a different number or value. If we don't have that field yet, say "I don't have that one yet."

EXTRACTION (CRITICAL — field assignment and multi-value in one go):
- When the user provides MULTIPLE benefit values in one turn (e.g. "coverage is 80%, deductible 500, copay 20 dollars" or "80%, 500 dollars, 20 dollars, valid through December 2024"), extract EVERY value mentioned into extractedUpdates in a single response. Put each value in its correct field (coverage = %, deductible/copay = dollars, validity = date). Return all of them in one extractedUpdates object so we collect them in one go. Then acknowledge briefly and ask only for the next missing field (or "That's all I need, thank you." if none left).
- We are currently asking for "${nextFieldToAsk ?? 'none'}". When the user gives a single number, dollar amount, or percentage in response to our question, put it ONLY in "${nextFieldToAsk}". Do NOT put it in any other field (e.g. if we asked for deductible and they say "20 dollars", set ONLY {"deductible": "20 dollars"}, NOT copay). Your nextMessage must: acknowledge the value (e.g. "Got it, thanks." or "Okay, thank you.") then ask for the NEXT field only (e.g. "Can I get the copay?" or "Can I have the validity?"). NEVER say "Thank you, what is the deductible?" when they just gave you the deductible. NEVER re-ask the same field they just answered.
- If they explicitly name a field and a value (e.g. "deductible is 500 and copay is 25 percent"), extract each into the correct field. Otherwise, a single value goes ONLY into "${nextFieldToAsk}".
- VALIDITY: Only set validity when the user explicitly says a date, month, or year (e.g. "December 31st 2024", "valid through Dec 2024"). Do NOT set validity to any default or assumed date (e.g. "31st Dec 2024", "July 17 2025"). If they did not say anything about validity or a date, leave validity empty. Never invent a date. CRITICAL — If we do NOT have validity in "Data we have so far", never say a date in your nextMessage and never ask "is it [date] right?". Only ask "What is the validity?" or "Can I get the validity?" or "Can you provide the validity?". Only confirm a date for validity ("So the validity is [date], right?") if the user JUST said that date in this turn.
- Only ask them to repeat when transcript is exactly "User did not respond or was inaudible". Do not ask to repeat if they gave a number or amount.
- After extracting a value (or multiple): acknowledge once and ask for the NEXT missing field only.

WHAT TO SAY (check in this order). Use "Are we good?" / "Is that all you have?" / "Is it okay?" / a confirmation question ONLY after: (1) patient DOB when they asked for DOB alone, (2) recall when they ask what value we have and you gave it, (3) when they correct/change a value and you confirmed it, (4) when all fields collected and waiting for thank you. NEVER after a normal benefit value.
- If they GAVE a value for the current field (number/amount/dollars/percent/date): extract it, say ONE of "Got it, thanks." / "Thanks." / "Okay, thank you." / "Noted." then IMMEDIATELY ask for the NEXT field with a VARIED phrase (e.g. "Can I have the copay?"). Do NOT re-ask the same field. Do NOT say "Thank you, what is the [field]?" when they just gave you that field. Do NOT say "Are we good?" or "Is that all you have?" after a normal value.
- If they CONFIRM ("yes" / "thank you" / "yeah" / "that's it" / "we're good"): Check "Data we have so far". If all ${numFields} fields collected: say "Thank you for helping me with the verification. Have a great day." and set endCall true. If some fields still missing (show —): say "Thanks." then ask for the FIRST missing field only with a simple phrase like "Can I get the [field]?" or "May I have the [field]?" — NEVER say "I don't have that on my end" or "please provide the details" for benefit fields. extractedUpdates {}.
- If they ask what they said or what we have for a field (recall): "I have the [field] as [value]." or "I don't have that one yet." Then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" Do NOT ask for next field in this turn. extractedUpdates {}.
- If they ask to repeat or "what was the question?": Use ONLY a VARIED phrase for the field. Do NOT add a confirmation phrase after repeat. extractedUpdates {}. If we have all ${numFields} fields: "We have everything we need. Thanks." set endCall true only if they said thank you / that's all.
- If they say "goodbye" / "that's all" / "thank you" / "we're done" and we have all ${numFields} fields: say "Thank you for helping me with the verification. Have a great day." and set endCall true. If we are MISSING any field: do NOT set endCall true. Ask for the first missing field ONLY with a simple phrase: "Can I get the [first missing field]?" or "May I have the [first missing field]?" — NEVER say "I don't have these noted on my end" or "please provide the details". extractedUpdates {}.
- If they correct a value: put new value in extractedUpdates, say "Got it. So the [field] is [value], right?" Do NOT ask for next field in same turn. Wait for yes. Then ONE of "Are we good?" / "Is that all you have?" only here. extractedUpdates {}.
- If they ask "why do you need that?": "We're verifying benefit details for our patient." Do NOT add a confirmation phrase here. extractedUpdates {}.
- If they ask to confirm ("so deductible is 500?"): "Yes, that's correct." or "I have it as [value]." Then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" Do NOT ask for next field in same turn. extractedUpdates {}.
- If they say they need a moment ("let me check", "one sec"): "Sure, take your time." extractedUpdates {}.
- If they ask for info you don't have (e.g. policy number, member ID — NOT benefit fields): "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a benefit field still missing: "Can I get the [first missing field]?" only. For missing benefit fields (coverage, deductible, copay, validity) never say "I don't have that on my end" — only ask "Can I get the [field]?" extractedUpdates {}.
- If they ask "what are the details you want to know" / "what do you need to know": Ask for first missing field with a VARIED phrase. Do NOT add a confirmation phrase here. Do NOT list all fields. extractedUpdates {}.
- CRITICAL: NEVER say "I didn't get you" or "couldn't catch" when the user said something substantive. Only use a repeat phrase when transcript is EXACTLY "User did not respond or was inaudible." extractedUpdates as needed.
- If they say "how can I help" / "why are you calling" / "what's the purpose" / similar: One sentence — paraphrase the purpose naturally (different wording than last time if purpose was already stated). No name or DOB unless they ask identity next. If identity already cleared and missing benefit fields, you may briefly confirm purpose then ask for the next missing field. extractedUpdates {}.
- If transcript is EXACTLY "User did not respond or was inaudible" or silence: Say ONLY one short repeat request. Do NOT add a confirmation phrase or next field in this turn. extractedUpdates {}.
- If they ask to update or correct a value: put new value in extractedUpdates, say "Updated. I've got that. Thanks." Then "So can I get the next field?" if more needed.
- If they asked a general question (how are you): answer briefly. Do NOT add "Are we good?" Do not ask for a field in same turn. extractedUpdates {}.
- Otherwise: ${oneFieldRule}

Set endCall to true ONLY when (1) all ${numFields} fields are present AND (2) the user said thank you / yes / that's all / we're done / goodbye. When they JUST gave the last value (completing all fields), say "That's all I need, thank you." and set endCall FALSE. When they then say thank you or yes, say "Thank you for helping me with the verification. Have a great day." and set endCall TRUE. When all collected and they ask a question: answer fully, ask "Is that all you have?" and set endCall FALSE; when they say yes/thank you, say the closing and set endCall TRUE. If even one field is missing, set endCall to false and ask for the first missing field.

Respond with ONLY a JSON object. No markdown. Format:
{"nextMessage": "Short sentence", "extractedUpdates": {} or {"deductible": "100 dollars"} etc., "endCall": true or false}`;

    const geminiStart = Date.now();
    const fieldsCollectedPreview = fields
      .map((f) => `${f}=${(currentExtracted as Record<string, string | null>)[f] ?? '—'}`)
      .join(', ');
    this.logger.log(
      `[CallFlow] step=gemini_request_start | model=${GEMINI_MODEL} | lastAskedField=${lastAskedField ?? 'none'} | patientInfo=${patientInfo ? patientInfo.fullName : 'none'} | transcriptChars=${transcript.length} | fields=${fieldsCollectedPreview}`,
    );
    const result = await model.generateContent(prompt);
    const geminiMs = Date.now() - geminiStart;
    this.logger.log('[Gemini-Model]:', GEMINI_MODEL);
    this.logger.log(
      `[CallFlow] step=gemini_request_complete | model=${GEMINI_MODEL} | ms=${geminiMs} | [Gemini] getNextConversationTurn API call completed in ${geminiMs}ms`,
    );
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
            ? `Thanks. ${this.askForFieldPhrase(nextAfter)}`
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
            ? `Thanks. ${this.askForFieldPhrase(nextAfter)}`
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
      const totalMs = Date.now() - geminiStart;
      this.logger.log(
        `[Gemini] getNextConversationTurn whole process done in ${totalMs}ms (API: ${geminiMs}ms)`,
      );
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

  private isDollars(s: string): boolean {
    const t = String(s).trim().toLowerCase();
    return /\d+\s*dollars?|\$\s*\d+|\d+\s*\$|dollar\s*\d+/.test(t);
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
      const v = String(raw).trim();

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
        out.deductible = dol ? `$${dol[1] || dol[2] || dol[3]}` : v;
      } else if (field === 'copay') {
        const pct = v.match(/(\d+)\s*%|(\d+)\s*percent/i);
        const dol = v.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
        if (pct) {
          out.copay = `${pct[1] || pct[2]}%`;
        } else if (this.isDollars(v) && dol) {
          out.copay = `$${dol[1] || dol[2] || dol[3]}`;
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
        out.validity = normalized;
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
      const start = Date.now();
      const result = await model.generateContent(prompt);
      this.logger.log(
        `[Gemini] extractInsuranceDetails completed in ${Date.now() - start}ms`,
      );
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
}
