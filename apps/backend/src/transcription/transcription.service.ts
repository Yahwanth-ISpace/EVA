import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';
import path from 'path';
import mime from 'mime';

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

    // Detect MIME type properly
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    form.append('file', fileBuffer, {
      filename: path.basename(filePath),
      contentType: mimeType,
    });

    const contentLength: number = await new Promise((resolve, reject) =>
      form.getLength((err, length) => (err ? reject(err) : resolve(length))),
    );

    try {
      const response = await axios.post(
        `${ai_server_url}/transcription/transcribe`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Content-Length': contentLength,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 180000, // 3 minutes
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
