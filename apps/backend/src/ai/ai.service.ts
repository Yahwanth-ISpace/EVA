import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  async extractInsuranceDetails(transcript: string) {
    const prompt = `
You are an AI agent that extracts insurance coverage details from transcripts.
Return only a valid JSON with the following keys: coverage, deductible, copay, and validity.

Transcript:
"""
${transcript}
"""
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'grok-mistral', // or your available Grok model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });

      const content = response.choices[0].message.content;

      if (!content) {
        throw new Error('No content returned from Grok API');
      }

      const jsonStart = content.indexOf('{');
      const jsonString = jsonStart !== -1 ? content.slice(jsonStart) : content;

      return JSON.parse(jsonString);
    } catch (err) {
      console.error('Grok API error:', err);
      return { error: 'Failed to extract details using Grok' };
    }
  }
}
