import { Injectable, Logger } from '@nestjs/common';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { WebSocket } from 'ws';
import { AiService } from '../ai/ai.service';
import { TranscriptionService } from '../transcription/transcription.service';
import { ElevenLabsAudioStackService } from '../voice/elevenlabs-audio-stack.service';

/** Minimum mulaw bytes to process (~1.5 sec at 8kHz) */
const MIN_BUFFER_BYTES = 12_000;
/** Process interval when we have enough audio (ms) */
const PROCESS_INTERVAL_MS = 2500;
/** Chunk size to send back to Twilio (40ms = 320 bytes at 8kHz mulaw) */
const OUTBOUND_CHUNK_BYTES = 320;

interface StreamState {
  buffer: Buffer[];
  streamSid: string | null;
  processing: boolean;
  processTimer: ReturnType<typeof setInterval> | null;
}

@Injectable()
export class MediaStreamHandlerService {
  private readonly logger = new Logger(MediaStreamHandlerService.name);

  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly elevenLabsAudioStack: ElevenLabsAudioStackService,
    private readonly aiService: AiService,
  ) {}

  handleConnection(ws: WebSocket): void {
    const state: StreamState = {
      buffer: [],
      streamSid: null,
      processing: false,
      processTimer: null,
    };

    const send = (obj: object) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    const processBuffer = async () => {
      if (state.processing || !state.streamSid) return;
      const combined = Buffer.concat(state.buffer);
      if (combined.length < MIN_BUFFER_BYTES) return;
      state.buffer = [];
      state.processing = true;

      const tmpDir = os.tmpdir();
      const rawPath = path.join(tmpDir, `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`);
      const wavPath = path.join(tmpDir, `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

      try {
        fs.writeFileSync(rawPath, combined);
        this.mulawRawToWav(rawPath, wavPath);

        const { transcript } = await this.transcriptionService.transcribeAudio(wavPath);
        if (!transcript?.trim()) {
          state.processing = false;
          return;
        }

        this.logger.log(`[MediaStream] User said: ${transcript}`);

        const replyText = await this.aiService.replyToUser(transcript);
        const mulawAudio = await this.elevenLabsAudioStack.synthesize(replyText);

        for (let i = 0; i < mulawAudio.length; i += OUTBOUND_CHUNK_BYTES) {
          const chunk = mulawAudio.subarray(i, i + OUTBOUND_CHUNK_BYTES);
          send({
            event: 'media',
            streamSid: state.streamSid,
            media: { payload: chunk.toString('base64') },
          });
        }
      } catch (err: any) {
        this.logger.warn('[MediaStream] Process buffer failed', err?.message);
      } finally {
        try {
          fs.unlinkSync(rawPath);
        } catch {}
        try {
          fs.unlinkSync(wavPath);
        } catch {}
        state.processing = false;
      }
    };

    ws.on('message', (data: Buffer | string) => {
      let msg: any;
      try {
        msg = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString('utf-8'));
      } catch {
        return;
      }

      const event = msg?.event;

      if (event === 'connected') {
        this.logger.log('[MediaStream] Connected');
        return;
      }

      if (event === 'start') {
        state.streamSid = msg?.streamSid ?? null;
        this.logger.log(`[MediaStream] Start streamSid=${state.streamSid}`);
        state.processTimer = setInterval(processBuffer, PROCESS_INTERVAL_MS);
        // Send initial greeting so caller hears something immediately
        (async () => {
          try {
            const greeting = await this.elevenLabsAudioStack.synthesize(
              'Hello. I\'m listening. How can I help you today?',
            );
            for (let i = 0; i < greeting.length; i += OUTBOUND_CHUNK_BYTES) {
              const chunk = greeting.subarray(i, i + OUTBOUND_CHUNK_BYTES);
              send({
                event: 'media',
                streamSid: state.streamSid,
                media: { payload: chunk.toString('base64') },
              });
            }
          } catch (e) {
            this.logger.warn('[MediaStream] Initial greeting failed', (e as Error)?.message);
          }
        })();
        return;
      }

      if (event === 'media' && msg?.media?.payload) {
        try {
          const payload = Buffer.from(msg.media.payload, 'base64');
          state.buffer.push(payload);
        } catch {}
        return;
      }

      if (event === 'stop') {
        if (state.processTimer) {
          clearInterval(state.processTimer);
          state.processTimer = null;
        }
        this.logger.log('[MediaStream] Stop');
      }
    });

    ws.on('close', () => {
      if (state.processTimer) {
        clearInterval(state.processTimer);
        state.processTimer = null;
      }
    });

    ws.on('error', (err) => {
      this.logger.warn('[MediaStream] WebSocket error', err?.message);
    });
  }

  /** Convert raw mulaw (8kHz mono) file to wav for transcription API */
  private mulawRawToWav(rawPath: string, wavPath: string): void {
    const result = spawnSync(
      'ffmpeg',
      ['-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', rawPath, '-y', wavPath],
      { encoding: 'buffer', timeout: 10_000 },
    );
    if (result.status !== 0 || result.error) {
      const stderr = (result.stderr ?? Buffer.alloc(0)).toString('utf-8');
      throw new Error(`mulaw to wav failed: ${stderr || result.error?.message}`);
    }
  }
}
