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
    if (!ai_server_url) {
      return { transcript: '', error: 'AI server URL not configured' };
    }

    if (!fs.existsSync(filePath)) {
      return { transcript: '', error: 'File not found' };
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
      const response = await axios.post(`${ai_server_url}/transcription/transcribe`, form, {
        headers: form.getHeaders(),
        timeout: 20000, // 20 seconds timeout
      });
      return { transcript: response.data.transcript }; 
    } catch (error: any) {
      console.error('❌ Transcription failed:', error.message);
      if (error.response?.data) {
        console.error('Server response:', error.response.data);
      }
      return { transcript: '', error: 'Transcription failed' };
    }
  }
}
