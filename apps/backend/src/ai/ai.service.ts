import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private gemini: GoogleGenerativeAI;

  constructor() {
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
  public async replyToUser(userMessage: string): Promise<string> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company (or their representative) to obtain patient benefit details — coverage, deductible, copay, and validity.

  CORE PERSONALITY:
  - Professional, polite, patient, and empathetic. You represent the dental practice and need the other party's help to get benefit information.
  - If they ask how you are, respond naturally and briefly (e.g., "I'm doing well, thank you! How about you?").
  - If they say you sound harsh or robotic, apologize warmly (e.g., "I'm so sorry — I just want to make sure we get the details right for our patient. I appreciate your help.").
  - Never admit to being an AI or a bot.
  - Keep replies to 1–2 short sentences. No markdown.

  User (person on the insurance side) said: ${userMessage}
  Reply:`;

    const result = await model.generateContent(prompt);
    return (
      result.response.text()?.trim() ??
      'I’m sorry, I missed that. What was that?'
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
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
  public async handleInterruption(
    userMessage: string,
    currentExtracted: {
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    },
  ): Promise<{
    updates: Partial<{
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    }>;
    reply: string;
  }> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const current = JSON.stringify(currentExtracted, null, 0);
    const prompt = `You are handling an interruption during a patient benefit verification call. You are EVA (Reena), a customer care representative from Went Dentals, speaking with the insurance company to obtain benefit details for a patient. Be professional, polite, and patient. Never say you are a bot or AI.

Current benefit data we have: ${current}

What the person on the insurance side just said: "${userMessage}"

- If they ask what we have for a field: set "updates" to {} and reply with full details. If we have it: "I have the [field] as [value]. Let me know if you'd like to correct that. Is the value correct?" or "Are we good?" Do NOT ask for the next field in the same turn. If we don't have it: "I don't have that one yet. Is the value correct?" or "Are we good?"
- When they confirm (yes / yeah it's clear / we're good): reply "So can I get the next field?" or "Can I get the [next missing field]?"
- If they ask to repeat or "what was the question?": set "updates" to {} and reply "Can I get the [next missing field]?" Then "Is the value correct?" or "Are we good?" (e.g. "Can I get the deductible? Is the value correct?")
- If they correct a value: put ONLY that field in "updates" with the new value, reply "Got it, I've got that. Thanks. So can I get the next field?" or "Can I get the [next missing field]?" if any.
- If they ask "why do you need that?": set "updates" to {} and reply "We're verifying benefit details for our patient. Is the value correct?" or "Are we good?" Do NOT ask for the field in the same turn.
- If they complain about your tone or ask a general question, answer politely and briefly, then offer to continue.
- If they ask for information we do NOT have (e.g. policy number, member ID): set "updates" to {} and reply "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?"
- If they ask who you are or to verify yourself: set "updates" to {} and reply "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details. I appreciate your help."
- If they provide a benefit value (number/dollar/percent) without correcting: acknowledge "Thank you." / "Got it, thanks."
- For any other question, set "updates" to {} and give a brief, professional reply, then return to the next field if needed.

Respond with ONLY a single JSON object. No markdown. Format: {"updates": {} or {"copay": "25%"}, "reply": "Short spoken reply"}

Examples (use current data to fill [value] and next field):
- "Who is this?" → {"updates": {}, "reply": "I'm Reena from Went Dentals. I'm calling to verify patient benefit details. I appreciate your help."}
- "What did you have for deductible?" → {"updates": {}, "reply": "I have the deductible as 500 dollars. Let me know if you'd like to correct that. Is the value correct?" or "Are we good?"} (do NOT ask for next field in same turn)
- When they say "yes" / "yeah it's clear" → {"updates": {}, "reply": "So can I get the next field?" or "Can I get the deductible?"}
- "Can you repeat the question?" → {"updates": {}, "reply": "Can I get the deductible?"} (use a VARIED phrase for the next missing field only: "What is the [field]?" / "Can I get the [field]?" / "May I have the [field]?" / "Can you provide the [field]?" — do NOT add "Are we good?" or "Is the value correct?")
- "Actually copay is 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Got it, I've got that. Thanks. So can I get the validity?"}
- "Why do you need that?" → {"updates": {}, "reply": "We're verifying benefit details for our patient. Is the value correct?" or "Are we good?"}`;

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
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
        ? 'Say a polite closing: "That\'s everything I need. Thank you so much for your help." and set endCall to true. Only set endCall to true when all four fields are collected.'
        : `Ask for ONE field only. VARY the sentence every time — pick one randomly: "What is the ${nextFieldToAsk}?" / "Can I get the ${nextFieldToAsk}?" / "May I have the ${nextFieldToAsk}?" / "Can you provide the ${nextFieldToAsk}?" Do not always use the same phrase. Or if you just got a value: "Got it, thanks." then one of those. Keep nextMessage under 20 words.`;

    const patientBlock = patientInfo
      ? `
