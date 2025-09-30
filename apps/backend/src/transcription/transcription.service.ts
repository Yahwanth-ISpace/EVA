import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';

const ai_server_url = process.env.AI_SERVER_URL;

@Injectable()
export class TranscriptionService {
  async transcribeAudio(
    filePath: string,
  ): Promise<{ transcript: string; error?: string }> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
      const response = await axios.post(`${ai_server_url}/transcribe`, form, {
        headers: form.getHeaders(),
        timeout: 60000, // 60 seconds timeout
      });
      return { transcript: response.data.text };
    } catch (error) {
      console.error('❌ Transcription failed:', error.message);
      return { transcript: '', error: 'Transcription failed' };
    }
  }
}
