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
   */
  public async replyToUser(userMessage: string): Promise<string> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are John from Went Dentals, calling to verify patient benefits. Reply briefly and naturally in one or two sentences. If the user asks who you are or who they are talking to, say "I'm John calling from Went Dentals." Never say you are a bot or virtual assistant. Do not use markdown or lists.

User: ${userMessage}

Reply:`;
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() ?? 'I didn’t catch that. Could you say it again?';
    return text;
  }

  /** Insurance fields we collect during verification */
  public static readonly INSURANCE_FIELDS = ['coverage', 'deductible', 'copay', 'validity'] as const;

  /**
   * Classify whether the user is answering the current question or interrupting (correcting a value / asking something else).
   */
  public async classifySegment(
    transcript: string,
    currentQuestion: string,
  ): Promise<'answer' | 'interruption'> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are classifying a short voice transcript from a phone verification call.

Current question we asked the user: "${currentQuestion}"

What the user just said: "${transcript}"

Is the user:
- Answering that question (giving coverage, deductible, copay, validity, or similar info)? Reply: answer
- Interrupting to correct a value they said before (e.g. "actually copay is 25% not 60%", "please update deductible to 500") or asking something else? Reply: interruption

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
    const prompt = `You are handling an interruption during a patient benefits verification call. You are John from Went Dentals. Never say you are a bot or virtual assistant.

Current extracted data we have: ${current}

What the user just said: "${userMessage}"

If the user asks who you are, to verify yourself, or to identify yourself: set "updates" to {} and put in "reply" a short answer: "I'm John calling from Went Dentals. I'm calling to verify patient benefits details." Then they can continue. Once the patient name and data of birth is provided, you can continue with the verification process. Ask for the fields one by one (one at a time).
If the user is correcting or updating a value (e.g. "please update copay to 25%", "it's 25% not 60%", "deductible is actually 500 dollars"), put ONLY those fields in "updates" with the new value. Use "reply" for a short spoken acknowledgment.
If they are asking any other general question, set "updates" to {} and put a brief answer in "reply".

Respond with ONLY a single JSON object. No markdown, no code block. Format: {"updates": {} or {"copay": "25%"}, "reply": "Short spoken reply"}

Examples:
- "can you verify yourself?" / "who is this?" → {"updates": {}, "reply": "I'm John calling from Went Dentals. I'm calling to verify patient benefits details."}
- "actually copay is 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Got it, I've updated copay to 25 percent."}
- "what did you get for deductible?" → {"updates": {}, "reply": "I have your deductible as 500 dollars. Say if you want to change it."}
- "nothing, continue" → {"updates": {}, "reply": "Okay, continuing."}`;

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
   * EVA is John from Went Dentals; purpose is to verify patient benefits. Never say virtual bot.
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

    const hasVal = (v: string | null) => v != null && String(v).trim().length > 0;
    const nextFieldToAsk =
      !hasVal(currentExtracted.coverage)
        ? 'coverage'
        : !hasVal(currentExtracted.deductible)
          ? 'deductible'
          : !hasVal(currentExtracted.copay)
            ? 'copay'
            : !hasVal(currentExtracted.validity)
              ? 'validity'
              : null;

    const oneFieldRule =
      nextFieldToAsk === null
        ? 'We have all four fields. If the user confirmed or said goodbye, set endCall true and say a short goodbye. Otherwise ask if they want to add or change anything.'
        : `Ask for ONE field only: "${nextFieldToAsk}". One short sentence, e.g. "What is the ${nextFieldToAsk}?" Keep nextMessage under 15 words.`;

    const patientBlock = patientInfo
      ? `
Patient info you can disclose when asked:
- Full name: ${patientInfo.fullName}. Date of birth: ${patientInfo.dobFormatted ?? 'not provided'}. First name: ${patientInfo.firstName}. Last name: ${patientInfo.lastName}.
- If the user asks who you are / verify yourself / identify yourself: reply briefly "I'm John calling from Went Dentals. I'm calling to verify patient benefit details." then continue with the next step. Never say you are a bot or virtual assistant.
- If the user asks "can you provide the patient's full name" or "patient's full name" or "what is the full name": say "The full name of the patient is ${patientInfo.fullName}."
- If the user asks "patient's date of birth" or "date of birth" or "patient's DOB": say "The date of birth is ${patientInfo.dobFormatted ?? 'not provided'}."
- If the user asks for the first name only: say "The first name is ${patientInfo.firstName}."
- If the user asks for the last name only: say "The last name is ${patientInfo.lastName}."
- If the user asks which patient / what patient details do you need / what details: say "The full name of the patient is ${patientInfo.fullName}. Date of birth is ${patientInfo.dobFormatted ?? 'not provided'}. I'll need to patient's benefit details."
`
      : `
