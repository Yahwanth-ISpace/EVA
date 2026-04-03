import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as FormData from 'form-data';

export type TpaEmotionCategory = 'angry' | 'happy' | 'normal';

@Injectable()
export class AudioEmotionService {
  private readonly logger = new Logger(AudioEmotionService.name);
  private warnedMissingUrl = false;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Same base URL as Whisper/RAG (`apps/ai-server`). */
  private getAiServerBaseUrl(): string | null {
    const u = (
      this.config.get<string>('AI_SERVER_URL') ??
      process.env.AI_SERVER_URL ??
      ''
    )
      .trim()
      .replace(/\/$/, '');
    return u || null;
  }

  /**
   * Classifies TPA speech from an 8kHz mono WAV (Twilio mulaw-derived).
   * Calls `POST {AI_SERVER_URL}/emotion/classify` on the EVA AI server.
   */
  async classifyWav(wavPath: string): Promise<TpaEmotionCategory | null> {
    const base = this.getAiServerBaseUrl();
    if (!base) {
      if (!this.warnedMissingUrl) {
        this.warnedMissingUrl = true;
        this.logger.log(
          'TPA emotion classification disabled (set AI_SERVER_URL to enable, same as transcription/RAG)',
        );
      }
      return null;
    }
    if (!fs.existsSync(wavPath)) {
      return null;
    }
    const form = new FormData();
    form.append('file', fs.createReadStream(wavPath), {
      filename: 'segment.wav',
      contentType: 'audio/wav',
    });
    try {
      const res = await firstValueFrom(
        this.http.post<{ category: string; rawLabel?: string; score?: number }>(
          `${base}/emotion/classify`,
          form,
          {
            headers: form.getHeaders(),
            timeout: 45_000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        ),
      );
      const c = (res.data?.category ?? '').toLowerCase().trim();
      if (c === 'angry' || c === 'happy' || c === 'normal') {
        return c;
      }
      return null;
    } catch (e: any) {
      this.logger.warn(
        '[AudioEmotion] classify failed',
        e?.response?.data ?? e?.message,
      );
      return null;
    }
  }
}