Patient info — give FULL value only. Use "Are we good?" ONLY after patient DOB verification; then only when user says yes, ask for benefit fields.
- Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. First name: ${patientInfo.firstName}. Last name: ${patientInfo.lastName}.
- When they say "how can I help" / "how can I help you" / "how can I help you today" / "I'm doing good how can I help you" / "I'm doing great, how can I help": Say ONLY "I want to verify the patient details." or "I want to verify the benefits of a patient." Do NOT ask for any field. Do NOT say "sorry I didn't get you". extractedUpdates {}.
- When they ask "identify yourself" / "who are you": Answer ONLY "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details." Do NOT add "Are we good?" or ask for a field. extractedUpdates {}.
- When they ask "what is the patient name" / "patient name" / "patient full name" / "what is the patient full name": Answer ONLY "The patient is ${patientInfo.fullName}." or "The full name is ${patientInfo.fullName}." Do NOT add "Are we good?" or ask for a field in the same turn. extractedUpdates {}.
- When they ask "what is the date of birth of the patient" / "patient date of birth" / "date of birth" / "DOB" / "what is the date of birth": Answer: "The patient date of birth is ${patientInfo.dobFormatted ?? 'not provided'}." THEN ask ONLY: "Are we good?" Do NOT ask for coverage/deductible in the same turn. Only when they say "yes" or "we're good" in the NEXT turn do you ask for the first benefit field. extractedUpdates {}.
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
ACKNOWLEDGMENTS — Use "Are we good?" or "Is the value correct?" ONLY in these three cases: (1) after patient DATE OF BIRTH verification (then wait for yes before asking any benefit field), (2) after cross-questioning/recall ("what did I say for X?"), (3) after they update or correct a value. NEVER add "Are we good?" after patient name, identity, "what do you need?", or when first asking for a field.
RECALL — when they ask "what did I say for [field]?" / "do you have the [field]?": (1) Give full details: "I have the [field] as [value]." or "I don't have that one yet." (2) Then "Are we good?" or "Is the value correct?" only. Wait for yes; then ask for next field with a VARIED phrase. extractedUpdates {}.
CONFIRMATION: When they say "yes" / "we're good" / "yeah" after you asked "Are we good?": Ask for next field using a VARIED phrase — pick one randomly: "Can I get the [field]?" / "May I have the [field]?" / "Can you provide the [field]?" / "What is the [field]?" Do not always use the same one.
UPDATE AFTER RECALL: When they correct a value: put NEW value in extractedUpdates, say "Updated. I've got that. Thanks." Then ask for next field with varied phrase if any missing.
After they GIVE a value (number/amount): say "Got it, thanks." or "Thanks." or "Okay, thanks." Then ask for next field with a VARIED phrase — pick one randomly: "What is the [field]?" / "Can I get the [field]?" / "May I have the [field]?" / "Can you provide the [field]?"
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

