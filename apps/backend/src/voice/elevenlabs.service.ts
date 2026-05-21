import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  private readonly voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  // Prefer English monolingual (`eleven_flash_v2`). Multilingual models may drift language — pin with ELEVENLABS_LANGUAGE_CODE=en.
  private readonly modelId =
    process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2';
  private readonly languageCode =
    process.env.ELEVENLABS_LANGUAGE_CODE?.trim() || 'en';
  /** 0.7–1.2 typical; below 1.0 = slower, more natural phone pace. */
  private readonly speechSpeed = Number(
    process.env.ELEVENLABS_SPEECH_SPEED || process.env.EVA_TTS_SPEED || 0.92,
  );
  private readonly optimizeStreamingLatency = Number(
    process.env.ELEVENLABS_OPTIMIZE_LATENCY || 2,
  );

  private voiceSettings() {
    const speed = Number.isFinite(this.speechSpeed)
      ? Math.min(1.15, Math.max(0.75, this.speechSpeed))
      : 0.92;
    return {
      stability: 0.48,
      similarity_boost: 0.78,
      style: 0.12,
      use_speaker_boost: true,
      speed,
    };
  }

  constructor() {
    if (!this.apiKey) {
      this.logger.warn(
        'ELEVENLABS_API_KEY is not set. Voice synthesis will fail.',
      );
    }
    if (!this.voiceId) {
      this.logger.warn(
        'ELEVENLABS_VOICE_ID is not set. Voice synthesis will fail.',
      );
    }
  }

  /**
   * Synthesize text to speech and return raw MP3 bytes (e.g. for streaming/conversion).
   */
  async synthesizeToBuffer(text: string): Promise<Buffer> {
    if (!this.apiKey || !this.voiceId) {
      throw new HttpException(
        'ElevenLabs API key or Voice ID not configured',
        500,
      );
    }
    if (!text || text.trim().length === 0) {
      throw new HttpException('Text cannot be empty', 400);
    }
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        text,
        model_id: this.modelId,
        ...(this.modelId.includes('multilingual')
          ? { language_code: this.languageCode }
          : {}),
        voice_settings: this.voiceSettings(),
        optimize_streaming_latency: this.optimizeStreamingLatency,
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      },
    );
    return Buffer.from(response.data);
  }

  /**
   * Synthesize text to speech with chunked streaming. Returns a Node.js Readable stream of MP3 bytes
   * so the consumer can start playing audio before the full response is received (faster time-to-first-audio).
   */
  async synthesizeToStream(text: string): Promise<Readable> {
    if (!this.apiKey || !this.voiceId) {
      throw new HttpException(
        'ElevenLabs API key or Voice ID not configured',
        500,
      );
    }
    if (!text || text.trim().length === 0) {
      throw new HttpException('Text cannot be empty', 400);
    }
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
      {
        text,
        model_id: this.modelId,
        ...(this.modelId.includes('multilingual')
          ? { language_code: this.languageCode }
          : {}),
        voice_settings: this.voiceSettings(),
        optimize_streaming_latency: this.optimizeStreamingLatency,
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 60000,
      },
    );
    return response.data as Readable;
  }

  /**
   * Synthesize text to speech using ElevenLabs API
   * All voice generation in the application uses this method instead of Twilio's voice
   */
  async synthesize(text: string): Promise<string> {
    try {
      const buffer = await this.synthesizeToBuffer(text);
      const audioDir = path.join(process.cwd(), 'public', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      const fileName = `eva_${uuidv4()}.mp3`;
      const filePath = path.join(audioDir, fileName);
      fs.writeFileSync(filePath, buffer);

      const baseUrl =
        process.env.BACKEND_URL?.trim() ||
        `http://localhost:${process.env.PORT ?? 3000}`;
      if (!process.env.BACKEND_URL?.trim()) {
        this.logger.warn(
          'BACKEND_URL is not set. Using localhost fallback for audio URLs. Set it in production for correct public URLs.',
        );
      }
      const audioUrl = `${baseUrl}/audio/${fileName}`;
      this.logger.debug(`Generated audio: ${audioUrl}`);

      return audioUrl;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Parse error response properly
      let errorMessage = err.message;
      let errorDetails: any = null;

      if (err.response?.data) {
        // Handle buffer response (convert to string/JSON)
        if (Buffer.isBuffer(err.response.data)) {
          try {
            const errorText = err.response.data.toString('utf-8');
            errorDetails = JSON.parse(errorText);
            errorMessage =
              errorDetails?.detail?.message ||
              errorDetails?.detail?.status ||
              errorDetails?.message ||
              errorText;
          } catch (parseErr) {
            errorMessage = err.response.data.toString('utf-8');
          }
        } else if (typeof err.response.data === 'object') {
          errorDetails = err.response.data;
          errorMessage =
            errorDetails?.detail?.message ||
            errorDetails?.detail?.status ||
            errorDetails?.message ||
            JSON.stringify(errorDetails);
        } else {
          errorMessage = err.response.data;
        }
      }

      // Log the full error for debugging
      this.logger.error('ElevenLabs TTS failed:', {
        message: errorMessage,
        status: err.response?.status,
        details: errorDetails,
      });

      throw new HttpException(
        {
          statusCode: err.response?.status || 500,
          message: `ElevenLabs TTS failed: ${errorMessage}`,
          error: 'TTS_FAILED',
          details: errorDetails,
        },
        err.response?.status || 500,
      );
    }
  }
}
