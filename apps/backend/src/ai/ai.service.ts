import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { VerificationService } from '../verification/verification.service';

/** Stable Pro model for conversation, extraction, and classification. */
const GEMINI_MODEL = 'gemini-2.5-pro';

@Injectable()
export class AiService {
  private gemini: GoogleGenerativeAI;

  constructor(
    @Inject(forwardRef(() => VerificationService))
    private readonly verificationService: VerificationService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('GEMINI_API_KEY loaded:', apiKey ? '✅ yes' : '❌ no');

    if (!apiKey) {
      throw new Error('❌ Missing GEMINI_API_KEY environment variable.');
    }

    this.gemini = new GoogleGenerativeAI(apiKey);
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
  ): Promise<string> {
    const model = this.gemini.getGenerativeModel({ model: GEMINI_MODEL });
    const patientBlock = patientInfo
      ? `
  PATIENT DETAILS (from database — use only when they ask): Full name: ${patientInfo.fullName}. Date of birth: ${patientInfo.dobFormatted ?? 'not provided'}. ${patientInfo.ssn ? `SSN/tax ID available; disclose only when they specifically ask for SSN or tax ID (e.g. "last four is ..." or full if required).` : 'No SSN on file.'}
`
      : '';
    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company (or their representative) to obtain patient benefit details — coverage, deductible, copay, and validity.
${patientBlock}
  CORE PERSONALITY:
  - Professional, polite, patient, and empathetic. You represent the dental practice and need the other party's help to get benefit information.
  - If they ask how you are, respond naturally and briefly (e.g., "I'm doing well, thank you! How about you?").
  - If they say you sound harsh or robotic, apologize warmly (e.g., "I'm so sorry — I just want to make sure we get the details right for our patient. I appreciate your help.").
  - Never admit to being an AI or a bot.
  - Keep replies to 1–2 short sentences. No markdown.

  END-OF-CALL CONTEXT (when this is used after we've already said goodbye): Answer their question briefly in one short sentence. Do NOT repeat the full intro ("I'm Reena from Went Dentals", "I want to verify the patient details", "hoping you can help"). NEVER say "That's great to hear. I'm calling to verify benefits for a patient, [name]." unless they explicitly asked "How can I help you?" or "How can I help?" — and even then prefer a short "I'm calling to verify benefits for a patient. Is there anything else you need?"
  END-OF-CALL CONTEXT (when this is used after we've already said goodbye): Answer their question briefly in one short sentence. Do NOT repeat the full intro ("I'm Reena from Went Dentals", "I want to verify the patient details", "hoping you can help"). NEVER say "That's great to hear. I'm calling to verify benefits for a patient, [name]." unless they explicitly asked "How can I help you?" or "How can I help?" — and even then prefer a short "I'm calling to verify benefits for a patient. Is there anything else you need?"

  User (person on the insurance side) said: ${userMessage}
  Reply:`;

    const result = await model.generateContent(prompt);
    return (
      result.response.text()?.trim() ??
      'I’m sorry, I missed that. What was that?'
    );
  }

  /**
   * Persist extracted call verification details to the database when the call ends.
   * Called by the media-stream handler as soon as the call is ended.
   */
  async saveCallVerification(
    payeeId: string,
    extracted: {
      coverage?: string | null;
      deductible?: string | null;
      copay?: string | null;
      validity?: string | null;
    },
    transcriptToAppend?: string,
  ) {
    return this.verificationService.verifyFromExtractedCall(
      payeeId,
      extracted,
      transcriptToAppend,
    );
  }

  /** Insurance fields we collect during verification (order must be preserved) */
  public static readonly INSURANCE_FIELDS = [
    'coverage',
    'deductible',
    'copay',
    'validity',
  ] as const;

  private hasValue(v: string | null): boolean {
    return v != null && String(v).trim().length > 0;
  }

  /** Pick a random phrase for asking a benefit field (coverage, deductible, copay, validity) */
  private askForFieldPhrase(field: string): string {
    const templates = [
      `What is the ${field}?`,
      `Can I get the ${field}?`,
      `May I have the ${field}?`,
      `Can you provide the ${field}?`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /** Returns missing field names in required order (coverage → deductible → copay → validity) */
  private getMissingFields(state: {
    coverage: string | null;
    deductible: string | null;
    copay: string | null;
    validity: string | null;
  }): string[] {
    const missing: string[] = [];
    if (!this.hasValue(state.coverage)) missing.push('coverage');
    if (!this.hasValue(state.deductible)) missing.push('deductible');
    if (!this.hasValue(state.copay)) missing.push('copay');
    if (!this.hasValue(state.validity)) missing.push('validity');
    return missing;
  }

  private allFieldsCollected(state: {
    coverage: string | null;
    deductible: string | null;
    copay: string | null;
    validity: string | null;
  }): boolean {
    return this.getMissingFields(state).length === 0;
  }

  /**
   * Classify whether the user is answering the current question or interrupting (correcting a value / asking something else).
   * Context: benefits verification call — dental practice (EVA) is speaking with the insurance company to get patient benefit details.
   */
  public async classifySegment(
    transcript: string,
    currentQuestion: string,
  ): Promise<'answer' | 'interruption'> {
    const model = this.gemini.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `You are classifying a short voice transcript from a patient benefit verification call. The caller (EVA) is from the dental practice; the other party is from the insurance company and is providing benefit details (coverage, deductible, copay, validity).

Current question EVA asked: "${currentQuestion}"

What the person on the insurance side just said: "${transcript}"

Are they:
- Answering that question (giving a benefit value: coverage, deductible, copay, validity, or similar)? Reply: answer
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
    currentExtracted: {
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
  ): Promise<{
    updates: Partial<{
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    }>;
    reply: string;
  }> {
    const model = this.gemini.getGenerativeModel({ model: GEMINI_MODEL });
    const current = JSON.stringify(currentExtracted, null, 0);
    const patientBlock = patientInfo
      ? `
Patient details (from database — use when they ask): Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. ${patientInfo.ssn ? 'SSN/tax ID available; disclose when they ask for SSN or tax ID.' : 'No SSN on file.'}
`
      : '';
    const prompt = `You are handling an interruption during a patient benefit verification call. You are EVA (Reena), a customer care representative from Went Dentals, speaking with the insurance company to obtain benefit details for a patient. Be professional, polite, and patient. Never say you are a bot or AI.
${patientBlock}
Current benefit data we have: ${current}

What the person on the insurance side just said: "${userMessage}"

- If they ask what we have for a field (recall): set "updates" to {} and reply with full details. If we have it: "I have the [field] as [value]." Then "Are we good?" only. Do NOT ask for the next field in the same turn. If we don't have it: "I don't have that one yet. Are we good?" only.
- When they confirm (yes / yeah it's clear / we're good): reply "Thanks. So can I get the next field?" or "Can I get the [next missing field]?"
- If they ask to repeat or "what was the question?": set "updates" to {} and reply with ONLY a varied phrase for the field (e.g. "Can I get the deductible?"). Do NOT add "Are we good?" or "Is the value correct?"
- If they correct a value: put ONLY that field in "updates" with the new value. Reply "Got it. So the [field] is [value], right?" Do NOT ask for the next field in the same turn. Wait for yes; then ask for next field.
- If they ask "why do you need that?": set "updates" to {} and reply "We're verifying benefit details for our patient." Do NOT add "Are we good?" or "Is the value correct?"
- If they complain about your tone or ask a general question, answer politely and briefly, then offer to continue.
- If they ask for information we do NOT have (e.g. policy number, member ID): set "updates" to {} and reply "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?"
- If they ask who you are or to verify yourself: set "updates" to {} and reply "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details. I appreciate your help."
- If they provide a benefit value (number/dollar/percent) without correcting: acknowledge "Thank you." / "Got it, thanks."
- For any other question, set "updates" to {} and give a brief, professional reply, then return to the next field if needed.

Respond with ONLY a single JSON object. No markdown. Format: {"updates": {} or {"copay": "25%"}, "reply": "Short spoken reply"}

Examples (use current data to fill [value] and next field):
- "Who is this?" → {"updates": {}, "reply": "I'm Reena from Went Dentals. I'm calling to verify patient benefit details. I appreciate your help."}
- "What did you have for deductible?" → {"updates": {}, "reply": "I have the deductible as 500 dollars. Are we good?"} (recall — do NOT ask for next field in same turn)
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
    currentExtracted: {
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
  ): Promise<{
    nextMessage: string;
    extractedUpdates: Partial<{
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    }>;
    endCall?: boolean;
  }> {
    const model = this.gemini.getGenerativeModel({ model: GEMINI_MODEL });
    const current = JSON.stringify(currentExtracted);

    const nextFieldToAsk = !this.hasValue(currentExtracted.coverage)
      ? 'coverage'
      : !this.hasValue(currentExtracted.deductible)
        ? 'deductible'
        : !this.hasValue(currentExtracted.copay)
          ? 'copay'
          : !this.hasValue(currentExtracted.validity)
            ? 'validity'
            : null;

    const oneFieldRule =
      nextFieldToAsk === null
        ? 'Only set endCall to true when all four fields are collected AND the user said thank you / that\'s all / we\'re done. Say a short closing, e.g. "That\'s everything I need. Thank you so much for your help." Do NOT repeat your name or company — that intro is for the start only. NEVER say "That\'s great to hear. I\'m calling to verify benefits for a patient, [name]." at the end.'
        : `Ask for ONE field only. VARY the phrase: "What is the ${nextFieldToAsk}?" / "Can I get the ${nextFieldToAsk}?" / "May I have the ${nextFieldToAsk}?" / "Can you provide the ${nextFieldToAsk}?" If you just got a value from them: acknowledge ("Got it, thanks." or "Thanks.") then IMMEDIATELY ask for the NEXT field. Do NOT say "Is that all you have?" or "Are we good?" after a normal value. Keep nextMessage under 25 words.`;

    const patientBlock = patientInfo
      ? `
Patient info (from database — use when they ask): Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. First name: ${patientInfo.firstName}. Last name: ${patientInfo.lastName}.${patientInfo.ssn ? ` SSN/tax ID: available; only disclose when they specifically ask for SSN or tax ID.` : ' No SSN on file.'}
- Give FULL value only when asked. After patient DOB (or SSN when asked), use ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" then only when user says yes / thank you, ask for benefit fields.
- When they say "how can I help" / "how can I help you" / "how can I help you today" / "I'm doing good how can I help you" / "I'm doing great, how can I help": Say ONLY "I want to verify the patient details." or "I want to verify the benefits of a patient." Do NOT ask for any field. Do NOT say "sorry I didn't get you". extractedUpdates {}.
- When they ask "identify yourself" / "who are you": Answer ONLY "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details." Do NOT add "Are we good?" or ask for a field. extractedUpdates {}.
- When they ask "what is the patient name" / "patient name" / "patient full name" / "what is the patient full name": Answer ONLY "The patient is ${patientInfo.fullName}." or "The full name is ${patientInfo.fullName}." Do NOT add "Are we good?" or ask for a field in the same turn. extractedUpdates {}.
- When they ask "what is the date of birth of the patient" / "patient date of birth" / "date of birth" / "DOB" / "what is the date of birth": Your nextMessage must be ONLY: "The patient date of birth is ${patientInfo.dobFormatted ?? 'not provided'}." followed by ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" / "Are we clear?" STOP there. Do NOT add "May I have the coverage?" or "Can I get the coverage?" or any request for a benefit field in this turn. Only when they reply "yes" / "we're good" / "thank you" in the NEXT turn do you ask for the first benefit field (coverage). extractedUpdates {}.
- When they ask "what is the date of birth of the patient" / "patient date of birth" / "date of birth" / "DOB" / "what is the date of birth": Your nextMessage must be ONLY: "The patient date of birth is ${patientInfo.dobFormatted ?? 'not provided'}." followed by ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" / "Are we clear?" STOP there. Do NOT add "May I have the coverage?" or "Can I get the coverage?" or any request for a benefit field in this turn. Only when they reply "yes" / "we're good" / "thank you" in the NEXT turn do you ask for the first benefit field (coverage). extractedUpdates {}.
- When they ask for SSN / tax ID / TIN: ${patientInfo.ssn ? 'Give the value they need (e.g. full SSN or "the last four is [digits]"). Then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" Do NOT ask for next field in same turn. extractedUpdates {}.' : '"I don\'t have that on my end. Is there anything else I can provide?" extractedUpdates {}.'}
- When they CONFIRM after DOB ("yes" / "we're good" / "yeah"): Now ask for first benefit field using a varied phrase: "Can I get the coverage?" / "May I have the coverage?" / "Can you provide the coverage?" (use one randomly). extractedUpdates {}.
- When they ask "what are the details you want to know" / "what do you need" / "what details do you need": Ask for first missing field only (vary: "Can I get the [field]?" / "May I have the [field]?" / "Can you provide the [field]?"). Do NOT add "Are we good?" here. Do NOT list all four. extractedUpdates {}.
- When they ask for info you do NOT have (policy number, member ID, etc.): "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a field still missing use varied phrase for that field. extractedUpdates {}.
`
      : `
- When they say "how can I help" / "how can I help you" / "how can I help you today": Say ONLY "I want to verify the patient details." or "I want to verify the benefits of a patient." extractedUpdates {}.
- When they ask "identify yourself" / "who are you": "I'm Reena from Went Dentals. I'm calling to verify patient benefit details." Do NOT add acknowledgment. extractedUpdates {}.
- When they ask for information you do NOT have: "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" extractedUpdates {}.
`;

    const recallBlock = `
CONFIRMATION PHRASES — Use "Is it okay?" / "Is that all you have?" / "Are we good?" / "Are we clear?" ONLY in these cases: (1) After patient DATE OF BIRTH — then ask one of those and only when they say "yes" / "we're good" ask for the first benefit field (coverage). (2) After RECALL — when they ask "what is the deductible?" / "do you have the deductible?" give the value (e.g. "It is $90." / "I have the deductible as $90.") then ONE of "Is that all you have?" / "Are we good?" / "Are we clear?" at random. Do NOT use these phrases after a normal value (coverage, deductible, copay, validity).
- When they GIVE a value (number/amount) for a field in normal flow: extract it, say "Got it, thanks." or "Thanks.", then IMMEDIATELY ask for the NEXT field (e.g. "Can you provide the deductible?"). Do NOT say "Is that all you have?" or "Are we good?" after a normal value. Do NOT wait for confirmation before asking the next field.
- When they CONFIRM ("yes" / "thank you" / "we're good") after you asked "Are we good?" (e.g. after DOB or after recall): say "Thanks." and ask for the next field, or if all four collected and they said thank you, say brief closing and set endCall true.
- Value after hold: say "So the [field] is [value], right?" then wait for yes; then ask next field. extractedUpdates {}.
- After patient DOB: give DOB then ONE of "Are we good?" / "Is that all you have?" / "Are we clear?" Only when they say "yes" / "we're good" ask for first benefit field (coverage). extractedUpdates {}.
- When they ask for RECALL ("what is the deductible?" / "do you have the deductible?"): give the value from data (e.g. "It is $90." / "I have the deductible as $90.") then ONE of "Is that all you have?" / "Are we good?" / "Are we clear?" (random). Do NOT ask for next field in same turn. extractedUpdates {}.
- When they correct a value: put NEW value in extractedUpdates, say "Got it. So the [field] is [value], right?" Wait for yes then ask next field. extractedUpdates for the corrected field only.
CONFIRMATION PHRASES — Use "Is it okay?" / "Is that all you have?" / "Are we good?" / "Are we clear?" ONLY in these cases: (1) After patient DATE OF BIRTH — then ask one of those and only when they say "yes" / "we're good" ask for the first benefit field (coverage). (2) After RECALL — when they ask "what is the deductible?" / "do you have the deductible?" give the value (e.g. "It is $90." / "I have the deductible as $90.") then ONE of "Is that all you have?" / "Are we good?" / "Are we clear?" at random. Do NOT use these phrases after a normal value (coverage, deductible, copay, validity).
- When they GIVE a value (number/amount) for a field in normal flow: extract it, say "Got it, thanks." or "Thanks.", then IMMEDIATELY ask for the NEXT field (e.g. "Can you provide the deductible?"). Do NOT say "Is that all you have?" or "Are we good?" after a normal value. Do NOT wait for confirmation before asking the next field.
- When they CONFIRM ("yes" / "thank you" / "we're good") after you asked "Are we good?" (e.g. after DOB or after recall): say "Thanks." and ask for the next field, or if all four collected and they said thank you, say brief closing and set endCall true.
- Value after hold: say "So the [field] is [value], right?" then wait for yes; then ask next field. extractedUpdates {}.
- After patient DOB: give DOB then ONE of "Are we good?" / "Is that all you have?" / "Are we clear?" Only when they say "yes" / "we're good" ask for first benefit field (coverage). extractedUpdates {}.
- When they ask for RECALL ("what is the deductible?" / "do you have the deductible?"): give the value from data (e.g. "It is $90." / "I have the deductible as $90.") then ONE of "Is that all you have?" / "Are we good?" / "Are we clear?" (random). Do NOT ask for next field in same turn. extractedUpdates {}.
- When they correct a value: put NEW value in extractedUpdates, say "Got it. So the [field] is [value], right?" Wait for yes then ask next field. extractedUpdates for the corrected field only.
`;

    const afterResumeBlock =
      lastAskedField && ['coverage', 'deductible', 'copay', 'validity'].includes(lastAskedField)
        ? `
AFTER-HOLD CONTEXT: They just came back from hold. We were asking for "${lastAskedField}" ONLY.
- If they now gave a value (number, dollar, percent): put it in extractedUpdates for "${lastAskedField}" ONLY. Do NOT put it in any other field. Then VERIFY with acknowledgment: say "So the ${lastAskedField} is [value], right?" or "Just to confirm, the value for this field is [value], correct?" Do NOT ask for the next field in this turn. Wait for them to say "yes" in the next turn; only then ask for the next field.
- When they CONFIRM after this ("yes" / "correct" / "that's right" / "yeah"): then say "Thanks." and ask for the next missing field with a varied phrase. extractedUpdates {}.
- If they ask what we need or what was the question: re-ask "${lastAskedField}" with a varied phrase. set extractedUpdates {}.
- If they did not give a value (inaudible/unclear): "Can I get the ${lastAskedField}?" again and set extractedUpdates {}.
`
        : '';

    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company to obtain patient benefit details: coverage, deductible, copay, and validity.

STAY IN SYNC — Your reply must directly address what the user JUST said in this turn. Do not skip ahead (e.g. if they asked a question, answer it first; do not ask for a field until you have answered). Do not refer to something they did not say. One turn = one exchange: they said X, you respond to X. Keep the conversation in phase so it never feels like you are ahead or behind.

PACE & RESPONSIVENESS — Do not delay the conversation. When the user asks a question, answer it directly and concisely in one short sentence. When they share a value (number, amount, date), acknowledge immediately ("Got it, thanks." or "Thanks.") and ask for the next field right away. Keep replies brief so the call moves smoothly.

CRITICAL — CONVERSATION FLOW (go with the flow; do NOT ask for coverage or any benefit field until the user has said "how can I help" and you have responded, and if they asked patient name/DOB you have given those and they said "we're good"):
- If the user JUST asked for date of birth / DOB (e.g. "what is the date of birth?", "patient date of birth?", "what is the DOB?"): nextMessage must be ONLY the DOB answer plus one confirmation phrase ("Are we good?" / "Is that all you have?" / "Are we clear?"). Do NOT add "May I have the coverage?" or "Can I get the coverage?" or any other sentence. Wait for their "yes" / "we're good" in the next turn before asking for coverage.
- When they say "How can I help you?" / "How can I help?": Say ONLY "I need some details to verify the patient benefits." or "I want to verify the benefits of a patient." Do NOT ask for coverage or any field yet. extractedUpdates {}.
- When they ask "What is the patient name?" / "Patient name?": Give full name only. Do NOT ask "Are we good?" or any field. extractedUpdates {}.
- When they ask "What is the date of birth?" / "DOB?" / "patient date of birth?" / "what is the date of birth?": Say ONLY the date of birth sentence then ONE of "Are we good?" / "Is that all you have?" / "Are we clear?" STOP. Do NOT say "May I have the coverage?" or "Can I get the coverage?" or any benefit field in this turn. Only when they say "yes" / "we're good" in the NEXT turn do you ask for the first benefit field (coverage).
- When they say "What do you need?" / "What details do you need?" after you said you want to verify benefits: ask for the first missing benefit field (e.g. coverage). Do NOT repeat your purpose. extractedUpdates {}.
- When they GIVE a value for a field (coverage, deductible, copay, validity): extract it, say "Got it, thanks." or "Thanks.", then IMMEDIATELY ask for the NEXT field. Do NOT say "Is that all you have?" or "Are we good?" after a normal value.
- Use "Is that all you have?" / "Are we good?" / "Are we clear?" ONLY after (1) patient DOB, or (2) when they ask for recall ("what is the deductible?" etc.) and you gave the value. Never after a normal benefit value.
- NEVER say "That's great to hear. I'm calling to verify benefits for a patient, [name]." at the end of the call or in closing unless the user just asked "How can I help you?".
- End the call ONLY when all four fields are collected AND the user says thank you / that's all / we're done / goodbye. Say a brief closing only. Never repeat the opening intro or your purpose at the end.
STAY IN SYNC — Your reply must directly address what the user JUST said in this turn. Do not skip ahead (e.g. if they asked a question, answer it first; do not ask for a field until you have answered). Do not refer to something they did not say. One turn = one exchange: they said X, you respond to X. Keep the conversation in phase so it never feels like you are ahead or behind.

PACE & RESPONSIVENESS — Do not delay the conversation. When the user asks a question, answer it directly and concisely in one short sentence. When they share a value (number, amount, date), acknowledge immediately ("Got it, thanks." or "Thanks.") and ask for the next field right away. Keep replies brief so the call moves smoothly.

CRITICAL — CONVERSATION FLOW (go with the flow; do NOT ask for coverage or any benefit field until the user has said "how can I help" and you have responded, and if they asked patient name/DOB you have given those and they said "we're good"):
- If the user JUST asked for date of birth / DOB (e.g. "what is the date of birth?", "patient date of birth?", "what is the DOB?"): nextMessage must be ONLY the DOB answer plus one confirmation phrase ("Are we good?" / "Is that all you have?" / "Are we clear?"). Do NOT add "May I have the coverage?" or "Can I get the coverage?" or any other sentence. Wait for their "yes" / "we're good" in the next turn before asking for coverage.
- When they say "How can I help you?" / "How can I help?": Say ONLY "I need some details to verify the patient benefits." or "I want to verify the benefits of a patient." Do NOT ask for coverage or any field yet. extractedUpdates {}.
- When they ask "What is the patient name?" / "Patient name?": Give full name only. Do NOT ask "Are we good?" or any field. extractedUpdates {}.
- When they ask "What is the date of birth?" / "DOB?" / "patient date of birth?" / "what is the date of birth?": Say ONLY the date of birth sentence then ONE of "Are we good?" / "Is that all you have?" / "Are we clear?" STOP. Do NOT say "May I have the coverage?" or "Can I get the coverage?" or any benefit field in this turn. Only when they say "yes" / "we're good" in the NEXT turn do you ask for the first benefit field (coverage).
- When they say "What do you need?" / "What details do you need?" after you said you want to verify benefits: ask for the first missing benefit field (e.g. coverage). Do NOT repeat your purpose. extractedUpdates {}.
- When they GIVE a value for a field (coverage, deductible, copay, validity): extract it, say "Got it, thanks." or "Thanks.", then IMMEDIATELY ask for the NEXT field. Do NOT say "Is that all you have?" or "Are we good?" after a normal value.
- Use "Is that all you have?" / "Are we good?" / "Are we clear?" ONLY after (1) patient DOB, or (2) when they ask for recall ("what is the deductible?" etc.) and you gave the value. Never after a normal benefit value.
- NEVER say "That's great to hear. I'm calling to verify benefits for a patient, [name]." at the end of the call or in closing unless the user just asked "How can I help you?".
- End the call ONLY when all four fields are collected AND the user says thank you / that's all / we're done / goodbye. Say a brief closing only. Never repeat the opening intro or your purpose at the end.

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
- "Can you repeat?" / "What was the question?" → Ask for the CURRENT field with a VARIED phrase only. Do NOT add "Are we good?" or "Is the value correct?" after repeat. extractedUpdates {}. If we have all four: "We have everything we need. Thanks." set endCall true.
- "Goodbye" / "That's all" / "We're done" when we are missing any field → Do NOT set endCall true. "I still need the [first missing]. Can you provide that?" extractedUpdates {}.
- "Actually I said X not Y" / "Update [field] to X" → Put the corrected value in extractedUpdates, say "Got it. So the [field] is [value], right?" Do NOT ask for next field in same turn. Wait for yes. extractedUpdates {}.
- "Why do you need that?" → "We're verifying benefit details for our patient." Do NOT add "Are we good?" extractedUpdates {}.
- "What about [other field]?" → Answer. Do NOT add "Are we good?" unless it was a recall. extractedUpdates {}.
- "So you have [field] as [value]?" / "Confirm [field] is [value]" → "Yes, that's correct." or "I have it as [value]." If more needed, ask for next field. Do NOT add "Are we good?" here. extractedUpdates {}.
- Recall or DOB: give full details, then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" Patient name or identity: do NOT add a confirmation phrase. DOB: add one of those three and wait for yes / thank you before asking for fields.

Data we have so far (use ONLY these values for recall — never invent or guess): ${current}
Explicit values: coverage = ${currentExtracted.coverage ?? 'not collected'}, deductible = ${currentExtracted.deductible ?? 'not collected'}, copay = ${currentExtracted.copay ?? 'not collected'}, validity = ${currentExtracted.validity ?? 'not collected'}.
We are currently asking for: ${nextFieldToAsk ?? 'nothing (all done)'}.

What they just said (respond only to this): "${transcript}"
→ If they asked a question: answer it, then continue (e.g. ask for next field if needed). If they gave a value: extract it, acknowledge, ask for next field. If they confirmed (yes/thanks): say Thanks and ask for next field. If unclear/inaudible: ask to repeat for the current field only. Do not skip or answer something they did not say.

What they just said (respond only to this): "${transcript}"
→ If they asked a question: answer it, then continue (e.g. ask for next field if needed). If they gave a value: extract it, acknowledge, ask for next field. If they confirmed (yes/thanks): say Thanks and ask for next field. If unclear/inaudible: ask to repeat for the current field only. Do not skip or answer something they did not say.

RECALL (what is the deductible / what did I say for X): When they ask what value we have for a field, reply with EXACTLY the value from "Data we have so far" above. E.g. if deductible is "500 dollars" say "I have the deductible as 500 dollars." Never use a different number or value. If we don't have that field yet, say "I don't have that one yet."

EXTRACTION:
- Any number, dollar amount ($), or percentage in their message that fits a benefit field → put it in extractedUpdates. If they give multiple values in one sentence (e.g. "deductible is 500 and copay is 25 percent"), extract ALL that apply into extractedUpdates. Examples: "deductible is 100$" → {"deductible": "100 dollars"}; "50 dollars" for copay → {"copay": "50 dollars"}; "thirty percent" → {"copay": "30 percent"}. When we are asking for "${nextFieldToAsk}", a number or amount is very likely the answer — extract it.
- Only ask them to repeat when transcript is exactly "User did not respond or was inaudible". Do not ask to repeat if they gave a number or amount.
- After extracting a value (or multiple): acknowledge once and ask for the NEXT missing field only.

WHAT TO SAY (check in this order). After the user has given a complete answer, acknowledge then ask ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" at random. Do NOT ask for the next field until they confirm (yes / thank you).
- If they CONFIRM ("yes" / "thank you" / "yeah" / "that's it" / "we're good"): "Thanks." then ask for the next field with a varied phrase. If all four fields collected and they said thank you / that's all: say a brief closing and set endCall true. extractedUpdates {}.
- If they ask what they said or what we have for a field (recall): "I have the [field] as [value]." or "I don't have that one yet." Then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" Do NOT ask for next field in this turn. extractedUpdates {}.
- If they ask to repeat or "what was the question?": Use ONLY a VARIED phrase for the field. Do NOT add a confirmation phrase after repeat. extractedUpdates {}. If we have all four: "We have everything we need. Thanks." set endCall true only if they said thank you / that's all.
- If they say "goodbye" / "that's all" / "thank you" / "we're done" and we have all four: say a brief closing and set endCall true. If we are MISSING any field: do NOT set endCall true. "I still need the [first missing field]. Can you provide that?" extractedUpdates {}.
- If they correct a value: put new value in extractedUpdates, say "Got it. So the [field] is [value], right?" or "Is that all you have?" Do NOT ask for next field in same turn. Wait for yes. extractedUpdates {}.
- If they ask "why do you need that?": "We're verifying benefit details for our patient." Do NOT add a confirmation phrase here. extractedUpdates {}.
- If they ask to confirm ("so deductible is 500?"): "Yes, that's correct." or "I have it as [value]." Then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" Do NOT ask for next field in same turn. extractedUpdates {}.
- If they say they need a moment ("let me check", "one sec"): "Sure, take your time." extractedUpdates {}.
- If they ask for info you don't have: "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a field still missing: "So can I get the [first missing field]?" extractedUpdates {}.
- If they ask "what are the details you want to know" / "what do you need to know": Ask for first missing field with a VARIED phrase. Do NOT add a confirmation phrase here. Do NOT list all fields. extractedUpdates {}.
- CRITICAL: NEVER say "I didn't get you" or "couldn't catch" when the user said something substantive. Only use a repeat phrase when transcript is EXACTLY "User did not respond or was inaudible." extractedUpdates as needed.
- If they say "how can I help" / "how can I help you" etc.: "I want to verify the patient details." or "I want to verify the benefits of a patient." Only. extractedUpdates {}.
- If transcript is EXACTLY "User did not respond or was inaudible" or silence: Say ONLY one short repeat request. Do NOT add a confirmation phrase or next field in this turn. extractedUpdates {}.
- If they gave a value for the current field (number/amount): extract it, say "Got it, thanks." or "Thanks.", then ONE of "Is it okay?" / "Is that all you have?" / "Are we good?" (pick at random). Do NOT ask for the next field in this turn. Wait for them to say yes or thank you in the next turn.
- If they ask to update or correct a value: put new value in extractedUpdates, say "Updated. I've got that. Thanks." Then "So can I get the next field?" if more needed.
- If they asked a general question (how are you): answer briefly. Do NOT add "Are we good?" Do not ask for a field in same turn. extractedUpdates {}.
- Otherwise: ${oneFieldRule}

Set endCall to true ONLY when (1) all four fields are present AND (2) the user said thank you / that's all / we're done / goodbye. If they have not said thank you or that's all yet, do NOT set endCall true even if all four are collected — instead ask one of "Is it okay?" / "Is that all you have?" / "Are we good?" and wait for their confirmation. If even one field is missing, set endCall to false and ask for the first missing field.

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

      const looksLikeDidntGet =
        /didn'?t\s+(get|catch|understand)|can you (repeat|share|say)/i.test(
          nextMessage,
        );
      const transcriptHasValue =
        transcript !== 'User did not respond or was inaudible.' &&
        transcript !== 'User did not respond or was inaudible' &&
        /\d+|dollar|percent|%\s*\$/.test(transcript);

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
          );
          nextMessage = nextAfter
            ? `Thanks. ${this.askForFieldPhrase(nextAfter)}`
            : `Thanks. ${this.askForFieldPhrase('validity')}`;
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
          );
          nextMessage = nextAfter
            ? `Thanks. ${this.askForFieldPhrase(nextAfter)}`
            : `Thanks. ${this.askForFieldPhrase('validity')}`;
        }
      }

      const mergedState = {
        coverage: extractedUpdates.coverage ?? currentExtracted.coverage,
        deductible: extractedUpdates.deductible ?? currentExtracted.deductible,
        copay: extractedUpdates.copay ?? currentExtracted.copay,
        validity: extractedUpdates.validity ?? currentExtracted.validity,
      };

      const missingFields = this.getMissingFields(mergedState);
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
    current: {
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    },
    justFilled: string,
    value: string,
  ): string | null {
    const updated = { ...current, [justFilled]: value };
    const has = (v: string | null) => v != null && String(v).trim().length > 0;
    if (!has(updated.coverage)) return 'coverage';
    if (!has(updated.deductible)) return 'deductible';
    if (!has(updated.copay)) return 'copay';
    if (!has(updated.validity)) return 'validity';
    return null;
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
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
    };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
      const monthKey = dmy[2].toLowerCase().replace(/ember$/, '').replace(/uary$/, '').slice(0, 3);
      const monthNum = months[monthKey] ?? months[dmy[2].toLowerCase().slice(0, 3)];
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
      const monthNum = months[mdy[1].toLowerCase().slice(0, 3)] ?? months[mdy[1].toLowerCase()];
      const day = parseInt(mdy[2], 10);
      const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3];
      if (monthNum !== undefined && day >= 1 && day <= 31) {
        return `${ord(day)} ${monthNames[monthNum]} ${year}`;
      }
    }

    // Try "December 2028" / "Dec 2028" (month and year only) → treat as 1st of that month
    const my = t.match(/(\w+)\s+(\d{2,4})/i);
    if (my) {
      const monthNum = months[my[1].toLowerCase().slice(0, 3)] ?? months[my[1].toLowerCase()];
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
      /\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t) ||
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i.test(t) ||
      /\d{4}|20\d{2}/.test(t)
    );
  }

  /**
   * Validates and normalizes extracted benefit values.
   * - coverage: must be percentage
   * - deductible, copay: must be dollars
   * - validity: must be date (month and year); normalized to "21st Dec 2028"
   * Returns either normalized updates to merge, or a polite correction message for the user.
   */
  public validateAndNormalizeBenefitExtracted(
    extracted: {
      coverage?: string | null;
      deductible?: string | null;
      copay?: string | null;
      validity?: string | null;
    },
    userSaid: string,
  ): { ok: true; normalized: Record<string, string> } | { ok: false; correctionMessage: string; invalidField: string } {
    const quote = (v: string) => (v && v.length > 25 ? v.slice(0, 22) + '...' : v) || 'that';
    const out: Record<string, string> = {};

    if (extracted.coverage != null && String(extracted.coverage).trim()) {
      const v = String(extracted.coverage).trim();
      if (!this.isPercentage(v)) {
        return {
          ok: false,
          invalidField: 'coverage',
          correctionMessage: `I noticed you said "${quote(v)}". For coverage, I need that as a percentage. Could you share it again?`,
        };
      }
      const pct = v.match(/(\d+)\s*%|(\d+)\s*percent/i);
      out.coverage = pct ? `${pct[1] || pct[2]}%` : v;
    }
    if (extracted.deductible != null && String(extracted.deductible).trim()) {
      const v = String(extracted.deductible).trim();
      if (!this.isDollars(v)) {
        return {
          ok: false,
          invalidField: 'deductible',
          correctionMessage: `I noticed you said "${quote(v)}". For the deductible, I need that in dollars. Could you share it again?`,
        };
      }
      const dol = v.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
      out.deductible = dol ? `$${dol[1] || dol[2] || dol[3]}` : v;
    }
    if (extracted.copay != null && String(extracted.copay).trim()) {
      const v = String(extracted.copay).trim();
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
    }
    if (extracted.validity != null && String(extracted.validity).trim()) {
      const v = String(extracted.validity).trim();
      const normalized = this.normalizeValidity(v);
      if (!normalized || !this.looksLikeDate(v)) {
        return {
          ok: false,
          invalidField: 'validity',
          correctionMessage: `I noticed you said "${quote(v)}". For validity, I need a date with month and year. Could you share it again?`,
        };
      }
      out.validity = normalized;
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

  public async extractInsuranceDetails(text: string): Promise<{
    coverage: string | null;
    deductible: string | null;
    copay: string | null;
    validity: string | null;
  }> {
    try {
      const prompt = `
      Extract the following details from the insurance text:
      - Coverage
      - Deductible
      - Copay
      - Validity

      Return ONLY a valid JSON object in this format:
      {
        "coverage": "...",
        "deductible": "...",
        "copay": "...",
        "validity": "..."
      }

      If any field is missing in the text, set it to null.

      Text:
      ${text}
    `;

      // Gemini model selection — adjust as needed
      const model = this.gemini.getGenerativeModel({
        model: GEMINI_MODEL,
      });

      const result = await model.generateContent(prompt);
      let jsonString = result.response.text().trim() || '{}';
      jsonString;

      // Remove code block markers if present
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

      return {
        coverage: parsed.coverage ?? null,
        deductible: parsed.deductible ?? null,
        copay: parsed.copay ?? null,
        validity: parsed.validity ?? null,
      };
    } catch (err) {
      console.error('❌ Error extracting insurance details from Gemini:', err);
      return {
        coverage: null,
        deductible: null,
        copay: null,
        validity: null,
      };
    }
  }
}
