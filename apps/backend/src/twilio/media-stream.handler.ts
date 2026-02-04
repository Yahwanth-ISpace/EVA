/**
 * Media stream handler for EVA voice calls (Twilio bidirectional stream).
 * Handled edge cases: processing during greeting (lastSpeakTime), transcription failure (fallback TTS),
 * inaudible-like transcripts ([inaudible], ...), empty/generic AI reply (re-ask lastAskedField),
 * end-call only when all four fields collected (never end with missing fields).
 */
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

/** Minimum speech bytes before we consider processing (~0.5 sec at 8kHz mulaw) — smaller = faster trigger */
const MIN_SPEECH_BYTES = 4_000;
/** Tail bytes to check for silence (~0.5 sec). Smaller = process sooner after user stops. */
const SILENCE_TAIL_BYTES = 4_000;
/** Fraction of tail bytes that must be "silent" to trigger (0–1) */
const SILENCE_RATIO_THRESHOLD = 0.85;
/** Max buffer before we process anyway (~15 sec) so we don't wait forever */
const MAX_BUFFER_BYTES = 120_000;
/** Fallback: process at most every N ms. Shorter = faster response when silence isn't detected. */
const FALLBACK_PROCESS_INTERVAL_MS = 6000;
/** Minimum ms to wait after EVA speaks before processing (give user time to hear and answer). */
const ANSWER_WINDOW_MS = 3500;
/** Max time allowed on hold before ending the call (9 minutes) */
const HOLD_MAX_MS = 9 * 60 * 1000;
/** Chunk size to send back to Twilio (20ms = 160 bytes at 8kHz mulaw). Smaller chunks = playback starts faster. */
const OUTBOUND_CHUNK_BYTES = 160;

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

/** First thing EVA says: intro only. Do not ask for any field — wait for the user to respond (e.g. identify yourself, patient name, or what details you want). */
const CONVERSATION_GREETING =
  'Hi, this is Reena calling from Went Dentals. I want to verify some details of our patient.';

const EVA_HOLD_ACK = 'Sure, I\'ll hold. Take your time.';
/** After they say "thanks for waiting", "are you there" etc. — acknowledge only; do not re-ask the question yet. */
const EVA_RESUME_ACK = 'No problem, thank you for getting back. I\'m still here.';

/** Duration (ms) to stay on the line after asking "Do you have anything else to ask?" before hanging up if no input */
const POST_GOODBYE_LISTEN_MS = 10_000;

/** Detect if user is saying thank you / no more questions / goodbye (used in post-goodbye phase) */
function isThankYouOrGoodbye(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 2) return false;
  return (
    /^(thank you|thanks|thank you so much|thanks a lot)/i.test(t) ||
    /^(no,?\s*)?(that'?s\s+all|nothing else|we'?re\s+done|goodbye|bye)$/i.test(t) ||
    /^(that'?s\s+all|nothing else|we'?re\s+done|goodbye|bye)(\s|$)/i.test(t) ||
    /goodbye|that'?s\s+all\s*\.?\s*$/i.test(t)
  );
}

/** First missing field in order: coverage → deductible → copay → validity */
function getFirstMissingField(data: ExtractedData): string | null {
  const has = (v: string | null) => v != null && String(v).trim().length > 0;
  if (!has(data.coverage)) return 'coverage';
  if (!has(data.deductible)) return 'deductible';
  if (!has(data.copay)) return 'copay';
  if (!has(data.validity)) return 'validity';
  return null;
}

/** Detect if user is asking to put the call on hold */
function isHoldPhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /putting?\s+(?:the\s+)?call\s+on\s+hold/i.test(t) ||
    /put\s+(?:me\s+)?(?:on\s+)?hold/i.test(t) ||
    /(?:please\s+)?hold\s+(?:please)?/i.test(t) ||
    /(?:can you\s+)?(?:please\s+)?(?:wait|hold)/i.test(t) ||
    /one\s+moment/i.test(t) ||
    /putting\s+you\s+on\s+hold/i.test(t) ||
    /i'?m\s+putting\s+(?:the\s+)?call\s+on\s+hold/i.test(t) ||
    /please\s+wait/i.test(t)
  );
}

