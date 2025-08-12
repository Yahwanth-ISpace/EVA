import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';

@Injectable()
export class AiService {
  private groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  async extractInsuranceDetails(transcript: string) {
    const prompt = `
Extract insurance details from the transcript.
Return only a valid JSON with keys: coverage, deductible, copay, validity.

Transcript:
"""
${transcript}
"""
`;

    try {
      const response = await this.groq.chat.completions.create({
        model: 'mistral-7b-8k', // Example Groq model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });

      const content = response.choices[0].message?.content ?? '';
      const jsonStart = content.indexOf('{');
      const jsonString = jsonStart !== -1 ? content.slice(jsonStart) : content;

      return JSON.parse(jsonString);
    } catch (err) {
      console.error('Groq API error:', err);
      return { error: 'Failed to extract details using Groq' };
    }
  }
}