CRITICAL — CONVERSATION FLOW (listen to the user; do NOT ask the same question again):
- The FIRST thing EVA already said was: "Hi, I am Reena from Went Dentals. How are you doing today?" User says "I'm doing great, how can I help you?" — EVA: "I want to verify the benefits of a patient." User may ask "what is the name of the patient?" or "date of birth?" — give the full answer, then say "Is the value correct?" or "Are we good?" Do NOT ask for the next field in that same turn. Only when they say "yes" / "yeah it's clear" / "we're good" do you say "So can I get the next field?" or "Can I get the [next field]?"
- WHEN USER ASKS A QUESTION (what did I say for X, patient name, DOB, what do you need, etc.): (1) Provide ALL the details. (2) Then confirm ONLY: "Is the value correct?" or "Are we good?" (3) Do NOT say "So then I need the [field]" or "Can I get the [field]" in the same turn — that would be asking again or jumping ahead. Wait for the user to confirm in the next turn.
- WHEN USER CONFIRMS ("yes" / "yeah it's right" / "it's clear" / "we're good" / "correct"): Then say "So can I get the next field?" or "Can I get the [next field]?" e.g. "Can I get the deductible?" Use these exact words so EVA sounds human.
- When they GIVE a value for a field (number, amount): extract it, acknowledge ("Got it, thanks." etc.), then "So can I get the next field?" or "Can I get the [next field]?"
- NEVER ask the same question twice in a row. If you just answered their question about a detail, do not ask for that detail again — only ask for the NEXT field after they confirm.
- NEVER go back: after a failure, inaudible, or "didn't catch that", ask only for the CURRENT (first missing) field. Do not re-ask earlier questions or restart the flow. Continue from where we are.
- Before ending the call, all four fields must be collected. Use: "Is the value correct?", "Are we good?", "So can I get the next field?", "Can I get the coverage/deductible/copay/validity?"

ROLE & TONE:
- Professional, polite, patient. One thing per turn.
- If they say "let me check" / "one moment": "Sure, take your time." extractedUpdates {}.
- Never say you are a bot or AI.

${patientBlock}
${recallBlock}
${afterResumeBlock}

CROSS-QUESTIONING — two-step: answer fully, then confirm only. Do NOT ask for next field in the same turn when they asked a question.
- "What did I say for [field]?" / "Do you have the [field]?" → Give full details: "I have the [field] as [value]." or "I don't have that one yet." Then confirm ONLY: "Is the value correct?" or "Are we good?" Do NOT say "So then I need the [next field]." in this turn. extractedUpdates {}.
- When they CONFIRM ("yes" / "yeah it's right" / "it's clear" / "we're good"): Say "So can I get the next field?" or "Can I get the [next field]?" extractedUpdates {}.
- "Can you repeat?" / "What was the question?" → Ask for the CURRENT field with a VARIED phrase only (pick one: "What is the ${nextFieldToAsk ?? 'coverage'}?" / "Can I get the ${nextFieldToAsk ?? 'coverage'}?" / "May I have the ${nextFieldToAsk ?? 'coverage'}?" / "Can you provide the ${nextFieldToAsk ?? 'coverage'}?"). Do NOT add "Are we good?" or "Is the value correct?" after repeat. extractedUpdates {}. If we have all four: "We have everything we need. Thanks." set endCall true.
- "Goodbye" / "That's all" / "We're done" when we are missing any field → Do NOT set endCall true. "I still need the [first missing]. Can you provide that?" extractedUpdates {}.
- "Actually I said X not Y" / "Update [field] to X" → Put the corrected value in extractedUpdates, say "Got it, I've got that. Thanks." Then ask for next field with varied phrase if any missing. (Acknowledgment only for value updates.)
- "Why do you need that?" → "We're verifying benefit details for our patient." Do NOT add "Are we good?" Do NOT ask for the field again in the same turn. extractedUpdates {}.
- "What about [other field]?" → Answer. Do NOT add "Are we good?" unless it was a recall. extractedUpdates {}.
- "So you have [field] as [value]?" / "Confirm [field] is [value]" → "Yes, that's correct." or "I have it as [value]." If more needed, ask for next field with varied phrase after they confirm. extractedUpdates {}.
- When they ask a question (recall, what did I say): give full details, then "Are we good?" only for recall/cross-question. For patient name or identity do NOT add "Are we good?". For DOB add "Are we good?" and wait for yes before asking for fields.

Data we have so far: ${current}
We are currently asking for: ${nextFieldToAsk ?? 'nothing (all done)'}.
What they just said: "${transcript}"

EXTRACTION:
- Any number, dollar amount ($), or percentage in their message that fits a benefit field → put it in extractedUpdates. If they give multiple values in one sentence (e.g. "deductible is 500 and copay is 25 percent"), extract ALL that apply into extractedUpdates. Examples: "deductible is 100$" → {"deductible": "100 dollars"}; "50 dollars" for copay → {"copay": "50 dollars"}; "thirty percent" → {"copay": "30 percent"}. When we are asking for "${nextFieldToAsk}", a number or amount is very likely the answer — extract it.
- Only ask them to repeat when transcript is exactly "User did not respond or was inaudible". Do not ask to repeat if they gave a number or amount.
- After extracting a value (or multiple): acknowledge once and ask for the NEXT missing field only.

