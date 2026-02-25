import { Injectable, Logger } from '@nestjs/common';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ElevenLabsService } from './elevenlabs.service';
import { getFfmpegErrorMessage } from './ffmpeg-check';

/**
 * Produces 8 kHz mulaw audio buffers for Twilio Media Streams.
 * Uses ElevenLabs TTS then converts MP3 → mulaw via ffmpeg.
 * Applies light voice modulation (pauses) so speech doesn't run on continuously.
 */

/**
 * Insert natural pauses so TTS doesn't read continuously. Uses ellipsis so the
 * engine adds a brief breath between phrases (e.g. "Thanks... I want to know the deductible.").
 */
function addSpeechPauses(text: string): string {
  if (!text || text.trim().length === 0) return text;
  let t = text.trim();
  // After a period + space, add ellipsis so next sentence has a breath
  t = t.replace(/\.\s+/g, '... ');
  // Comma then "I want" -> ellipsis for a breath (e.g. "Got it, I want" -> "Got it... I want")
  t = t.replace(/,\s+(I want to know)/gi, '... $1');
  return t.replace(/\s+/g, ' ').replace(/\.{4,}/g, '...').trim();
}

@Injectable()
export class ElevenLabsAudioStackService {
  private readonly logger = new Logger(ElevenLabsAudioStackService.name);

  constructor(private readonly elevenLabs: ElevenLabsService) {}

  /**
   * Synthesize text to 8 kHz mulaw mono (Twilio Media Stream format).
   * Returns a Buffer suitable for chunking and sending as base64 payloads.
   * Applies light pauses for more human-like pacing.
   */
  async synthesize(text: string): Promise<Buffer> {
    const modulated = addSpeechPauses(text);
    const startTts = Date.now();
    const mp3Buffer = await this.elevenLabs.synthesizeToBuffer(modulated);
    this.logger.log(
      `[CallTiming] ElevenLabs TTS API (buffer) returned in ${Date.now() - startTts}ms`,
    );
    const tmpDir = os.tmpdir();
    const mp3Path = path.join(
      tmpDir,
      `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
    );
    try {
      fs.writeFileSync(mp3Path, mp3Buffer);
      const result = spawnSync(
        'ffmpeg',
        [
          '-i',
          mp3Path,
          '-f',
          'mulaw',
          '-ar',
          '8000',
          '-ac',
          '1',
          '-',
        ],
        { encoding: 'buffer', timeout: 30_000 },
      );
      if (result.status !== 0 || result.error) {
        const stderr = (result.stderr ?? Buffer.alloc(0)).toString('utf-8');
        const errMsg = getFfmpegErrorMessage(result.error, stderr);
        this.logger.warn('ffmpeg mulaw conversion failed', { stderr: stderr || result.error?.message });
        throw new Error(errMsg);
      }
      this.logger.log(
        `[CallTiming] ElevenLabs TTS (synthesize) total (API+ffmpeg) in ${Date.now() - startTts}ms`,
      );
      return result.stdout ?? Buffer.alloc(0);
    } finally {
      try {
        fs.unlinkSync(mp3Path);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Synthesize text to 8 kHz mulaw and yield chunks as they are ready (streaming).
   * Enables faster time-to-first-audio: playback can start before the full sentence is synthesized.
   * Use this for lower latency; fall back to synthesize() if streaming fails.
   */
  async *synthesizeStream(text: string): AsyncGenerator<Buffer, void, unknown> {
    const modulated = addSpeechPauses(text);
    const startTtsStream = Date.now();
    const mp3Stream = await this.elevenLabs.synthesizeToStream(modulated);
    this.logger.log(
      `[CallTiming] ElevenLabs TTS stream started in ${Date.now() - startTtsStream}ms (first chunk request)`,
    );
    const child = spawn(
      'ffmpeg',
      ['-i', 'pipe:0', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    mp3Stream.pipe(child.stdin);
    child.stdin.on('error', () => {}); // EPIPE when ffmpeg closes early
    child.stderr?.on('data', () => {}); // discard ffmpeg progress to stderr
    let firstChunk = true;
    for await (const chunk of child.stdout) {
      if (chunk && (chunk as Buffer).length > 0) {
        if (firstChunk) {
          this.logger.log(
            `[CallTiming] ElevenLabs TTS stream first chunk in ${Date.now() - startTtsStream}ms`,
          );
          firstChunk = false;
        }
        yield chunk as Buffer;
      }
    }
    this.logger.log(
      `[CallTiming] ElevenLabs TTS stream completed in ${Date.now() - startTtsStream}ms`,
    );
  }
}
