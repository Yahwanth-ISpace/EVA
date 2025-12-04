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

    const buffer = fs.readFileSync(filePath);

    // Detect MIME type properly
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    const form = new FormData();
    const AudiofilePath = '../../audioTest.mp3'; // static file
    const fileStream = fs.createReadStream(AudiofilePath);

    form.append('file', fileStream, {
      filename: path.basename(AudiofilePath),
    });

    // form.append('file', buffer, {
    //   filename: path.basename(filePath),
    //   contentType: mimeType,
    //   knownLength: buffer.length,
    // });

    const contentLength = form.getLengthSync();

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
