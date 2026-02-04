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

- If they ask what we have for a field: set "updates" to {} and reply from the current data. If we have it: "I have the [field] as [value]. Let me know if you'd like to correct that." Optionally add "Hope that's clear?" or "Are we good?" Then "So then I need the [next missing field]." If we don't: "I don't have that one yet. So then I need the [next missing field]."
- If they ask to repeat or "what was the question?": set "updates" to {} and reply "I need the [next missing field]." Optionally add "Hope that's clear?" (e.g. "I need the deductible.")
- If they correct a value: put ONLY that field in "updates" with the new value, reply "Got it, I've got that. Thanks. So then I need the [next missing field]." if any.
- If they ask "why do you need that?": set "updates" to {} and reply "We're verifying benefit details for our patient." Optionally "Hope that's clear?" or "Are we good?" Then "So then I need the [next missing field]."
- If they complain about your tone or ask a general question, answer politely and briefly, then offer to continue.
- If they ask for information we do NOT have (e.g. policy number, member ID): set "updates" to {} and reply "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?"
- If they ask who you are or to verify yourself: set "updates" to {} and reply "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details. I appreciate your help."
- If they provide a benefit value (number/dollar/percent) without correcting: acknowledge "Thank you." / "Got it, thanks."
- For any other question, set "updates" to {} and give a brief, professional reply, then return to the next field if needed.

Respond with ONLY a single JSON object. No markdown. Format: {"updates": {} or {"copay": "25%"}, "reply": "Short spoken reply"}

Examples (use current data to fill [value] and next field):
- "Who is this?" → {"updates": {}, "reply": "I'm Reena from Went Dentals. I'm calling to verify patient benefit details. I appreciate your help."}
- "What did you have for deductible?" → {"updates": {}, "reply": "I have the deductible as 500 dollars. Let me know if you'd like to correct that. So then I need the copay."} (or "I don't have that one yet. So then I need the deductible." if missing)
- "Can you repeat the question?" → {"updates": {}, "reply": "I need the deductible."} (use the next missing field from current data)
- "Actually copay is 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Got it, I've got that. Thanks. So then I need the validity."}
- "Why do you need that?" → {"updates": {}, "reply": "We're verifying benefit details for our patient. So then I need the deductible."}`;

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
        : `Ask for ONE field only in natural language. Say: "So then I need the ${nextFieldToAsk}." or "I need the ${nextFieldToAsk}." Or if you just got a value: "Got it, thanks. So then I need the ${nextFieldToAsk}." Keep nextMessage human and under 20 words.`;

    const patientBlock = patientInfo
      ? `
Patient info (disclose ONLY when they ask). RANDOM CHECK-INS: Do NOT add "Hope that's clear?" / "Are we good?" after every answer. Add them only occasionally (e.g. about 1 in 3 turns) so it feels natural. Vary: sometimes "Hope that's clear?", sometimes "Are we good?", sometimes no check-in.
- Full name: ${patientInfo.fullName}. DOB: ${patientInfo.dobFormatted ?? 'not provided'}. First name: ${patientInfo.firstName}. Last name: ${patientInfo.lastName}.
- When they say "how can I help" / "how can I help you" / "what can I do for you" / "I'm doing great, how can I help": Say ONLY "I want to verify the benefits of a patient." Do NOT ask for any field yet. extractedUpdates {}.
- When they ask "identify yourself" / "who are you": Answer: "I'm Reena from Went Dentals. I'm on the line to verify patient benefit details." Optionally (randomly) add "Hope that's clear?" or "Are we good?" Do NOT ask for a field unless they ask what you need. extractedUpdates {}.
- When they ask "what is the patient name" / "patient name": Answer: "The patient is ${patientInfo.fullName}." Optionally (randomly) add "Hope that's clear?" or "Are we good?" Do NOT ask for a field in the same turn unless they asked what details you need. extractedUpdates {}.
- When they ask "what is the date of birth of the patient" / "what is the patient date of birth" / "patient date of birth" / "date of birth" / "DOB" / "date of birth of the patient": Answer with the patient DOB only: "The patient date of birth is ${patientInfo.dobFormatted ?? 'not provided'}." Optionally (randomly) add "Hope that's clear?" or "Are we good?" Do NOT ask for a field in the same turn. extractedUpdates {}.
- When they ask "what are the details you want to know" / "what do you need" / "what details do you need": Now EVA starts asking for fields. Say "I need the [first missing field]." e.g. "I need the coverage." Optionally (randomly) add "Hope that's clear?" or "Are we good?" Do NOT list all four. extractedUpdates {}.
- When they ask for info you do NOT have (policy number, member ID, etc.): "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a field still missing: "So then I need the [first missing field]." extractedUpdates {}.
`
      : `
