import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';
import * as path from 'path';
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

    // Use createReadStream for better memory efficiency and reliability
    const fileStream = fs.createReadStream(filePath);

    // Detect MIME type properly
    const mimeType = mime.getType(filePath) || 'application/octet-stream';
    const filename = path.basename(filePath);

    const form = new FormData();
    form.append('file', fileStream, {
      filename: filename,
    });

    const url = `${ai_server_url}/transcription/transcribe`;
    console.log(`📤 Sending transcription request to: ${url}`);
    console.log(`📁 File: ${filename} (${mimeType})`);

    try {
      const response = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 180000, // 3 minutes
      });

      console.log('✅ Transcription successful');
      return { transcript: response.data.transcript };
    } catch (err: any) {
      console.error('❌ Transcription request failed:', err.message);
      console.error('Error code:', err.code);
      console.error('Error response status:', err.response?.status);
      console.error('Error response data:', err.response?.data);

      if (err.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to AI server at ${ai_server_url}. Is the server running?`,
        );
      }

      if (err.code === 'ECONNRESET') {
        throw new Error(
          `Connection reset by AI server. The server may have closed the connection. Check if ${ai_server_url} is accessible and the endpoint /transcription/transcribe exists.`,
        );
      }

      throw new Error(
        'Transcription failed: ' +
          (err.response?.data?.message ??
            err.response?.data?.error ??
            err.message),
      );
    }
  }
}
