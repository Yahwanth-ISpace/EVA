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

    // Use createReadStream for better memory efficiency, especially for large files
    const fileStream = fs.createReadStream(filePath);
    
    // Detect MIME type properly
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const filename = path.basename(filePath);

    const form = new FormData();
    form.append('file', fileStream, {
      filename: filename,
      contentType: mimeType,
    });

    try {
      const response = await axios.post(
        `${ai_server_url}/transcription/transcribe`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 180000, // 3 minutes
        },
      );

      return { transcript: response.data.transcript };
    } catch (err: any) {
      console.error('❌ Transcription request failed:', err.message);
      if (err.response?.data) {
        console.error('Response data:', err.response.data);
      }
      throw new Error(
        'Transcription failed: ' + (err.response?.data?.message ?? err.response?.data?.error ?? err.message),
      );
    }
  }
}