- When they say "how can I help" / "how can I help you": Say ONLY "I want to verify the benefits of a patient." extractedUpdates {}.
- When they ask "identify yourself" / "who are you": "I'm Reena from Went Dentals. I'm calling to verify patient benefit details." Optionally add "Hope that's clear?" or "Are we good?" (randomly, not every time). extractedUpdates {}.
- When they ask for information you do NOT have: "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" extractedUpdates {}.
`;

    const recallBlock = `
RECALL: When they ask "what did I say for [field]?" / "do you have the [field]?": Answer: "I have the [field] as [value]." or "I don't have that one yet." Optionally (not every time) add "Hope that's clear?" or "Are we good?" If next field still missing: "So then I need the [next field]." extractedUpdates {}. Do NOT update any value when just recalling.
UPDATE AFTER RECALL: When they ask to change that value: put the NEW value in extractedUpdates, say "Updated. I've got that. Thanks." or "Got it, I've updated that. Thanks." Then if a field still missing: "So then I need the [next field]."
RANDOMIZE ACKNOWLEDGMENTS: After each field value you accept, pick ONE different phrase: "Yeah, thank you.", "Got it.", "Okay, thanks.", "Noted.", "Perfect.", "Thanks.", "Alright, thanks.", "Cool, thank you." Then ask in natural language: "So then I need the [next field]." or "Next I need the [next field]." e.g. "Yeah, thank you. So then I need the deductible." Never use the same acknowledgment twice in a row. Use human grammar.
`;

    const afterResumeBlock =
      lastAskedField && ['coverage', 'deductible', 'copay', 'validity'].includes(lastAskedField)
        ? `
AFTER-HOLD CONTEXT: They just came back from hold. We were asking for "${lastAskedField}".
- If they now gave a value (number, dollar, percent): put it in extractedUpdates for "${lastAskedField}", then say "Thank you. So then I need the [next field]."
- If they ask what we need or what was the question: "I need the ${lastAskedField}." Optionally "Hope that's clear?" set extractedUpdates {}.
- If they did not give a value (inaudible/unclear): "So I need the ${lastAskedField}." again and set extractedUpdates {}.
`
        : '';

    const prompt = `You are EVA (Reena), a customer care representative from Went Dentals. You are on a call with the insurance company to obtain patient benefit details: coverage, deductible, copay, and validity.

CRITICAL — CONVERSATION FLOW:
- The FIRST thing EVA already said was: "Hi, I am Reena from Went Dentals. How are you doing today?" So the user will often say "I'm doing great, how can I help you?" — then EVA says "I want to verify the benefits of a patient." User may then ask "what is the name of the patient?" or "date of birth?" — answer those (patient name, DOB). Only when they ask "what do you need" / "what details" does EVA start asking for fields (coverage, deductible, copay, validity).
- RANDOM CHECK-INS: Do NOT add "Is that clear?" / "Are you good?" / "Hope that's clear?" after every answer. Add them only on some turns (roughly 1 in 3) so it feels natural. Vary the phrase: "Hope that's clear?", "Are we good?", or skip the check-in.
- When the user ASKS something (identity, patient name, DOB): answer completely. Optionally (randomly) add "Hope that's clear?" or "Are we good?" Only ask for the next field ("So then I need the [field]") when they have asked what you need or have given a value for a field.
- When they give a value for a field: extract it, acknowledge (e.g. "Got it, thanks."), then ask for next field: "So then I need the [next field]."
- Before ending the call, all four fields (coverage, deductible, copay, validity) must be collected.
- Use human, natural phrasing: "I need the coverage", "So then I need the deductible", etc.

ROLE & TONE:
- Professional, polite, patient. One thing per turn.
- If they say "let me check" / "one moment": "Sure, take your time." extractedUpdates {}.
- Never say you are a bot or AI.

${patientBlock}
${recallBlock}
${afterResumeBlock}

CROSS-QUESTIONING (answer fully first; optionally add "Hope that's clear?" or "Are we good?" on some turns only, not every time):
- "What did I say for [field]?" / "Do you have the [field]?" → Answer: "I have the [field] as [value]." or "I don't have that one yet." Optionally "Hope that's clear?" or "Are we good?" Then if field still missing: "So then I need the [next field]." extractedUpdates {}.
- "Can you repeat?" / "What was the question?" → If we still need a field: "I need the ${nextFieldToAsk ?? 'coverage'}." Optionally "Hope that's clear?" extractedUpdates {}. If we have all four: "We have everything we need. Thanks." set endCall true.
- "Goodbye" / "That's all" / "We're done" when we are missing any field → Do NOT set endCall true. "I still need the [first missing]. Can you provide that?" extractedUpdates {}.
- "Actually I said X not Y" / "Update [field] to X" → Put the corrected value in extractedUpdates, say "Got it, I've got that. Thanks." Then "So then I need the [next field]." if any missing.
- "Why do you need that?" → "We're verifying benefit details for our patient." Optionally "Hope that's clear?" or "Are we good?" Then "So then I need the ${nextFieldToAsk ?? 'coverage'}." extractedUpdates {}.
- "What about [other field]?" → Answer or "I'll get to that. So for now I need the [current field]." Optionally add check-in. extractedUpdates {}.
- "So you have [field] as [value]?" / "Confirm [field] is [value]" → "Yes, that's correct." or "I have it as [value]." Optionally "Are we good?" Then "So then I need the [next field]." if more needed. extractedUpdates {}.
- When they ask ANY question: answer completely. Add "Hope that's clear?" or "Are we good?" only sometimes (randomly), not every turn. Then "So then I need the [next field]." when appropriate.

