import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';
import path from 'path';

const ai_server_url = process.env.AI_SERVER_URL;

@Injectable()
export class TranscriptionService {
  async transcribeAudio(filePath: string): Promise<{ transcript: string }> {
    if (!ai_server_url) {
      throw new Error('AI server URL not configured');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const form = new FormData();

    form.append('file', fileBuffer, {
      filename: path.basename(filePath),
      contentType: 'audio/mp3',
    });

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
          timeout: 30000, // 30 sec
        },
      );

      return { transcript: response.data.transcript };
    } catch (err: any) {
      console.error('❌ Transcription request failed:', err.message);
      throw new Error(
        'Transcription failed: ' + (err.response?.data?.message ?? err.message),
      );
    }
  }
}
