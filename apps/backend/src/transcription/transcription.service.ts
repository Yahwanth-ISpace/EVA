import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';
import * as path from 'path';
import mime from 'mime';

const ai_server_url = process.env.AI_SERVER_URL;
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const ELEVENLABS_STT_MODEL = 'scribe_v2';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  /**
   * Transcribe audio file to text. Uses ElevenLabs speech-to-text first (fast, clear).
   * Falls back to Whisper (AI server) if ElevenLabs fails or is not configured.
   */
  async transcribeAudio(filePath: string): Promise<{ transcript: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

    if (apiKey) {
      try {
        const transcript = await this.transcribeWithElevenLabs(filePath, apiKey);
        if (transcript != null && transcript.trim().length > 0) {
          this.logger.log('Transcription (ElevenLabs) successful');
          return { transcript };
        }
      } catch (err: any) {
        this.logger.warn(
          'ElevenLabs transcription failed, falling back to Whisper',
          err?.message ?? err,
        );
      }
    } else {
      this.logger.debug('ELEVENLABS_API_KEY not set, using Whisper');
    }

    return this.transcribeWithWhisper(filePath);
  }

  private async transcribeWithElevenLabs(
    filePath: string,
    apiKey: string,
  ): Promise<string> {
    const fileStream = fs.createReadStream(filePath);
    const filename = path.basename(filePath);

    const form = new FormData();
    form.append('file', fileStream, {
      filename,
      contentType: mime.getType(filePath) || 'audio/wav',
    });
    form.append('model_id', ELEVENLABS_STT_MODEL);

    const response = await axios.post(ELEVENLABS_STT_URL, form, {
      headers: {
        'xi-api-key': apiKey,
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000,
    });

    const text = response.data?.text ?? response.data?.transcript;
    return typeof text === 'string' ? text : '';
  }

  private async transcribeWithWhisper(filePath: string): Promise<{ transcript: string }> {
    if (!ai_server_url) {
      throw new Error(
        'AI server URL not configured. Set AI_SERVER_URL for Whisper fallback.',
      );
    }

    const fileStream = fs.createReadStream(filePath);
    const mimeType = mime.getType(filePath) || 'application/octet-stream';
    const filename = path.basename(filePath);

    const form = new FormData();
    form.append('file', fileStream, {
      filename,
      contentType: mimeType,
    });

    this.logger.log(`Whisper fallback: sending to ${ai_server_url}/transcription/transcribe`);

    const response = await axios.post(
      `${ai_server_url}/transcription/transcribe`,
      form,
      {
        headers: {
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 180000,
      },
    );

    this.logger.log('Transcription (Whisper) successful');
    return { transcript: response.data.transcript ?? '' };
  }
}