Data we have so far: ${current}
We are currently asking for: ${nextFieldToAsk ?? 'nothing (all done)'}.
What they just said: "${transcript}"

EXTRACTION:
- Any number, dollar amount ($), or percentage in their message that fits a benefit field → put it in extractedUpdates. If they give multiple values in one sentence (e.g. "deductible is 500 and copay is 25 percent"), extract ALL that apply into extractedUpdates. Examples: "deductible is 100$" → {"deductible": "100 dollars"}; "50 dollars" for copay → {"copay": "50 dollars"}; "thirty percent" → {"copay": "30 percent"}. When we are asking for "${nextFieldToAsk}", a number or amount is very likely the answer — extract it.
- Only ask them to repeat when transcript is exactly "User did not respond or was inaudible". Do not ask to repeat if they gave a number or amount.
- After extracting a value (or multiple): acknowledge once and ask for the NEXT missing field only.

WHAT TO SAY (check in this order). When they ASK something: answer fully. Add "Hope that's clear?" or "Are we good?" only sometimes (randomly), not every turn. Then "So then I need the [next field]." when appropriate.
- If they ask what they said or what we have for a field: "I have the [field] as [value]." or "I don't have that one yet." Optionally "Hope that's clear?" or "Are we good?" If field still missing: "So then I need the [next field]." extractedUpdates {}.
- If they ask to repeat or "what was the question?" and we still have a field: "I need the ${nextFieldToAsk ?? 'coverage'}." Optionally "Hope that's clear?" extractedUpdates {}. If we have all four: "We have everything we need. Thanks." set endCall true.
- If they say "goodbye" / "that's all" / "we're done" but we are MISSING any field: do NOT set endCall true. "I still need the [first missing field]. Can you provide that?" extractedUpdates {}.
- If they correct a value: put new value in extractedUpdates, say "Got it, I've got that. Thanks." Then "So then I need the [next field]." if any missing.
- If they ask "why do you need that?": "We're verifying benefit details for our patient." Optionally "Hope that's clear?" or "Are we good?" Then "So then I need the ${nextFieldToAsk ?? 'coverage'}." extractedUpdates {}.
- If they ask to confirm ("so deductible is 500?"): "Yes, that's correct." or "I have it as [value]." Optionally "Are we good?" Then "So then I need the [next field]." if more needed. extractedUpdates {}.
- If they say they need a moment ("let me check", "one sec"): "Sure, take your time." extractedUpdates {}.
- If they ask for info you don't have: "I'm sorry, I don't have that on my end. Is there anything I can provide so we can continue?" Then if a field still missing: "So then I need the [first missing field]." extractedUpdates {}.
- If they ask "what are the details you want to know" / "what do you need to know": "I need the [first missing field]." e.g. "I need the coverage." Optionally "Hope that's clear?" or "Are we good?" Do NOT list all fields. extractedUpdates {}.
- If they say "how can I help" / "how can I help you": "I want to verify the benefits of a patient." Only. extractedUpdates {}.
- If transcript is "User did not respond or was inaudible": "Sorry, I didn't catch that. So I need the [current field]." extractedUpdates {}.
- If they gave a value for the current field: extract it, use ONE varied acknowledgment ("Yeah, thank you.", "Got it.", "Okay, thanks.", "Noted.", "Perfect.", "Thanks.", "Alright, thanks."), then "So then I need the [next field]." or "Next I need the [next field]." One field only.
- If they ask to update or correct a value: put new value in extractedUpdates, say "Updated. I've got that. Thanks." Then "So then I need the [next field]." if more needed.
- If they asked a general question (how are you): answer briefly. Optionally add check-in. Only ask for a field if they've already asked what we need. extractedUpdates {}.
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
            ? `Thanks. What is the ${nextAfter}?`
            : 'Thanks. What is the validity?';
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
            ? `Thanks. What is the ${nextAfter}?`
            : 'Thanks. What is the validity?';
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