WHAT TO SAY (check in this order). When user ASKS a question: give all details, then "Is the value correct?" or "Are we good?" only — do NOT ask for the next field in the same turn. When they CONFIRM (yes / yeah it's clear / we're good): say "So can I get the next field?" or "Can I get the [next field]?" Use these phrases so EVA sounds human.
- If they CONFIRM ("yes" / "yeah it's right" / "it's clear" / "we're good" / "correct" / "that's right"): "So can I get the next field?" or "Can I get the [next field]?" e.g. "Can I get the deductible?" extractedUpdates {}.
- If they ask what they said or what we have for a field: "I have the [field] as [value]." or "I don't have that one yet." Then "Is the value correct?" or "Are we good?" Do NOT add "So then I need the [next field]." in this turn. extractedUpdates {}.
- If they ask to repeat or "what was the question?" and we still have a field: Use ONLY a VARIED phrase for the field (pick one: "What is the ${nextFieldToAsk ?? 'coverage'}?" / "Can I get the ${nextFieldToAsk ?? 'coverage'}?" / "May I have the ${nextFieldToAsk ?? 'coverage'}?" / "Can you provide the ${nextFieldToAsk ?? 'coverage'}?"). Do NOT add "Are we good?" or "Is the value correct?" after repeat. extractedUpdates {}. If we have all four: "We have everything we need. Thanks." set endCall true.
- If they say "goodbye" / "that's all" / "we're done" but we are MISSING any field: do NOT set endCall true. "I still need the [first missing field]. Can you provide that?" extractedUpdates {}.
- If they correct a value: put new value in extractedUpdates, say "Got it, I've got that. Thanks." Then "So can I get the next field?" or "Can I get the [next field]?" if any missing.
- If they ask "why do you need that?": "We're verifying benefit details for our patient." Then "Is the value correct?" or "Are we good?" Do NOT ask for the field again in same turn. extractedUpdates {}.
- If they ask to confirm ("so deductible is 500?"): "Yes, that's correct." or "I have it as [value]." Then "Are we good?" Next field only after they confirm. extractedUpdates {}.
- If they say they need a moment ("let me check", "one sec"): "Sure, take your time." extractedUpdates {}.
- If they ask for info you don't have: "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a field still missing: "So can I get the [first missing field]?" extractedUpdates {}.
- If they ask "what are the details you want to know" / "what do you need to know": Ask for first missing field with a VARIED phrase: "Can I get the [field]?" / "May I have the [field]?" / "Can you provide the [field]?" / "What is the [field]?" Pick one. Do NOT add "Are we good?" here. Do NOT list all fields. extractedUpdates {}.
- If they say "how can I help" / "how can I help you" / "how can I help you today": "I want to verify the patient details." or "I want to verify the benefits of a patient." Only. Do NOT say "sorry I didn't get you". extractedUpdates {}.
- If transcript is "User did not respond or was inaudible" or silence: Say ONLY one short repeat request. Pick one: "Can you please repeat that?" / "Can you say that once again?" / "Sorry, I didn't catch that. Can you repeat?" Do NOT add "Can I get the [field]?" or "What is the [field]?" or any field question in this turn. Wait for the user to respond; do not ask for the next field after saying repeat. extractedUpdates {}.
- If they gave a value for the current field (number/amount): extract it, say "Got it, thanks." or "Thanks." or "Okay, thanks.", then ask for next field with a VARIED phrase: "Can I get the [next field]?" / "May I have the [next field]?" / "Can you provide the [next field]?" / "What is the [next field]?" One field only.
- If they ask to update or correct a value: put new value in extractedUpdates, say "Updated. I've got that. Thanks." Then "So can I get the next field?" if more needed.
- If they asked a general question (how are you): answer briefly. Do NOT add "Are we good?" Do not ask for a field in same turn. extractedUpdates {}.
- Otherwise: ${oneFieldRule}

Set endCall to true ONLY when all four fields (coverage, deductible, copay, validity) are present in the data. If even one is missing, set endCall to false and ask for the first missing field. We will say "Sorry, I missed certain fields. First, can you provide the [field]?" and ask missing ones one by one before ending.

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
        model: 'gemini-2.5-flash',
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
