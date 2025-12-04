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
      console.log('Uploading audio for transcription:', filePath);

      const response = await axios.post(
        `${ai_server_url}/transcribe`, // FIXED: Correct FastAPI endpoint
        form,
        {
          headers: {
            ...form.getHeaders(), // FIXED
          },
          maxBodyLength: Infinity,
          timeout: 50000, // 10 sec timeout
        },
      );

      console.log('Transcription result:', response.data);

      return { transcript: response.data.transcript };
    } catch (error: any) {
      console.error('❌ Transcription request failed:', error.message);
      console.error('Server response:', error.response?.data);
      return { transcript: '', error: error.message };
    }
  }
}
