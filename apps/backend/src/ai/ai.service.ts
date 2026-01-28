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
    const prompt = `You are a helpful voice assistant. Reply briefly and naturally in one or two sentences to this message. Do not use markdown or lists.

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
   * Handle user interruption: parse corrections (e.g. "copay is 25% not 60%") and return updates + reply to speak.
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
    const prompt = `You are handling an interruption during an insurance verification call. The user may be correcting a value they said earlier.

Current extracted data we have: ${current}

What the user just said: "${userMessage}"

If the user is correcting or updating a value (e.g. "please update copay to 25%", "it's 25% not 60%", "deductible is actually 500 dollars"), put ONLY those fields in "updates" with the new value. Use "reply" for a short spoken acknowledgment.
If they are asking a general question, set "updates" to {} and put a brief answer in "reply".

Respond with ONLY a single JSON object. No markdown, no code block. Format: {"updates": {"copay": "25%"} or {} or {"deductible": "500"}, "reply": "Short spoken reply"}

Examples:
- "actually copay is 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Got it, I've updated copay to 25 percent."}
- "please update the value I told you before for copay, it is actually 25% not 60%" → {"updates": {"copay": "25%"}, "reply": "Done. I've updated copay to 25 percent."}
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
   */
  public async getNextConversationTurn(
    transcript: string,
    currentExtracted: {
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    },
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
    const prompt = `You are a friendly voice agent for an insurance verification call. Keep replies short (one or two sentences) and natural for speech.

Data we have so far: ${current}

The user just said: "${transcript}"

Do two things:
1. If they provided any coverage, deductible, copay, or validity info (or corrected something), put ONLY those fields in "extractedUpdates" with the value. Otherwise use {}.
2. Say the next thing: acknowledge what they said and ask for the next piece of info we still need, or answer a question, or say goodbye if they're done or we have everything.

If the user said goodbye, or we have all four fields (coverage, deductible, copay, validity) and they confirmed, set "endCall" to true and say a short goodbye.

Respond with ONLY a JSON object. No markdown. Format:
{"nextMessage": "What to say next (short, for TTS)", "extractedUpdates": {} or {"coverage": "..."}, "endCall": true or false}`;

    const result = await model.generateContent(prompt);
    let jsonString = result.response.text()?.trim() ?? '{}';
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/```json|```/gi, '').trim();
    }
    try {
      const parsed = JSON.parse(jsonString);
      const nextMessage =
        typeof parsed.nextMessage === 'string' && parsed.nextMessage.trim()
          ? parsed.nextMessage.trim()
          : 'Got it. What else can you tell me?';
      const extractedUpdates = parsed.extractedUpdates ?? {};
      const endCall = parsed.endCall === true;
      return { nextMessage, extractedUpdates, endCall };
    } catch {
      return {
        nextMessage: 'Got it. What else can you tell me?',
        extractedUpdates: {},
        endCall: false,
      };
    }
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
