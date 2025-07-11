import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';

@Injectable()
export class TranscriptionService {
  async transcribeAudio(
    filePath: string,
  ): Promise<{ transcript: string; error?: string }> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
      const response = await axios.post(
        'http://localhost:5001/transcribe',
        form,
        {
          headers: form.getHeaders(),
        },
      );
      return { transcript: response.data.text };
    } catch (error) {
      console.error('❌ Transcription failed:', error.message);
      return { transcript: '', error: 'Transcription failed' };
    }
  }
}