- If the user asks who you are / verify yourself / identify yourself: reply briefly "I'm John calling from Went Dentals. I'm calling to verify patient benefit details." then continue. Never say you are a bot or virtual assistant.
`;
    const prompt = `You are a friendly voice agent for a patient benefit verification call. You are John calling from Went Dentals. Your purpose is to verify patient benefit details (coverage, deductible, copay, validity). Keep replies short (one or two sentences) and natural for speech. Never say you are a virtual bot or AI assistant.
${patientBlock}
Data we have extracted so far: ${current}

We are currently asking for: ${nextFieldToAsk ?? 'nothing (all done)'}.

The user just said: "${transcript}"

CRITICAL EXTRACTION RULES:
- If the user said ANYTHING that contains a number, dollar amount ($), or percentage in relation to deductible, copay, coverage, or validity, you MUST put it in extractedUpdates. Examples: "the deductible is 100$" -> {"deductible": "100 dollars"}. "deductible is 100" -> {"deductible": "100"}. "it is 50 dollars" when we need copay -> {"copay": "50 dollars"}. "100 dollars" when we need deductible -> {"deductible": "100 dollars"}. "25 percent" -> {"copay": "25 percent"}. "December 21 2028" or "21/12/28" -> {"validity": "21st Dec 2028"}. When we are asking for "${nextFieldToAsk}", ANY number or amount in the user message is almost certainly the answer - extract it.
- NEVER say "I didn't get you", "I didn't catch that", "I didn't understand", "could you repeat", "can you share the [field] again" or similar when the user said something that contains a number or amount. Only say "Sorry, can you repeat that again?" when the transcript is exactly "User did not respond or was inaudible".
- If you extracted a value: say "Thanks." or "Got it." then ask for the NEXT field only. Never ask for the same field again in the same turn.

WHAT TO SAY:
- ONLY if transcript is exactly "User did not respond or was inaudible": extractedUpdates {}, say "Sorry, can you repeat that again?" then ask for the next field.
- If the user said anything with a number/amount/$/percent: you MUST extract it into extractedUpdates for the field we need (${nextFieldToAsk}), then say "Thanks. What is the [next field]?" Do NOT say you didn't get it. Do NOT ask for the same field again.
- Otherwise answer identity or patient questions as above; else follow: ${oneFieldRule}

When all four fields are collected, set endCall true and say "Thank you."

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
      const endCall = parsed.endCall === true;

      const looksLikeDidntGet = /didn'?t\s+(get|catch|understand)|can you (repeat|share|say)/i.test(nextMessage);
      const transcriptHasValue =
        transcript !== 'User did not respond or was inaudible.' &&
        /\d+|dollar|percent|%\s*\$/.test(transcript);

      if (
        nextFieldToAsk &&
        transcriptHasValue &&
        Object.keys(extractedUpdates).length === 0
      ) {
        const fallback = this.tryExtractFieldFromTranscript(transcript, nextFieldToAsk);
        if (fallback) {
          extractedUpdates = { [nextFieldToAsk]: fallback };
          const nextAfter = this.getNextFieldAfter(currentExtracted, nextFieldToAsk, fallback);
          nextMessage = nextAfter
            ? `Thanks. What is the ${nextAfter}?`
            : 'Thanks. What is the validity?';
        }
      } else if (looksLikeDidntGet && nextFieldToAsk && transcriptHasValue) {
        const fallback = this.tryExtractFieldFromTranscript(transcript, nextFieldToAsk);
        if (fallback) {
          extractedUpdates = { [nextFieldToAsk]: fallback };
          const nextAfter = this.getNextFieldAfter(currentExtracted, nextFieldToAsk, fallback);
          nextMessage = nextAfter
            ? `Thanks. What is the ${nextAfter}?`
            : 'Thanks. What is the validity?';
        }
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
    current: { coverage: string | null; deductible: string | null; copay: string | null; validity: string | null },
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

  private tryExtractFieldFromTranscript(transcript: string, field: string): string | null {
    const t = transcript.trim().toLowerCase();
    const dollarMatch = t.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
    const percentMatch = t.match(/(\d+)\s*%|(\d+)\s*percent/i);
    const numberMatch = t.match(/\b(\d+)\b/);
    if (field === 'validity') {
      const validityMatch = t.match(/year|month|dec|jan|feb|valid|till|until|through/i);
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