/** Detect if user is saying they are back from hold. When matched, we stop hold, speak ack, and transcription + full conversation flow resume from the next user message. */
function isResumePhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /i'?m\s+back/i.test(t) ||
    /(?:thank you|thanks)\s+for\s+(?:waiting|holding)/i.test(t) ||
    /thanks?\s+for\s+staying\s+on\s+hold/i.test(t) ||
    /thanks?\s+for\s+waiting\s+on\s+(?:the\s+)?call/i.test(t) ||
    /thanks?\s+for\s+waiting\s+on\s+hold/i.test(t) ||
    /(?:we'?re\s+)?back\s+on\s+(?:the\s+)?line/i.test(t) ||
    /(?:are\s+)?you\s+(?:still\s+)?(?:there|online)/i.test(t) ||
    /(?:are\s+)?you\s+there/i.test(t) ||
    /(?:are\s+)?you\s+online/i.test(t) ||
    /let'?s\s+continue/i.test(t) ||
    /ready\s+(?:to\s+)?continue/i.test(t) ||
    /(?:i'?m\s+)?ready/i.test(t) ||
    /continue\s+(?:please)?/i.test(t) ||
    /hold\s+(?:is\s+)?(?:removed|off)/i.test(t)
  );
}

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
  /** User put the call on hold; we don't transcribe for conversation until they resume */
  onHold: boolean;
  /** When hold started (ms); used for 9-min limit */
  holdStartedAt: number | null;
  /** Timeout to end call when hold exceeds 9 min */
  holdTimeoutId: ReturnType<typeof setTimeout> | null;
  /** Field we were asking when user put call on hold (or current field we are asking). Used so we remember and can accept e.g. "80$" or re-ask only when user says "what do you need?". */
  lastAskedField: string | null;
  /** When on hold: only this interval runs (every 8s) to check for resume phrase; no other processing. */
  resumeCheckInterval: ReturnType<typeof setInterval> | null;
  /** After goodbye we stay for 10s; hang up at this time if no input. */
  postGoodbyeUntil: number | null;
  postGoodbyeTimeoutId: ReturnType<typeof setTimeout> | null;
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
      onHold: false,
      holdStartedAt: null,
      holdTimeoutId: null,
      lastAskedField: null,
      resumeCheckInterval: null,
      postGoodbyeUntil: null,
      postGoodbyeTimeoutId: null,
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

    const doPostGoodbyeHangUp = () => {
      if (state.callEnded) return;
      state.callEnded = true;
      state.postGoodbyeUntil = null;
      if (state.postGoodbyeTimeoutId) {
        clearTimeout(state.postGoodbyeTimeoutId);
        state.postGoodbyeTimeoutId = null;
      }
      if (state.fallbackTimer) {
        clearInterval(state.fallbackTimer);
        state.fallbackTimer = null;
      }
      if (state.payeeId && (state.extractedData.coverage ?? state.extractedData.deductible ?? state.extractedData.copay ?? state.extractedData.validity)) {
        this.verificationService.pushExtractedData(state.payeeId, state.extractedData).catch((e) =>
          this.logger.warn('[MediaStream] Push on post-goodbye hang up failed', (e as Error)?.message));
      }
      const sid = state.callSid;
      if (sid) this.twilioService.hangUp(sid).catch((e) => this.logger.warn('[MediaStream] Hang up failed', (e as Error)?.message));
    };

    const tryTriggerProcess = () => {
      if (state.processing || state.callEnded || !state.streamSid) return;
      if (state.onHold) return;
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

    const processBuffer = async (
      combined: Buffer,
      opts?: { resumeCheckOnly?: boolean },
    ) => {
      if (state.processing || state.callEnded) return;
      state.processing = true;
      const resumeCheckOnly = opts?.resumeCheckOnly === true;

      const tmpDir = os.tmpdir();
      const rawPath = path.join(tmpDir, `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`);
      const wavPath = path.join(tmpDir, `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

      try {
        fs.writeFileSync(rawPath, combined);
        this.mulawRawToWav(rawPath, wavPath);

        let transcript: string;
        try {
          const result = await this.transcriptionService.transcribeAudio(
            wavPath,
            resumeCheckOnly ? { skipWhisperFallback: true } : undefined,
          );
          transcript = result?.transcript ?? '';
        } catch (transcribeErr: any) {
          this.logger.warn('[MediaStream] Transcription failed', transcribeErr?.message);
          state.processing = false;
          await speak(
            state.lastAskedField
              ? `Sorry, I had trouble hearing that. Can you tell me the ${state.lastAskedField} again?`
              : 'Sorry, I had trouble hearing that. Could you say that again?',
          ).catch(() => {});
          return;
        }
        const userSaid = (transcript ?? '').trim();

        // --- Hold / resume handling ---
        if (state.onHold) {
          const matchedResume = userSaid.length > 0 && isResumePhrase(userSaid);
          if (matchedResume) {
            state.onHold = false;
            state.holdStartedAt = null;
            if (state.holdTimeoutId) {
              clearTimeout(state.holdTimeoutId);
              state.holdTimeoutId = null;
            }
            if (state.resumeCheckInterval) {
              clearInterval(state.resumeCheckInterval);
              state.resumeCheckInterval = null;
            }
            this.logger.log('[MediaStream] User resumed from hold; transcript="' + userSaid + '" lastAskedField=' + (state.lastAskedField ?? 'none'));
            try {
              await speak(EVA_RESUME_ACK);
            } catch (e) {
              this.logger.warn('[MediaStream] Resume ack TTS failed', (e as Error)?.message);
            }
            state.processing = false;
            startFallbackTimer();
            return;
          } else if (state.holdStartedAt && Date.now() - state.holdStartedAt > HOLD_MAX_MS) {
            this.logger.log('[MediaStream] Hold limit exceeded (9 min), ending call');
            state.callEnded = true;
            state.onHold = false;
            state.holdStartedAt = null;
            if (state.holdTimeoutId) { clearTimeout(state.holdTimeoutId); state.holdTimeoutId = null; }
            if (state.fallbackTimer) { clearInterval(state.fallbackTimer); state.fallbackTimer = null; }
            if (state.payeeId && (state.extractedData.coverage ?? state.extractedData.deductible ?? state.extractedData.copay ?? state.extractedData.validity)) {
              this.verificationService.pushExtractedData(state.payeeId, state.extractedData).catch((e) =>
                this.logger.warn('[MediaStream] Push on hold timeout failed', (e as Error)?.message));
            }
            const sid = state.callSid;
            if (sid) this.twilioService.hangUp(sid).catch((e) => this.logger.warn('[MediaStream] Hang up failed', (e as Error)?.message));
          } else if (userSaid.length > 0) {
            this.logger.log('[MediaStream] On hold: transcript not a resume phrase, ignoring. transcript="' + userSaid + '"');
          }
          state.processing = false;
          return;
        }

        if (!state.onHold && userSaid.length > 0 && isHoldPhrase(userSaid)) {
          state.onHold = true;
          state.holdStartedAt = Date.now();
          if (state.fallbackTimer) { clearInterval(state.fallbackTimer); state.fallbackTimer = null; }
          state.resumeCheckInterval = setInterval(() => {
            if (!state.onHold || state.callEnded) {
              if (state.resumeCheckInterval) { clearInterval(state.resumeCheckInterval); state.resumeCheckInterval = null; }
              return;
            }
            const combined = Buffer.concat(state.buffer);
            state.buffer = [];
            if (combined.length < MIN_SPEECH_BYTES) return;
            processBuffer(combined, { resumeCheckOnly: true });
          }, 8000);
          state.holdTimeoutId = setTimeout(() => {
            if (state.onHold && !state.callEnded) {
              this.logger.log('[MediaStream] Hold limit exceeded (9 min), ending call');
              state.callEnded = true;
              state.onHold = false;
              state.holdStartedAt = null;
              state.holdTimeoutId = null;
              if (state.fallbackTimer) { clearInterval(state.fallbackTimer); state.fallbackTimer = null; }
              if (state.payeeId && (state.extractedData.coverage ?? state.extractedData.deductible ?? state.extractedData.copay ?? state.extractedData.validity)) {
                this.verificationService.pushExtractedData(state.payeeId, state.extractedData).catch((e) =>
                  this.logger.warn('[MediaStream] Push on hold timeout failed', (e as Error)?.message));
              }
              if (state.callSid) this.twilioService.hangUp(state.callSid).catch((e) => this.logger.warn('[MediaStream] Hang up failed', (e as Error)?.message));
            }
          }, HOLD_MAX_MS);
          this.logger.log('[MediaStream] User put call on hold');
          await speak(EVA_HOLD_ACK);
          state.processing = false;
          return;
        }

        // --- Post-goodbye: stay on line ~10s for questions; if user says thank you / goodbye, say goodbye and hang up ---
        if (state.postGoodbyeUntil != null) {
          if (state.postGoodbyeTimeoutId) {
            clearTimeout(state.postGoodbyeTimeoutId);
            state.postGoodbyeTimeoutId = null;
          }
          const substantive =
            userSaid.trim().length > 2 &&
            !/^\[?inaudible\]?\.?$/i.test(userSaid) &&
            !/^\.{2,}$/.test(userSaid);
          if (!substantive) {
            state.postGoodbyeUntil = Date.now() + POST_GOODBYE_LISTEN_MS;
            state.postGoodbyeTimeoutId = setTimeout(doPostGoodbyeHangUp, POST_GOODBYE_LISTEN_MS);
            state.processing = false;
            return;
          }
          if (isThankYouOrGoodbye(userSaid)) {
            this.logger.log('[MediaStream] Post-goodbye: user said thank you / goodbye, ending call');
            await speak('Okay, done. Thank you.');
            doPostGoodbyeHangUp();
            state.processing = false;
            return;
          }
          this.logger.log('[MediaStream] Post-goodbye: user asked a question');
          try {
            const reply = await this.aiService.replyToUser(userSaid);
            await speak(reply);
            await speak('Do you have anything else to ask?');
          } catch (e) {
            await speak('Sorry, I didn\'t catch that. Do you have anything else to ask?');
          }
          state.postGoodbyeUntil = Date.now() + POST_GOODBYE_LISTEN_MS;
          state.postGoodbyeTimeoutId = setTimeout(doPostGoodbyeHangUp, POST_GOODBYE_LISTEN_MS);
          state.processing = false;
          return;
        }

        const noiseOrTooShort =
          userSaid.length <= 2 ||
          /^(you|uh|um|oh|ah|eh|hmm|mmm)$/i.test(userSaid);
        const inaudibleLike = /^\[?inaudible\]?\.?$/i.test(userSaid) || /^\.{2,}$/.test(userSaid) || /^[\s\.\-]+$/.test(userSaid);
        const isIdleOrEmpty = userSaid.length === 0 || noiseOrTooShort || inaudibleLike;
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
            state.lastAskedField,
          );

        const hasValue = (v: string | null) => v != null && String(v).trim().length > 0;
        if (extractedUpdates && Object.keys(extractedUpdates).length > 0) {
          if (hasValue(extractedUpdates.coverage ?? null)) state.extractedData.coverage = extractedUpdates.coverage ?? null;
          if (hasValue(extractedUpdates.deductible ?? null)) state.extractedData.deductible = extractedUpdates.deductible ?? null;
          if (hasValue(extractedUpdates.copay ?? null)) state.extractedData.copay = extractedUpdates.copay ?? null;
          if (hasValue(extractedUpdates.validity ?? null)) state.extractedData.validity = extractedUpdates.validity ?? null;
        }

        state.lastAskedField = getFirstMissingField(state.extractedData);

        const allCollected =
          hasValue(state.extractedData.coverage) &&
          hasValue(state.extractedData.deductible) &&
          hasValue(state.extractedData.copay) &&
          hasValue(state.extractedData.validity);
        // Only end when we have all four fields; never end with missing fields
        const shouldEndCall = allCollected;
        const goodbye = 'Thank you, I\'ve noted all the details I need. Thanks for your help.';
        let toSpeak = (nextMessage ?? '').trim();
        const isGenericFallback = /^(what else|is there anything else)/i.test(toSpeak);
        if (shouldEndCall) {
          toSpeak = goodbye;
          // Will enter post-goodbye below: ask "Do you have any questions?" and stay 10s
        } else if (!toSpeak || (isGenericFallback && state.lastAskedField)) {
          toSpeak = state.lastAskedField
            ? `So then I need the ${state.lastAskedField}.`
            : (toSpeak || 'Is there anything else you can share?');
          if (!(nextMessage ?? '').trim() || isGenericFallback) {
            this.logger.warn('[MediaStream] AI returned empty or generic nextMessage, using fallback');
          }
        }
        await speak(toSpeak);

        if (shouldEndCall) {
          // Post-goodbye: ask if they have questions and stay on line for 10 seconds
          await speak('Do you have anything else to ask?');
          state.postGoodbyeUntil = Date.now() + POST_GOODBYE_LISTEN_MS;
          state.postGoodbyeTimeoutId = setTimeout(doPostGoodbyeHangUp, POST_GOODBYE_LISTEN_MS);
          startFallbackTimer(); // keep processing buffer so we hear questions or thank you
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
            state.lastSpeakTime = Date.now();
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
        if (state.holdTimeoutId) {
          clearTimeout(state.holdTimeoutId);
          state.holdTimeoutId = null;
        }
        if (state.postGoodbyeTimeoutId) {
          clearTimeout(state.postGoodbyeTimeoutId);
          state.postGoodbyeTimeoutId = null;
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
      if (state.holdTimeoutId) {
        clearTimeout(state.holdTimeoutId);
        state.holdTimeoutId = null;
      }
      if (state.postGoodbyeTimeoutId) {
        clearTimeout(state.postGoodbyeTimeoutId);
        state.postGoodbyeTimeoutId = null;
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
