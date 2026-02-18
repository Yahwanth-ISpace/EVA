import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as FormData from 'form-data';
import * as path from 'path';
import mime from 'mime';

const ai_server_url = process.env.AI_SERVER_URL;
// ElevenLabs STT (commented out — Whisper is primary)
// const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
// const ELEVENLABS_STT_MODEL = 'scribe_v2';

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

/**
 * Common STT hallucinations when audio is silence, noise, or unclear. Return empty instead of passing these to the AI.
 * Does NOT filter plain "Thank you" / "Thanks" (user may say that). Filters only known false positives.
 */
function isLikelyHallucination(text: string): boolean {
  const t = text.trim();
  if (!t.length) return false;
  const hallucinationPatterns = [
    /^thank\s+you\s+very\s+much\.?$/i,
    /^thanks\s+very\s+much\.?$/i,
    /^thank\s+you\s+so\s+much\.?$/i,
    /^\[?\s*phone\s+hanging\s+up\s*\]?\.?$/i,
    /^\[?\s*pause\s*\]?\.?$/i,
    /^\[?\s*silence\s*\]?\.?$/i,
    /^\[?\s*inaudible\s*\]?\.?$/i,
    /^\[?\s*background\s+noise\s*\]?\.?$/i,
    /^\.{2,}$/,
  ];
  return hallucinationPatterns.some((re) => re.test(t));
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  /**
   * Transcribe audio file to text. Uses Whisper (AI server) as primary STT.
   * @param options.skipWhisperFallback - When true (e.g. during hold resume check), do not call Whisper; return empty transcript instead.
   */
  async transcribeAudio(
    filePath: string,
    options?: { skipWhisperFallback?: boolean },
  ): Promise<{ transcript: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const skipWhisper = options?.skipWhisperFallback === true;
    if (skipWhisper) return { transcript: '' };

    const result = await this.transcribeWithWhisper(filePath);
    if (result.transcript && isLikelyHallucination(result.transcript)) {
      this.logger.debug('Whisper returned likely hallucination ("' + result.transcript + '"), returning empty');
      return { transcript: '' };
    }
    return result;
  }

  /* ——— ElevenLabs STT (commented out — Whisper is primary) ———
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
  ——— */

  private async transcribeWithWhisper(filePath: string): Promise<{ transcript: string }> {
    if (!ai_server_url) {
      throw new Error(
        'AI server URL not configured. Set AI_SERVER_URL for Whisper (primary STT).',
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
    form.append('language', 'en');

    this.logger.log(`Whisper (primary STT): sending to ${ai_server_url}/transcription/transcribe (language=en)`);

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
