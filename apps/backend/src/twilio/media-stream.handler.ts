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
import { TwilioService } from './twilio.service';
import { getFfmpegErrorMessage } from '../voice/ffmpeg-check';

/** Minimum speech bytes before we consider processing (~1 sec at 8kHz mulaw) */
const MIN_SPEECH_BYTES = 8_000;
/** Tail bytes to check for silence (~1 sec). Longer = give user time to answer before we process. */
const SILENCE_TAIL_BYTES = 8_000;
/** Fraction of tail bytes that must be "silent" to trigger (0–1) */
const SILENCE_RATIO_THRESHOLD = 0.85;
/** Max buffer before we process anyway (~15 sec) so we don't wait forever */
const MAX_BUFFER_BYTES = 120_000;
/** Fallback: process at most every N ms. Longer = more time for user to finish answering. */
const FALLBACK_PROCESS_INTERVAL_MS = 10000;
/** Minimum ms to wait after EVA speaks before processing (give user time to hear and answer). */
const ANSWER_WINDOW_MS = 5000;
/** Chunk size to send back to Twilio (40ms = 320 bytes at 8kHz mulaw) */
const OUTBOUND_CHUNK_BYTES = 320;

/** Mulaw: 0xFF and 0x7F are typical silence; treat nearby as silent too */
function isSilentByte(b: number): boolean {
  return b === 0xff || b === 0x7f || Math.abs(b - 0xff) <= 2;
}

/** Check if the last SILENCE_TAIL_BYTES of buffer are mostly silence */
function isSilenceAtEnd(buffer: Buffer): boolean {
  if (buffer.length < SILENCE_TAIL_BYTES) return false;
  const tail = buffer.subarray(buffer.length - SILENCE_TAIL_BYTES);
  let silent = 0;
  for (let i = 0; i < tail.length; i++) {
    if (isSilentByte(tail[i])) silent++;
  }
  return silent / tail.length >= SILENCE_RATIO_THRESHOLD;
}

/** Format date for natural speech (e.g. "March 31, 1992") */
function formatDobForSpeech(dob: Date): string {
  const d = new Date(dob);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

/** First thing EVA says: intro + ask for patient benefit details. */
const CONVERSATION_GREETING =
  'Hi, I am John from Went Dentals. May I know the patient benefit details?';

interface ExtractedData {
  coverage: string | null;
  deductible: string | null;
  copay: string | null;
  validity: string | null;
}

/** Patient info for disclosure when user asks (full name, DOB, first name, last name) */
interface PatientInfo {
  firstName: string;
  lastName: string;
  fullName: string;
  dobFormatted: string | null;
}

/** Static patient data when no payee is loaded (for testing / inbound calls). */
const STATIC_PATIENT_INFO: PatientInfo = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  fullName: 'Sarah Johnson',
  dobFormatted: 'March 15, 1985',
};

interface StreamState {
  buffer: Buffer[];
  streamSid: string | null;
  /** Twilio call SID for hanging up when we have all details */
  callSid: string | null;
  processing: boolean;
  /** Fallback timer when silence isn't detected */
  fallbackTimer: ReturnType<typeof setInterval> | null;
  payeeId: string | null;
  /** Patient (payee) info so EVA can disclose full name and DOB when asked */
  patientInfo: PatientInfo | null;
  extractedData: ExtractedData;
  /** When true, we've said goodbye and shouldn't process more */
  callEnded: boolean;
  /** Time (ms) when EVA last spoke; we don't process before ANSWER_WINDOW_MS after this */
  lastSpeakTime: number;
}

