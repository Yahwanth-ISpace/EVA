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
