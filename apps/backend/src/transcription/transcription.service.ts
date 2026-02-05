import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';
import * as path from 'path';
import mime from 'mime';

const ai_server_url = process.env.AI_SERVER_URL;
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const ELEVENLABS_STT_MODEL = 'scribe_v2';

/** Returns true if text looks like it's primarily not English (e.g. Devanagari, other scripts). We only accept English. */
function isNonEnglish(text: string): boolean {
  const t = text.trim();
  if (!t.length) return false;
  // Devanagari (Hindi etc.), other common non-Latin scripts
  if (/[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]/.test(t)) return true;
  // If most of the string is non-ASCII letters, treat as non-English (allow digits, $, %)
  const letters = t.replace(/\s/g, '').replace(/[\d$%.,?!\-'"]/g, '');
  const nonLatin = letters.replace(/[a-zA-Z]/g, '');
  if (letters.length > 0 && nonLatin.length / letters.length > 0.3) return true;
  return false;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  /**
   * Transcribe audio file to text. Uses ElevenLabs speech-to-text first (fast, clear).
   * Falls back to Whisper (AI server) if ElevenLabs fails or is not configured.
   * @param options.skipWhisperFallback - When true (e.g. during hold resume check), do not call Whisper; return empty transcript instead. Avoids 502s on hold music.
   */
  async transcribeAudio(
    filePath: string,
    options?: { skipWhisperFallback?: boolean },
  ): Promise<{ transcript: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const skipWhisper = options?.skipWhisperFallback === true;

    // ElevenLabs often returns empty for very short audio (< ~0.5 sec). Skip it for tiny files to avoid "empty → Whisper" and delay.
    const stat = fs.statSync(filePath);
    const fileSizeBytes = stat.size;
    const minBytesForElevenLabs = 6_000; // ~0.75 sec at 8kHz mulaw; below this use Whisper directly or return empty
    const useElevenLabs = apiKey && fileSizeBytes >= minBytesForElevenLabs;

    if (useElevenLabs) {
      try {
        const transcript = await this.transcribeWithElevenLabs(filePath, apiKey);
        if (transcript != null && transcript.trim().length > 0) {
          this.logger.log('Transcription (ElevenLabs) successful');
          return { transcript };
        }
        if (skipWhisper) {
          this.logger.debug('ElevenLabs returned empty, skip Whisper (resume check)');
          return { transcript: '' };
        }
        this.logger.debug('ElevenLabs returned empty, using Whisper');
      } catch (err: any) {
        if (skipWhisper) {
          this.logger.debug('ElevenLabs failed during resume check, skipping Whisper');
          return { transcript: '' };
        }
        this.logger.warn(
          'ElevenLabs transcription failed, falling back to Whisper',
          err?.message ?? err,
        );
      }
    } else {
      if (skipWhisper) return { transcript: '' };
      if (apiKey && fileSizeBytes < minBytesForElevenLabs) {
        this.logger.debug('Audio too short for ElevenLabs (' + fileSizeBytes + ' bytes), using Whisper');
      } else if (!apiKey) {
        this.logger.debug('ELEVENLABS_API_KEY not set, using Whisper');
      }
    }

    return this.transcribeWithWhisper(filePath);
  }

  private async transcribeWithElevenLabs(
    filePath: string,
    apiKey: string,
  ): Promise<string> {
    const fileStream = fs.createReadStream(filePath);
    const filename = path.basename(filePath);
    // Prefer explicit audio/wav so ElevenLabs receives correct format (8kHz telephony WAV from Twilio mulaw).
    const contentType = filename.toLowerCase().endsWith('.wav') ? 'audio/wav' : (mime.getType(filePath) || 'audio/wav');

    const form = new FormData();
    form.append('file', fileStream, {
      filename,
      contentType,
    });
    form.append('model_id', ELEVENLABS_STT_MODEL);

    try {
      const response = await axios.post(ELEVENLABS_STT_URL, form, {
        headers: {
          'xi-api-key': apiKey,
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        this.logger.warn(
          `ElevenLabs STT returned ${response.status}: ${JSON.stringify(response.data ?? response.statusText)}`,
        );
        throw new Error(`ElevenLabs STT failed: ${response.status}`);
      }

      const text = response.data?.text ?? response.data?.transcript;
      const result = typeof text === 'string' ? text.trim() : '';
      if (!result && response.data) {
        this.logger.debug('ElevenLabs STT returned empty text; response keys: ' + Object.keys(response.data).join(', '));
      }
      return result;
    } catch (err: any) {
      const msg = err?.response?.data != null ? JSON.stringify(err.response.data) : (err?.message ?? err);
      this.logger.warn('ElevenLabs STT request failed: ' + msg);
      throw err;
    }
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
    // Request English-only if the AI server supports a 'language' field
    form.append('language', 'en');

    this.logger.log(`Whisper fallback: sending to ${ai_server_url}/transcription/transcribe (language=en)`);

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
    let transcript = response.data.transcript ?? '';
    if (transcript && isNonEnglish(transcript)) {
      this.logger.log('Transcription (Whisper) non-English detected, returning empty (English only)');
      transcript = '';
    }
    return { transcript };
  }
}