@Injectable()
export class MediaStreamHandlerService {
  private readonly logger = new Logger(MediaStreamHandlerService.name);

  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly elevenLabsAudioStack: ElevenLabsAudioStackService,
    private readonly aiService: AiService,
    private readonly verificationService: VerificationService,
    private readonly twilioService: TwilioService,
  ) {}

  handleConnection(ws: WebSocket, payeeId?: string | null): void {
    const state: StreamState = {
      buffer: [],
      streamSid: null,
      callSid: null,
      processing: false,
      fallbackTimer: null,
      payeeId: payeeId ?? null,
      patientInfo: null,
      extractedData: {
        coverage: null,
        deductible: null,
        copay: null,
        validity: null,
      },
      callEnded: false,
      lastSpeakTime: 0,
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
      if (!text?.trim()) return;
      try {
        const mulawAudio = await this.elevenLabsAudioStack.synthesize(text);
        if (mulawAudio?.length) await playAudio(mulawAudio);
        state.lastSpeakTime = Date.now();
      } catch (e) {
        this.logger.warn('[MediaStream] TTS failed', (e as Error)?.message);
      }
    };

    const tryTriggerProcess = () => {
      if (state.processing || state.callEnded || !state.streamSid) return;
      const now = Date.now();
      if (state.lastSpeakTime > 0 && now - state.lastSpeakTime < ANSWER_WINDOW_MS) return;
      const combined = Buffer.concat(state.buffer);
      if (combined.length < MIN_SPEECH_BYTES) return;

      const shouldProcess =
        isSilenceAtEnd(combined) ||
        combined.length >= MAX_BUFFER_BYTES;

      if (shouldProcess) {
        state.buffer = [];
        if (state.fallbackTimer) {
          clearInterval(state.fallbackTimer);
          state.fallbackTimer = null;
        }
        processBuffer(combined);
      }
    };

    const processBuffer = async (combined: Buffer) => {
      if (state.processing || state.callEnded) return;
      state.processing = true;

      const tmpDir = os.tmpdir();
      const rawPath = path.join(tmpDir, `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`);
      const wavPath = path.join(tmpDir, `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

      try {
        fs.writeFileSync(rawPath, combined);
        this.mulawRawToWav(rawPath, wavPath);

        const { transcript } = await this.transcriptionService.transcribeAudio(wavPath);
        const userSaid = (transcript ?? '').trim();
        const noiseOrTooShort =
          userSaid.length <= 2 ||
          /^(you|uh|um|oh|ah|eh|hmm|mmm)$/i.test(userSaid);
        const isIdleOrEmpty = userSaid.length === 0 || noiseOrTooShort;
        const effectiveTranscript = isIdleOrEmpty
          ? 'User did not respond or was inaudible.'
          : userSaid;

        if (userSaid.length === 0) {
          this.logger.log('[MediaStream] No speech detected, prompting repeat');
        } else if (noiseOrTooShort) {
          this.logger.log(`[MediaStream] Noise or too short ("${userSaid}"), prompting repeat`);
        } else {
          this.logger.log(`[MediaStream] User said: ${userSaid}`);
        }

        const { nextMessage, extractedUpdates, endCall } =
          await this.aiService.getNextConversationTurn(
            effectiveTranscript,
            state.extractedData,
            state.patientInfo,
          );

        const hasValue = (v: string | null) => v != null && String(v).trim().length > 0;
        if (extractedUpdates && Object.keys(extractedUpdates).length > 0) {
          if (hasValue(extractedUpdates.coverage ?? null)) state.extractedData.coverage = extractedUpdates.coverage ?? null;
          if (hasValue(extractedUpdates.deductible ?? null)) state.extractedData.deductible = extractedUpdates.deductible ?? null;
          if (hasValue(extractedUpdates.copay ?? null)) state.extractedData.copay = extractedUpdates.copay ?? null;
          if (hasValue(extractedUpdates.validity ?? null)) state.extractedData.validity = extractedUpdates.validity ?? null;
        }

        const allCollected =
          hasValue(state.extractedData.coverage) &&
          hasValue(state.extractedData.deductible) &&
          hasValue(state.extractedData.copay) &&
          hasValue(state.extractedData.validity);
        const shouldEndCall = endCall || allCollected;
        const goodbye = 'We have noted all the details we need. Thank you.';
        const toSpeak = shouldEndCall ? goodbye : ((nextMessage ?? '').trim() || 'What else can you tell me?');
        if (!shouldEndCall && !(nextMessage ?? '').trim()) {
          this.logger.warn('[MediaStream] AI returned empty nextMessage, using fallback');
        }
        await speak(toSpeak);

        if (shouldEndCall) {
          state.callEnded = true;
          if (state.fallbackTimer) {
            clearInterval(state.fallbackTimer);
            state.fallbackTimer = null;
          }
          if (state.payeeId && (state.extractedData.coverage ?? state.extractedData.deductible ?? state.extractedData.copay ?? state.extractedData.validity)) {
            this.verificationService.pushExtractedData(state.payeeId, state.extractedData).catch((e) =>
              this.logger.warn('[MediaStream] Push on endCall failed', (e as Error)?.message),
            );
          }
          const callSidToHangUp = state.callSid;
          setTimeout(() => {
            if (callSidToHangUp) {
              this.twilioService.hangUp(callSidToHangUp).catch((e) =>
                this.logger.warn('[MediaStream] Hang up failed', (e as Error)?.message),
              );
            }
          }, 2500);
        }
      } catch (err: any) {
        this.logger.warn('[MediaStream] Process buffer failed', err?.message);
      } finally {
        try {
          fs.unlinkSync(rawPath);
        } catch { }
        try {
          fs.unlinkSync(wavPath);
        } catch { }
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
        state.streamSid = msg?.streamSid ?? msg?.start?.streamSid ?? null;
        state.callSid = msg?.start?.callSid ?? msg?.callSid ?? null;
        this.logger.log(`[MediaStream] Start streamSid=${state.streamSid} callSid=${state.callSid ?? 'none'} payeeId=${state.payeeId ?? 'none'}`);
        startFallbackTimer();
        (async () => {
          try {
            if (state.payeeId) {
              const info = await this.verificationService.getPayeePatientInfo(state.payeeId);
              if (info) {
                state.patientInfo = {
                  firstName: info.firstName,
                  lastName: info.lastName,
                  fullName: `${info.firstName} ${info.lastName}`.trim(),
                  dobFormatted: info.dob ? formatDobForSpeech(info.dob) : null,
                };
              }
            }
            if (!state.patientInfo) state.patientInfo = STATIC_PATIENT_INFO;
            await speak(CONVERSATION_GREETING);
          } catch (e) {
            this.logger.warn('[MediaStream] Greeting failed', (e as Error)?.message);
          }
        })();
        return;
      }

      if (event === 'media' && msg?.media?.payload) {
        try {
          const payload = Buffer.from(msg.media.payload, 'base64');
          state.buffer.push(payload);
          tryTriggerProcess();
        } catch { }
        return;
      }

      if (event === 'stop') {
        if (state.fallbackTimer) {
          clearInterval(state.fallbackTimer);
          state.fallbackTimer = null;
        }
        this.logger.log('[MediaStream] Stop');
        if (state.payeeId && (state.extractedData.coverage ?? state.extractedData.deductible ?? state.extractedData.copay ?? state.extractedData.validity)) {
          this.verificationService.pushExtractedData(state.payeeId, state.extractedData).catch((e) =>
            this.logger.warn('[MediaStream] Final push on stop failed', (e as Error)?.message),
          );
        }
      }
    });

    ws.on('close', () => {
      if (state.fallbackTimer) {
        clearInterval(state.fallbackTimer);
        state.fallbackTimer = null;
      }
    });

    ws.on('error', (err) => {
      this.logger.warn('[MediaStream] WebSocket error', err?.message);
    });

    // Fallback: if we never detect silence but have enough audio, process every N seconds
    const startFallbackTimer = () => {
      if (state.fallbackTimer) return;
      state.fallbackTimer = setInterval(() => {
        const combined = Buffer.concat(state.buffer);
        if (combined.length < MIN_SPEECH_BYTES) return;
        const now = Date.now();
        if (state.lastSpeakTime > 0 && now - state.lastSpeakTime < ANSWER_WINDOW_MS) return;
        state.buffer = [];
        clearInterval(state.fallbackTimer!);
        state.fallbackTimer = null;
        processBuffer(combined);
      }, FALLBACK_PROCESS_INTERVAL_MS);
    };
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
      const errMsg = getFfmpegErrorMessage(result.error, stderr);
      throw new Error(errMsg);
    }
  }
}
