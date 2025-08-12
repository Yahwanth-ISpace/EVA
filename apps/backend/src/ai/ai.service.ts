import { Injectable } from '@nestjs/common';
import fetch from 'node-fetch';

@Injectable()
export class AiService {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = 'https://api.x.ai/v1/chat/completions';

  async extractInsuranceDetails(transcript: string) {
    const prompt = `
Extract insurance details from the transcript.
Return only a valid JSON with keys: coverage, deductible, copay, validity.

Transcript:
"""
${transcript}
"""
`;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`, // Bearer needed
      },
      body: JSON.stringify({
        model: 'grok-4-latest',
        temperature: 0,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Grok API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    const jsonStart = content.indexOf('{');
    const jsonString = jsonStart !== -1 ? content.slice(jsonStart) : content;

    return JSON.parse(jsonString);
  }
}
