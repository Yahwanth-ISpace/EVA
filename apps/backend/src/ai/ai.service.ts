// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AiService {
  async extractInsuranceDetails(transcript: string) {
    const prompt = `
You are an AI agent that extracts insurance coverage details from transcripts.
Return only a valid JSON with the following keys: coverage, deductible, copay, and validity.

Transcript:
"""
${transcript}
"""
`;

    // to start ollama - ollama run llama3

    try {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'mistral', // Or use 'mistral', 'phi3', etc. depending on your Ollama model
        prompt,
        stream: false,
      });

      const raw = response.data.response;
      const jsonStart = raw.indexOf('{');
      const json = raw.slice(jsonStart);

      return JSON.parse(json);
    } catch (err) {
      console.error('Ollama error:', err.message);
      return { error: 'Failed to extract details using Ollama' };
    }
  }
}
