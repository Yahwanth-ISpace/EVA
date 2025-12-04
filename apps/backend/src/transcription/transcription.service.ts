import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';

const ai_server_url = process.env.AI_SERVER_URL;

@Injectable()
export class TranscriptionService {
  async transcribeAudio(
    filePath: string,
  ): Promise<{ transcript: string }> {
    if (!ai_server_url) {
      throw new Error('AI server URL not configured');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
      const response = await axios.post(
        `${ai_server_url}/transcription/transcribe`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Accept: 'application/json',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 20000, // 20 sec
        },
      );

      return { transcript: response.data.transcript };
    } catch (error: any) {
      console.error('❌ Transcription request failed:', error.message);

      throw new Error(
        error.response?.data?.message ??
        error.response?.data ??
        'Transcription failed'
      );
    }
  }
}

