import { Injectable, Logger } from '@nestjs/common';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { WebSocket } from 'ws';
import { AiService } from '../ai/ai.service';
import { TranscriptionService } from '../transcription/transcription.service';
import { ElevenLabsAudioStackService } from '../voice/elevenlabs-audio-stack.service';
import { VerificationService } from '../verification/verification.service';

/** Minimum mulaw bytes to process (~1.5 sec at 8kHz) */
const MIN_BUFFER_BYTES = 12_000;
/** Process interval when we have enough audio (ms) */
const PROCESS_INTERVAL_MS = 2500;
/** Chunk size to send back to Twilio (40ms = 320 bytes at 8kHz mulaw) */
const OUTBOUND_CHUNK_BYTES = 320;

/** Verification script: questions we ask in order (coverage, deductible, copay, validity). */
const VERIFICATION_QUESTIONS = [
  'Can you please provide the coverage details of the patient?',
  'What is the deductible amount?',
  'What is the copay?',
  'What is the validity of the insurance?',
];

interface ExtractedData {
  coverage: string | null;
  deductible: string | null;
  copay: string | null;
  validity: string | null;
}

interface StreamState {
  buffer: Buffer[];
  streamSid: string | null;
  processing: boolean;
  processTimer: ReturnType<typeof setInterval> | null;
  /** Payee ID for this call (from WebSocket URL). */
  payeeId: string | null;
  /** Current question index (0..VERIFICATION_QUESTIONS.length). */
  currentStep: number;
  /** Extracted insurance data so far (for merging and interruption handling). */
  extractedData: ExtractedData;
}

@Injectable()
export class MediaStreamHandlerService {
  private readonly logger = new Logger(MediaStreamHandlerService.name);

  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly elevenLabsAudioStack: ElevenLabsAudioStackService,
    private readonly aiService: AiService,
    private readonly verificationService: VerificationService,
  ) {}

  /**
   * Handle a new Media Stream WebSocket connection.
   * @param ws - Twilio Media Stream WebSocket
   * @param payeeId - Optional payee ID from query string (e.g. ?payeeId=xxx)
   */
  handleConnection(ws: WebSocket, payeeId?: string | null): void {
    const state: StreamState = {
      buffer: [],
      streamSid: null,
      processing: false,
      processTimer: null,
      payeeId: payeeId ?? null,
      currentStep: 0,
      extractedData: {
        coverage: null,
        deductible: null,
        copay: null,
        validity: null,
      },
    };

    const send = (obj: object) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    const playAudio = async (mulawBuffer: Buffer) => {
      for (let i = 0; i < mulawBuffer.length; i += OUTBOUND_CHUNK_BYTES) {
        const chunk = mulawBuffer.subarray(i, i + OUTBOUND_CHUNK_BYTES);
        send({
          event: 'media',
          streamSid: state.streamSid,
          media: { payload: chunk.toString('base64') },
        });
      }
    };

    const speak = async (text: string) => {
      try {
        const mulawAudio = await this.elevenLabsAudioStack.synthesize(text);
        await playAudio(mulawAudio);
      } catch (e) {
        this.logger.warn('[MediaStream] TTS failed', (e as Error)?.message);
      }
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

        const currentQuestion = VERIFICATION_QUESTIONS[state.currentStep] ?? '';
        const isInterruption = await this.aiService.classifySegment(transcript, currentQuestion);

        if (isInterruption === 'interruption') {
          // Handle correction or general question: parse updates, merge, speak reply, stay on same question
          const { updates, reply } = await this.aiService.handleInterruption(
            transcript,
            state.extractedData,
          );
          if (Object.keys(updates).length > 0) {
            state.extractedData = { ...state.extractedData, ...updates };
            if (state.payeeId) {
              await this.verificationService.mergeExtractedData(
                state.payeeId,
                state.extractedData,
                transcript,
              );
            }
          }
          await speak(reply);
        } else {
          // Answer path: extract insurance details, merge, save, advance to next question
          const extracted = await this.aiService.extractInsuranceDetails(transcript);
          const hasValue = (v: string | null) => v != null && String(v).trim().length > 0;
          if (hasValue(extracted.coverage)) state.extractedData.coverage = extracted.coverage;
          if (hasValue(extracted.deductible)) state.extractedData.deductible = extracted.deductible;
          if (hasValue(extracted.copay)) state.extractedData.copay = extracted.copay;
          if (hasValue(extracted.validity)) state.extractedData.validity = extracted.validity;

          if (state.payeeId) {
            await this.verificationService.mergeExtractedData(
              state.payeeId,
              state.extractedData,
              transcript,
            );
          }

          state.currentStep += 1;
          if (state.currentStep >= VERIFICATION_QUESTIONS.length) {
            await speak('Thank you. I have all the information. Goodbye.');
            return;
          }
          const nextQuestion = VERIFICATION_QUESTIONS[state.currentStep];
          await speak(`Got it. ${nextQuestion}`);
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
        this.logger.log(`[MediaStream] Start streamSid=${state.streamSid} payeeId=${state.payeeId ?? 'none'}`);
        state.processTimer = setInterval(processBuffer, PROCESS_INTERVAL_MS);
        // Speak first question (or greeting if no payeeId)
        (async () => {
          try {
            if (state.payeeId != null && VERIFICATION_QUESTIONS.length > 0) {
              await speak(VERIFICATION_QUESTIONS[0]);
            } else {
              await speak('Hello. I\'m listening. How can I help you today?');
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
