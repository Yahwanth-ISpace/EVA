/**
 * Media stream handler for EVA voice calls (Twilio bidirectional stream).
 * Handled edge cases: processing during greeting (lastSpeakTime), transcription failure (fallback TTS),
 * inaudible-like transcripts ([inaudible], ...), empty/generic AI reply (re-ask lastAskedField),
 * end-call only when all four fields collected (never end with missing fields).
 * On any failure we ask the user to repeat only the current field; we never go back or re-ask earlier questions.
 *
 * TURN-TAKING (clear flow: EVA asks → wait for user to finish → process → respond):
 * - We only process when we detect clear end-of-speech (silence at end of buffer) or buffer is full (long monologue).
 * - Silence and fallback are tuned so we do NOT process mid-sentence: longer silence tail, stricter ratio,
 *   and fallback interval long enough that we don't fire every few seconds and interrupt the user.
 * - ANSWER_WINDOW_MS ensures we never process audio from right after EVA spoke (avoids echo / double response).
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
import { VerificationRequirementService } from '../verification-requirement/verification-requirement.service';
import { BotTrackerService } from '../bot-tracker/bot-tracker.service';
import { TwilioService } from './twilio.service';
import {
  AudioEmotionService,
  type TpaEmotionCategory,
} from '../audio-emotion/audio-emotion.service';
import { getFfmpegErrorMessage } from '../voice/ffmpeg-check';

/** Minimum speech bytes before we consider processing (~0.6 sec at 8kHz mulaw). Low enough to feel snappy but still rejects noise blips. */
const MIN_SPEECH_BYTES = 4_800;
/** Tail bytes to check for silence (~0.35 sec). Short enough that EVA replies almost immediately after the user finishes. */
const SILENCE_TAIL_BYTES = 2_800;
/** When transcript is empty, only say "please repeat" if we had at least this much audio (~4 sec). Otherwise skip speaking to avoid cutting off the user. */
const MIN_BYTES_BEFORE_REPEAT = 32_000;
/** Fraction of tail bytes that must be "silent" to trigger end-of-speech (0–1). 0.78 balances fast turn-end vs. not cutting on brief mid-sentence breaths. */
const SILENCE_RATIO_THRESHOLD = 0.78;
/** Max buffer before we process anyway (~10 sec). Long monologues get processed so we don't wait forever. */
const MAX_BUFFER_BYTES = 80_000;
/** Fallback: process at most every N ms when silence not detected. Tightened (2.5s) so an un-detected end-of-turn is caught quickly rather than waiting 5.5s. */
const FALLBACK_PROCESS_INTERVAL_MS = 2_500;
/** Minimum ms to wait after EVA speaks before we process user audio (avoid capturing EVA's voice and instant double-response). Kept short so barge-in feels natural. */
const ANSWER_WINDOW_MS = 900;
/** Max time allowed on hold before ending the call (9 minutes) */
const HOLD_MAX_MS = 9 * 60 * 1000;
/** Chunk size to send back to Twilio (20ms = 160 bytes at 8kHz mulaw). Smaller chunks = playback starts faster. */
const OUTBOUND_CHUNK_BYTES = 160;

/** After this many consecutive noise / empty / inaudible turns, skip LLM and use a fixed English line. */
const MAX_NOISE_TURNS_BEFORE_SKIP_LLM = 5;
/** After this many, apologize and end the call (audio unusable). */
const MAX_NOISE_TURNS_BEFORE_ABORT_CALL = 12;

/** IVR bypass: process audio every N ms to detect "customer agent" quickly (ElevenLabs STT + Whisper fallback). */
const IVR_BYPASS_FALLBACK_MS = 2500;
/** IVR bypass: minimum audio bytes before running STT (~0.5 s). */
const IVR_BYPASS_MIN_BYTES = 4_000;

/** Mulaw: 0xFF (positive silence) and 0x7F (negative silence) are the two silence poles; treat nearby codes as silent too so we detect end-of-speech reliably. */
function isSilentByte(b: number): boolean {
  // Positive-silence neighborhood (0xFD..0xFF) and negative-silence neighborhood (0x7D..0x7F, 0xFE).
  return (
    b === 0xff ||
    b === 0xfe ||
    b === 0xfd ||
    b === 0x7f ||
    b === 0x7e ||
    b === 0x7d
  );
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

/** Collapse whitespace and cap length for log lines. */
function truncateForLogLine(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t.length) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** First thing EVA says: natural, human intro. Do not ask for any field — wait for the user to respond. */
const CONVERSATION_GREETING =
  "Hi, I'm Reena from Went Dentals. How are you doing?";

/** One sentence, same intent — rotate so we never sound canned when TPA asks purpose (fallback if LLM mis-hears). */
const PURPOSE_OF_CALL_LINE_VARIANTS = [
  'I need a few benefit details for a patient.',
  "I'm calling to collect insurance benefit information for one of our patients.",
  'Our office needs to verify a few benefit details for a patient.',
  "I'm reaching out to confirm coverage and related benefit information for a patient.",
  'I need to verify some benefit items for a patient we have on file.',
  "I'm following up to get benefit details we need for a patient's visit.",
  'The call is about gathering benefit verification for a patient appointment.',
] as const;

function pickPurposeOfCallPhrase(): string {
  const i = Math.floor(Math.random() * PURPOSE_OF_CALL_LINE_VARIANTS.length);
  return PURPOSE_OF_CALL_LINE_VARIANTS[i] ?? PURPOSE_OF_CALL_LINE_VARIANTS[0];
}

/** TPA asks why we are calling / purpose / what they can help with in that sense. */
function userAsksPurposeOfCallOrOpening(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 3) return false;
  return (
    /how can i help|how may i help|what can i do for you|how can i (direct|assist)|need help with/i.test(
      t,
    ) ||
    /why are you calling|purpose of (this|your|the)?\s*call|reason for (this|your)?\s*call/i.test(
      t,
    ) ||
    /what (is this|do you need) (call )?regarding|what'?s this (call )?about/i.test(t) ||
    /what (kind of )?information do you need|what details (are you|do you) (looking|calling) for/i.test(
      t,
    )
  );
}

const EVA_HOLD_ACK = "Sure, I'll hold. Take your time.";
/** After they say "thanks for waiting", "are you there" etc. — acknowledge only; do not re-ask the question yet. */
const EVA_RESUME_ACK =
  "No problem, thank you for getting back. I'm on the call.";

/** Duration (ms) to stay on the line after saying goodbye (in case user responds); then hang up if no input */
const POST_GOODBYE_LISTEN_MS = 10_000;

/** Detect if user is saying thank you / no more questions / goodbye / confirmation (used in post-goodbye phase). End call when they say e.g. "yeah I'm good", "yes thank you". */
function isThankYouOrGoodbye(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 2) return false;
  return (
    /^(thank you|thanks|thank you so much|thanks a lot)/i.test(t) ||
    /^(yes|yeah|yep),?\s*(thank you|thanks)/i.test(t) ||
    /^(thank you|thanks),?\s*(yes|yeah)?/i.test(t) ||
    /^(yeah,?\s*)?(thank you|thanks)(\.?\s*)$/i.test(t) ||
    /^(no,?\s*)?(that'?s\s+all|nothing else|we'?re\s+done|goodbye|bye)$/i.test(
      t,
    ) ||
    /^(that'?s\s+all|nothing else|we'?re\s+done|goodbye|bye)(\s|$)/i.test(t) ||
    /goodbye|that'?s\s+all\s*\.?\s*$/i.test(t) ||
    /^(yes|yeah|yep|i'?m\s+all\s+set|we'?re\s+good|that'?s\s+it|all\s+good)$/i.test(
      t,
    ) ||
    /^(yeah,?\s*)?(i'?m\s+good|we'?re\s+good)(\.?\s*)$/i.test(t) ||
    /(i'?m\s+good|we'?re\s+good|that'?s\s+it)(\.?\s*)$/i.test(t)
  );
}

/** First missing field in order (uses orderedFields or default four). */
function getFirstMissingField(
  data: Record<string, string | null>,
  orderedFields: string[],
): string | null {
  const has = (v: string | null) => v != null && String(v).trim().length > 0;
  const fields = orderedFields.length
    ? orderedFields
    : ['coverage', 'deductible', 'copay', 'validity'];
  for (const f of fields) {
    if (!has(data[f] ?? null)) return f;
  }
  return null;
}

/** When we couldn't hear or had an error: only ask to repeat; do not mention the field. */
function getRepeatOnlyPrompt(): string {
  const options = [
    'Can you please repeat that?',
    'Can you say that once again?',
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/** Varied phrase for asking a benefit field (used when AI returns empty/generic). Use different phrasing each time. */
function askForFieldPhrase(field: string): string {
  const templates = [
    `What is the ${field}?`,
    `Can I get the ${field}?`,
    `May I have the ${field}?`,
    `Can you provide the ${field}?`,
    `Can I have the ${field}?`,
    `Could you share the ${field}?`,
    `What's the ${field}?`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/** Extract a single value for a benefit field from transcript (e.g. "28 dollars" -> "28 dollars"). Used to correct after-hold when AI puts value in wrong field. */
function extractValueForField(
  transcript: string,
  field: string,
): string | null {
  const t = transcript.trim().toLowerCase();
  const dollarMatch = t.match(/(\d+)\s*dollars?|\$\s*(\d+)|(\d+)\s*\$/i);
  const percentMatch = t.match(/(\d+)\s*%|(\d+)\s*percent/i);
  const numberMatch = t.match(/\b(\d+)\b/);
  if (field === 'validity') {
    const validityMatch = t.match(
      /year|month|dec|jan|feb|valid|till|until|through|twenty|dec/i,
    );
    if (validityMatch) return transcript.trim().replace(/\s+/g, ' ');
    return null;
  }
  if (dollarMatch) {
    const num = dollarMatch[1] || dollarMatch[2] || dollarMatch[3];
    return num ? `${num} dollars` : null;
  }
  if (percentMatch && (field === 'copay' || field === 'coverage')) {
    const num = percentMatch[1] || percentMatch[2];
    return num ? `${num} percent` : null;
  }
  if (numberMatch) {
    const num = numberMatch[1];
    if (field === 'deductible' || field === 'copay') return `${num} dollars`;
    if (field === 'coverage') return num;
    return num;
  }
  return null;
}

/** True if transcript looks like it contains a number, dollar amount, or percent (user may be giving a value). */
function transcriptHasValue(transcript: string): boolean {
  return /\d+|dollar|percent|%\s*\$/.test(transcript);
}

/** True if the reply is the intro/purpose phrase we only say once (e.g. "I need a few benefit details", "here to verify patient details"). */
function isIntroPurposePhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /i'?m\s+here\s+to\s+verify/i.test(t) ||
    /verify\s+(a\s+)?(couple\s+of\s+)?patient\s+details/i.test(t) ||
    /i\s+need\s+(a\s+few|some)\s+benefit\s+(details|information)/i.test(t) ||
    /i\s+want\s+to\s+verify\s+(the\s+)?patient/i.test(t) ||
    /calling\s+to\s+verify\s+benefits?\s+for\s+a\s+patient/i.test(t)
  );
}

/** Rep asks who is calling — a one-line identity answer is OK; full "Hi I'm Reena... how are you" is not. */
function userAskedWhoIsCalling(userSaid: string): boolean {
  const t = userSaid.trim().toLowerCase();
  if (t.length < 4) return false;
  return (
    /\bwho\s+is\s+(this|calling|that)\b/.test(t) ||
    /\bwho\s+are\s+you\b/.test(t) ||
    /\bidentify\s+yourself\b/.test(t) ||
    /\bwhat\s+(company|office)\s+is\s+this\b/.test(t) ||
    /\bwhere\s+are\s+you\s+calling\s+from\b/.test(t)
  );
}

/**
 * Matches the opening stream greeting or close variants the LLM sometimes repeats mid-call.
 */
function isFullOpeningSelfIntro(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 15) return false;
  // Any greeting-style "Hi / Hey + I'm Reena from Went Dentals" (with or without "how are you")
  if (/(hi|hey|hello),?\s+i'?m\s+reena\s+from\s+went\s+dentals/.test(t)) {
    return true;
  }
  if (/(hi|hey|hello),?\s+i\s+am\s+reena\s+from\s+went\s+dentals/.test(t)) {
    return true;
  }
  if (
    /i\s+am\s+reena\s+from\s+went\s+dentals/.test(t) &&
    /how\s+are\s+you/.test(t)
  ) {
    return true;
  }
  if (
    t.includes('reena') &&
    t.includes('went dentals') &&
    (t.includes('how are you') || t.includes('how are you doing'))
  ) {
    return true;
  }
  return false;
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

/** If the user is asking what value we have for a benefit field (recall), return the reply from stored extractedData. */
function getRecallReply(
  userSaid: string,
  extractedData: Record<string, string | null>,
  orderedFields: string[],
): string | null {
  const t = userSaid.trim().toLowerCase();
  if (!t || t.length < 3) return null;
  const fields = orderedFields.length
    ? orderedFields
    : ['coverage', 'deductible', 'copay', 'validity'];
  for (const field of fields) {
    const re = new RegExp(
      `\\bwhat('s| is)?\\s+(the\\s+)?${field}\\b|\\b${field}\\s+(provided|did you get|do you have|was that|we said)|\\bwhat did (i say|you get|you have)\\s+(for\\s+)?(the\\s+)?${field}|\\b(do you have|what (value|number|did you get))\\s+(for\\s+)?(the\\s+)?${field}`,
      'i',
    );
    if (re.test(t)) {
      const val = extractedData[field];
      if (val != null && String(val).trim())
        return `I have the ${field} as ${val}.`;
      return `I don't have that one yet.`;
    }
  }
  if (/\bwhat is the deductible\b/i.test(t)) {
    const val = extractedData.deductible;
    if (val != null && String(val).trim())
      return `I have the deductible as ${val}.`;
    return `I don't have that one yet.`;
  }
  if (/\bwhat is the (coverage|copay|validity)\b/i.test(t)) {
    const k = t.includes('coverage')
      ? 'coverage'
      : t.includes('copay')
        ? 'copay'
        : 'validity';
    const val = extractedData[k];
    if (val != null && String(val).trim()) return `I have the ${k} as ${val}.`;
    return `I don't have that one yet.`;
  }
  return null;
}

/** Patient info from DB for EVA to use in prompts (name, DOB, SSN when asked). */
interface PatientInfo {
  firstName: string;
  lastName: string;
  fullName: string;
  dobFormatted: string | null;
  ssn: string | null;
}

/** Static patient data when no payee is loaded (for testing / inbound calls). */
const STATIC_PATIENT_INFO: PatientInfo = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  fullName: 'Sarah Johnson',
  dobFormatted: 'March 15, 1985',
  ssn: null,
};

interface StreamState {
  buffer: Buffer[];
  streamSid: string | null;
  callSid: string | null;
  processing: boolean;
  fallbackTimer: ReturnType<typeof setInterval> | null;
  payeeId: string | null;
  patientInfo: PatientInfo | null;
  /** Dynamic verification fields (key = field name from VerificationRequirement). */
  extractedData: Record<string, string | null>;
  /** Ordered list of field names to collect (from VerificationRequirement or default). Loaded when payeeId is set. */
  orderedFields: string[];
  /** When set, verification is linked to this requirement and extractedData is stored in Verification.extractedData. */
  verificationRequirementId: string | null;
  /** When set, verification rows are scoped to this appointment (not merged across visits). */
  appointmentId: string | null;
  callEnded: boolean;
  lastSpeakTime: number;
  onHold: boolean;
  holdStartedAt: number | null;
  holdTimeoutId: ReturnType<typeof setTimeout> | null;
  lastAskedField: string | null;
  resumeCheckInterval: ReturnType<typeof setInterval> | null;
  postGoodbyeUntil: number | null;
  postGoodbyeTimeoutId: ReturnType<typeof setTimeout> | null;
  conversationTranscript: string[];
  mode: 'eva' | 'ivr-bypass';
  ivrDigitSent: boolean;
  /** True after we've already said our purpose (e.g. "I need a few benefit details") — avoid repeating it while user is speaking. */
  purposeSaid: boolean;
  /** Rep confirmed after we gave DOB (handler detects yes/thanks following DOB answer). */
  patientIdentityReadyForBenefits: boolean;
  /** Last EVA reply included patient DOB from DB — next rep line may be confirmation. */
  evaAwaitingYesAfterDob: boolean;
  /** Consecutive turns with skip / inaudible / weak audio — for skip-LLM and abort guardrails. */
  consecutiveNoiseOrEmptyTurns: number;
  /** Set after the Twilio stream plays CONVERSATION_GREETING — used to block repeated intros. */
  openingGreetingPlayed: boolean;
}

@Injectable()
export class MediaStreamHandlerService {
  private readonly logger = new Logger(MediaStreamHandlerService.name);

  /**
   * One line per turn: prep (until STT starts) → STT → LLM → TTS wall times, plus TPA and EVA text.
   * llmMs null = LLM not called (repeat / recall / skip / inaudible / validation-only, etc.).
   */
  private logCallTurn(
    callSid: string | null,
    p: {
      prepMs: number;
      sttMs: number;
      llmMs: number | null;
      ttsMs: number;
      totalMs: number;
      tpa: string;
      eva: string;
      note?: string;
    },
  ): void {
    const sid = callSid ?? 'unknown';
    const llmStr = p.llmMs === null ? '—' : `${p.llmMs}ms`;
    const tpa = truncateForLogLine(p.tpa, 400) || '—';
    const eva = truncateForLogLine(p.eva, 400) || '—';
    const note = p.note ? ` ${p.note}` : '';
    this.logger.log(
      `[CallTurn] sid=${sid} prep=${p.prepMs}ms stt=${p.sttMs}ms llm=${llmStr} tts=${p.ttsMs}ms total=${p.totalMs}ms | TPA="${tpa}" | EVA="${eva}"${note}`,
    );
  }

  private logCallEvent(callSid: string | null, message: string): void {
    this.logger.log(`[Call] sid=${callSid ?? 'unknown'} ${message}`);
  }

  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly elevenLabsAudioStack: ElevenLabsAudioStackService,
    private readonly aiService: AiService,
    private readonly verificationService: VerificationService,
    private readonly verificationRequirementService: VerificationRequirementService,
    private readonly botTrackerService: BotTrackerService,
    private readonly twilioService: TwilioService,
    private readonly audioEmotionService: AudioEmotionService,
  ) {}

  handleConnection(
    ws: WebSocket,
    payeeId?: string | null,
    mode?: string | null,
    appointmentId?: string | null,
  ): void {
    const isIvrBypass = mode === 'ivr-bypass';
    const state: StreamState = {
      buffer: [],
      streamSid: null,
      callSid: null,
      processing: false,
      fallbackTimer: null,
      payeeId: payeeId ?? null,
      patientInfo: null,
      extractedData: {},
      orderedFields: [],
      verificationRequirementId: null,
      appointmentId: appointmentId?.trim() || null,
      callEnded: false,
      lastSpeakTime: 0,
      onHold: false,
      holdStartedAt: null,
      holdTimeoutId: null,
      lastAskedField: null,
      resumeCheckInterval: null,
      postGoodbyeUntil: null,
      postGoodbyeTimeoutId: null,
      conversationTranscript: [],
      mode: isIvrBypass ? 'ivr-bypass' : 'eva',
      ivrDigitSent: false,
      purposeSaid: false,
      patientIdentityReadyForBenefits: false,
      evaAwaitingYesAfterDob: false,
      consecutiveNoiseOrEmptyTurns: 0,
      openingGreetingPlayed: false,
    };

    const send = (obj: object) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    const pushLiveTracker = async (line: string) => {
      if (!state.payeeId || !line?.trim()) return;
      try {
        await this.botTrackerService.create({
          payeeId: state.payeeId,
          callLog: line.trim(),
        });
      } catch (e: any) {
        this.logger.warn('[MediaStream] Bot tracker write failed', e?.message);
      }
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

    /** Returns TTS playback duration in ms (0 if empty or failed). */
    const speak = async (text: string, _ttsLabel?: string): Promise<number> => {
      if (!text?.trim()) return 0;
      const ttsStart = Date.now();
      try {
        try {
          for await (const mulawChunk of this.elevenLabsAudioStack.synthesizeStream(
            text,
          )) {
            if (mulawChunk?.length) await playAudio(mulawChunk);
          }
        } catch {
          const mulawAudio = await this.elevenLabsAudioStack.synthesize(text);
          if (mulawAudio?.length) await playAudio(mulawAudio);
        }
        state.lastSpeakTime = Date.now();
        state.buffer = [];
        return Date.now() - ttsStart;
      } catch (e) {
        this.logger.warn('[MediaStream] TTS failed', (e as Error)?.message);
        return 0;
      }
    };

    const pushToVerificationService = () => {
      if (!state.payeeId) {
        this.logger.warn(
          '[MediaStream] Verification NOT saved: payeeId is missing. Pass payeeId in the media-stream URL (e.g. ?payeeId=...) so verification can be stored.',
        );
        return;
      }
      const fields = state.orderedFields.length
        ? state.orderedFields
        : ['coverage', 'deductible', 'copay', 'validity'];
      const hasAny = fields.some(
        (f) =>
          state.extractedData[f] != null &&
          String(state.extractedData[f]).trim(),
      );
      if (!hasAny) {
        return;
      }
      const fullTranscript = state.conversationTranscript.length
        ? state.conversationTranscript.join('\n')
        : undefined;
      this.aiService
        .saveCallVerification(
          state.payeeId,
          state.extractedData,
          fullTranscript,
          state.verificationRequirementId,
          state.appointmentId,
        )
        .then(() => {})
        .catch((e) =>
          this.logger.warn(
            '[MediaStream] Save verification failed',
            (e as Error)?.message,
          ),
        );
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
      const fields = state.orderedFields.length
        ? state.orderedFields
        : ['coverage', 'deductible', 'copay', 'validity'];
      const hasAny =
        state.payeeId &&
        fields.some(
          (f) =>
            state.extractedData[f] != null &&
            String(state.extractedData[f]).trim(),
        );
      if (hasAny) pushToVerificationService();
      const sid = state.callSid;
      if (sid)
        this.twilioService
          .hangUp(sid)
          .catch((e) =>
            this.logger.warn(
              '[MediaStream] Hang up failed',
              (e as Error)?.message,
            ),
          );
    };

    const tryTriggerProcess = () => {
      if (state.processing || state.callEnded || !state.streamSid) return;
      if (state.mode !== 'ivr-bypass' && state.onHold) return;
      const now = Date.now();
      if (
        state.mode !== 'ivr-bypass' &&
        state.lastSpeakTime > 0 &&
        now - state.lastSpeakTime < ANSWER_WINDOW_MS
      ) {
        return;
      }
      const combined = Buffer.concat(state.buffer);
      const minBytes =
        state.mode === 'ivr-bypass' ? IVR_BYPASS_MIN_BYTES : MIN_SPEECH_BYTES;
      if (combined.length < minBytes) return;

      const shouldProcess =
        isSilenceAtEnd(combined) || combined.length >= MAX_BUFFER_BYTES;

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
      const turnStart = Date.now();
      let prepMs = 0;
      let sttMs = 0;
      let llmMs: number | null = null;

      const tmpDir = os.tmpdir();
      const rawPath = path.join(
        tmpDir,
        `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`,
      );
      const wavPath = path.join(
        tmpDir,
        `stream_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
      );

      let emotionPromise: Promise<TpaEmotionCategory | null> =
        Promise.resolve(null);

      try {
        fs.writeFileSync(rawPath, combined);
        this.mulawRawToWav(rawPath, wavPath);

        emotionPromise =
          state.mode === 'ivr-bypass'
            ? Promise.resolve(null)
            : this.audioEmotionService.classifyWav(wavPath).catch(() => null);

        let transcript: string;
        let sttApiStart = turnStart;
        try {
          sttApiStart = Date.now();
          prepMs = sttApiStart - turnStart;
          const result = await this.transcriptionService.transcribeAudio(
            wavPath,
            resumeCheckOnly ? { skipWhisperFallback: true } : undefined,
          );
          transcript = result?.transcript ?? '';
          sttMs = Date.now() - sttApiStart;
        } catch (transcribeErr: any) {
          this.logger.warn(
            '[MediaStream] Transcription failed',
            transcribeErr?.message,
          );
          const repeat = getRepeatOnlyPrompt();
          const ttsMs = await speak(repeat, 'repeat_after_stt_error').catch(
            () => 0,
          );
          state.processing = false;
          const sttErrMs = Math.max(0, Date.now() - sttApiStart);
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs: sttErrMs,
            llmMs: null,
            ttsMs,
            totalMs: Date.now() - turnStart,
            tpa: '',
            eva: repeat,
            note: '(STT failed)',
          });
          return;
        }
        let userSaid = (transcript ?? '').trim();

        // --- Whisper hallucination: when we had substantial audio but transcript is only "thank you"/"thanks", treat as inaudible (re-ask)
        const thankYouOnly =
          /^(\s*thank\s+you\s*\.?\s*|\s*thanks\s*\.?\s*)\s*$/i.test(userSaid);
        if (thankYouOnly && combined.length >= MIN_BYTES_BEFORE_REPEAT) {
          userSaid = '';
        }

        // --- IVR bypass: listen for "customer agent" (or "press 4"), then send DTMF 4 so IVR runs option 4 (hold 10s, dial agent)
        if (state.mode === 'ivr-bypass') {
          const heardCustomerAgent =
            /\b(customer agent|press 4 to talk|talk to our customer agent|option 4)\b/i.test(
              userSaid,
            );
          if (heardCustomerAgent && !state.ivrDigitSent && state.callSid) {
            const base = (process.env.BACKEND_URL || '').trim();
            if (base) {
              const playDtmfUrl = base + '/twilio/play-dtmf-4';
              this.twilioService
                .redirectCall(state.callSid, playDtmfUrl)
                .then(() => {})
                .catch((e: any) =>
                  this.logger.warn(
                    '[MediaStream] IVR bypass redirect failed',
                    (e as Error)?.message,
                  ),
                );
            }
            state.ivrDigitSent = true;
            state.callEnded = true;
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs: 0,
              totalMs: Date.now() - turnStart,
              tpa: userSaid,
              eva: '—',
              note: '(IVR redirect)',
            });
          }
          state.processing = false;
          return;
        }

        // --- Lazy-load verification requirement fields for this payee (once per call) ---
        if (state.payeeId && state.orderedFields.length === 0) {
          try {
            const { orderedFields, requirementId } =
              await this.verificationRequirementService.getOrderedFieldsAndRequirementId(
                state.payeeId,
              );
            state.orderedFields = orderedFields;
            state.verificationRequirementId = requirementId;
          } catch (e: any) {
            this.logger.warn(
              '[MediaStream] Failed to load verification requirement, using default fields',
              e?.message,
            );
            state.orderedFields = [
              'coverage',
              'deductible',
              'copay',
              'validity',
            ];
            state.verificationRequirementId = null;
          }
        }

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
            if (userSaid?.trim())
              state.conversationTranscript.push('User: ' + userSaid.trim());
            state.conversationTranscript.push('EVA: ' + EVA_RESUME_ACK);
            state.buffer = []; // clear so next processing uses only fresh audio after ack (avoids "couldn't catch" from hold-music/stale audio)
            let ttsMsResume = 0;
            try {
              ttsMsResume = await speak(EVA_RESUME_ACK, 'hold_resume_ack');
            } catch (e) {
              this.logger.warn(
                '[MediaStream] Resume ack TTS failed',
                (e as Error)?.message,
              );
            }
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs: ttsMsResume,
              totalMs: Date.now() - turnStart,
              tpa: userSaid,
              eva: EVA_RESUME_ACK,
              note: '(hold resume)',
            });
            state.processing = false;
            startFallbackTimer();
            return;
          } else if (
            state.holdStartedAt &&
            Date.now() - state.holdStartedAt > HOLD_MAX_MS
          ) {
            this.logger.warn(
              '[MediaStream] Hold limit exceeded (9 min), ending call',
            );
            state.callEnded = true;
            state.onHold = false;
            state.holdStartedAt = null;
            if (state.holdTimeoutId) {
              clearTimeout(state.holdTimeoutId);
              state.holdTimeoutId = null;
            }
            if (state.fallbackTimer) {
              clearInterval(state.fallbackTimer);
              state.fallbackTimer = null;
            }
            const hasAnyData =
              state.payeeId &&
              (state.orderedFields.length
                ? state.orderedFields
                : ['coverage', 'deductible', 'copay', 'validity']
              ).some(
                (f) =>
                  state.extractedData[f] != null &&
                  String(state.extractedData[f]).trim(),
              );
            if (hasAnyData) pushToVerificationService();
            const sid = state.callSid;
            if (sid)
              this.twilioService
                .hangUp(sid)
                .catch((e) =>
                  this.logger.warn(
                    '[MediaStream] Hang up failed',
                    (e as Error)?.message,
                  ),
                );
          } else if (userSaid.length > 0) {
          }
          state.processing = false;
          return;
        }

        if (!state.onHold && userSaid.length > 0 && isHoldPhrase(userSaid)) {
          state.onHold = true;
          state.holdStartedAt = Date.now();
          if (state.fallbackTimer) {
            clearInterval(state.fallbackTimer);
            state.fallbackTimer = null;
          }
          state.resumeCheckInterval = setInterval(() => {
            if (!state.onHold || state.callEnded) {
              if (state.resumeCheckInterval) {
                clearInterval(state.resumeCheckInterval);
                state.resumeCheckInterval = null;
              }
              return;
            }
            const combined = Buffer.concat(state.buffer);
            state.buffer = [];
            if (combined.length < MIN_SPEECH_BYTES) return;
            processBuffer(combined, { resumeCheckOnly: true });
          }, 8000);
          state.holdTimeoutId = setTimeout(() => {
            if (state.onHold && !state.callEnded) {
              this.logger.warn(
                '[MediaStream] Hold limit exceeded (9 min), ending call',
              );
              state.callEnded = true;
              state.onHold = false;
              state.holdStartedAt = null;
              state.holdTimeoutId = null;
              if (state.fallbackTimer) {
                clearInterval(state.fallbackTimer);
                state.fallbackTimer = null;
              }
              const hasAnyData =
                state.payeeId &&
                (state.orderedFields.length
                  ? state.orderedFields
                  : ['coverage', 'deductible', 'copay', 'validity']
                ).some(
                  (f) =>
                    state.extractedData[f] != null &&
                    String(state.extractedData[f]).trim(),
                );
              if (hasAnyData) pushToVerificationService();
              if (state.callSid)
                this.twilioService
                  .hangUp(state.callSid)
                  .catch((e) =>
                    this.logger.warn(
                      '[MediaStream] Hang up failed',
                      (e as Error)?.message,
                    ),
                  );
            }
          }, HOLD_MAX_MS);
          if (userSaid?.trim())
            state.conversationTranscript.push('User: ' + userSaid.trim());
          state.conversationTranscript.push('EVA: ' + EVA_HOLD_ACK);
          const ttsMsHold = await speak(EVA_HOLD_ACK, 'hold_ack');
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs: null,
            ttsMs: ttsMsHold,
            totalMs: Date.now() - turnStart,
            tpa: userSaid,
            eva: EVA_HOLD_ACK,
            note: '(hold)',
          });
          state.processing = false;
          return;
        }

        // --- Post-goodbye: we already said closing; if user says anything, say a brief closing and end — never repeat intro or ask "Are we clear?" ---
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
            state.postGoodbyeTimeoutId = setTimeout(
              doPostGoodbyeHangUp,
              POST_GOODBYE_LISTEN_MS,
            );
            state.processing = false;
            return;
          }
          // User said something after we said goodbye: if it's thank you/yes we're good, hang up immediately; otherwise say one closing line and hang up (no intro, no "Are we clear?")
          if (isThankYouOrGoodbye(userSaid)) {
            doPostGoodbyeHangUp();
            state.processing = false;
            return;
          }
          if (userSaid?.trim())
            state.conversationTranscript.push('User: ' + userSaid.trim());
          const postGoodbyeClosing = 'You are most welcome. Have a great day.';
          state.conversationTranscript.push('EVA: ' + postGoodbyeClosing);
          const ttsMsPg = await speak(
            postGoodbyeClosing,
            'post_goodbye_closing_line',
          );
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs: null,
            ttsMs: ttsMsPg,
            totalMs: Date.now() - turnStart,
            tpa: userSaid,
            eva: postGoodbyeClosing,
            note: '(post-goodbye)',
          });
          doPostGoodbyeHangUp();
          state.processing = false;
          return;
        }

        // Don't treat greetings or substantive replies as noise ("hi", "good", "how can I help", numbers, etc.)
        const looksLikeRealResponse = (s: string) => {
          const t = s.trim().toLowerCase();
          return (
            /how can I help|how are you|doing good|doing great|how can i help|how can you help/i.test(
              t,
            ) ||
            /^(hi|hey|hello|yes|no|yeah|ok|okay|good|great|fine|good morning|good afternoon)$/i.test(
              t,
            ) ||
            t.length > 4 ||
            transcriptHasValue(t)
          );
        };
        const fillerOnly = /^(you|uh|um|oh|ah|eh|hmm|mmm)$/i.test(
          userSaid.trim(),
        );
        const noiseOrTooShort =
          (userSaid.length <= 2 &&
            !/^(hi|hey|yes|no|yeah|ok)$/i.test(userSaid.trim())) ||
          (fillerOnly && userSaid.length <= 4);
        const inaudibleLike =
          /^\[?inaudible\]?\.?$/i.test(userSaid) ||
          /^\.{2,}$/.test(userSaid) ||
          /^[\s\.\-]+$/.test(userSaid);
        const isIdleOrEmpty =
          userSaid.length === 0 ||
          (noiseOrTooShort && !looksLikeRealResponse(userSaid)) ||
          inaudibleLike;
        // When transcript is empty but we had very little audio, skip saying "repeat" to avoid cutting off the user (next chunk may have speech).
        const skipRepeatForShortAudio =
          (userSaid.length === 0 &&
            combined.length < MIN_BYTES_BEFORE_REPEAT) ||
          (isIdleOrEmpty && combined.length < 24_000);
        // Never send "inaudible" when user clearly said something (greeting, "how can I help", or a value).
        const effectiveTranscript =
          isIdleOrEmpty && !looksLikeRealResponse(userSaid)
            ? 'User did not respond or was inaudible.'
            : userSaid;
        const wasInaudibleTurn =
          effectiveTranscript === 'User did not respond or was inaudible.';

        if (skipRepeatForShortAudio) {
          state.consecutiveNoiseOrEmptyTurns += 1;
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs: null,
            ttsMs: 0,
            totalMs: Date.now() - turnStart,
            tpa: userSaid,
            eva: '—',
            note: '(skipped: short audio / no EVA reply)',
          });
          state.processing = false;
          return;
        }
        // Inaudible/empty: re-ask the same field only (no AI call) so conversation stays in phase.
        if (wasInaudibleTurn) {
          const repeatPhrase = getRepeatOnlyPrompt();
          const reaskSame = state.lastAskedField
            ? repeatPhrase + ' ' + askForFieldPhrase(state.lastAskedField)
            : repeatPhrase;
          if (
            userSaid?.trim() &&
            userSaid !== 'User did not respond or was inaudible.'
          )
            state.conversationTranscript.push('User: ' + userSaid);
          state.conversationTranscript.push('EVA: ' + reaskSame);
          state.consecutiveNoiseOrEmptyTurns += 1;
          const ttsMsInaud = await speak(reaskSame, 'repeat_inaudible');
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs: null,
            ttsMs: ttsMsInaud,
            totalMs: Date.now() - turnStart,
            tpa: effectiveTranscript,
            eva: reaskSame,
            note: '(inaudible / no LLM)',
          });
          state.processing = false;
          startFallbackTimer();
          return;
        }
        if (userSaid.length === 0) {
        } else if (noiseOrTooShort) {
        } else {
        }

        if (
          userSaid.length > 5 ||
          looksLikeRealResponse(userSaid) ||
          transcriptHasValue(userSaid)
        ) {
          state.consecutiveNoiseOrEmptyTurns = 0;
        }

        if (
          state.consecutiveNoiseOrEmptyTurns >=
          MAX_NOISE_TURNS_BEFORE_ABORT_CALL
        ) {
          const abortMsg =
            'I am sorry, I am having trouble hearing you clearly. I will disconnect so you can try again.';
          const ttsMsAbort = await speak(abortMsg, 'abort_noise_limit').catch(
            () => 0,
          );
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs: null,
            ttsMs: ttsMsAbort,
            totalMs: Date.now() - turnStart,
            tpa: userSaid,
            eva: abortMsg,
            note: '(abort: noise limit)',
          });
          state.callEnded = true;
          state.processing = false;
          const sidAbort = state.callSid;
          if (sidAbort)
            this.twilioService
              .hangUp(sidAbort)
              .catch((e) =>
                this.logger.warn(
                  '[MediaStream] Hang up failed (noise abort)',
                  (e as Error)?.message,
                ),
              );
          return;
        }

        const orderedF = state.orderedFields.length
          ? state.orderedFields
          : ['coverage', 'deductible', 'copay', 'validity'];

        // Rep confirmed identity after we gave DOB — allow benefit collection in prompts.
        if (
          state.patientInfo?.dobFormatted &&
          state.evaAwaitingYesAfterDob &&
          /^(yes|yeah|yep|correct|that'?s\s+right|right|ok|okay|sure|thank\s+you|thanks|go\s+ahead)/i.test(
            userSaid.trim(),
          )
        ) {
          state.patientIdentityReadyForBenefits = true;
          state.evaAwaitingYesAfterDob = false;
        }

        const recallReply = getRecallReply(
          userSaid,
          state.extractedData,
          orderedF,
        );
        let nextMessage = '';
        let extractedUpdates: Record<string, string | null> = {};
        let endCall = false;

        const skipLlmDueToNoise =
          !recallReply &&
          state.consecutiveNoiseOrEmptyTurns >=
            MAX_NOISE_TURNS_BEFORE_SKIP_LLM;

        let noiseSkipMessage = '';
        if (skipLlmDueToNoise) {
          const miss =
            state.lastAskedField ??
            getFirstMissingField(state.extractedData, orderedF) ??
            orderedF[0];
          noiseSkipMessage =
            "I'm having trouble hearing you clearly. " +
            askForFieldPhrase(miss ?? 'coverage');
        }

        if (!recallReply && !skipLlmDueToNoise) {
          const llmStart = Date.now();
          const result = await this.aiService.getNextConversationTurn(
            effectiveTranscript,
            state.extractedData,
            state.patientInfo,
            state.lastAskedField,
            orderedF,
            {
              patientIdentityReadyForBenefits:
                state.patientIdentityReadyForBenefits ||
                state.patientInfo === null,
              purposeStated: state.purposeSaid,
            },
          );
          nextMessage = result.nextMessage;
          extractedUpdates = result.extractedUpdates;
          endCall = result.endCall ?? false;
          llmMs = Date.now() - llmStart;
        } else if (skipLlmDueToNoise) {
          nextMessage = noiseSkipMessage;
          extractedUpdates = {};
          endCall = false;
        }

        const hasValue = (v: string | null) =>
          v != null && String(v).trim().length > 0;
        // After-hold safeguard: we were asking for lastAskedField; if user gave a value but AI put it in the wrong field, assign to lastAskedField only
        const expectedField = state.lastAskedField;
        if (
          expectedField &&
          orderedF.includes(expectedField) &&
          !isIdleOrEmpty &&
          transcriptHasValue(userSaid) &&
          extractedUpdates &&
          Object.keys(extractedUpdates).length > 0
        ) {
          const hasExpected = hasValue(
            extractedUpdates[expectedField as keyof typeof extractedUpdates] ??
              null,
          );
          if (!hasExpected) {
            const corrected = extractValueForField(userSaid, expectedField);
            if (corrected) {
              extractedUpdates = { [expectedField]: corrected };
            }
          }
        }

        // Data validation: coverage = %, deductible/copay = $, validity = date (month and year). Polite correction if wrong type.
        if (extractedUpdates && Object.keys(extractedUpdates).length > 0) {
          const validation =
            this.aiService.validateAndNormalizeBenefitExtracted(
              extractedUpdates,
              userSaid,
              orderedF,
            );
          if (!validation.ok) {
            const vmsg = validation.correctionMessage ?? '';
            if (
              userSaid?.trim() &&
              userSaid !== 'User did not respond or was inaudible.'
            )
              state.conversationTranscript.push('User: ' + userSaid);
            if (validation.correctionMessage?.trim())
              state.conversationTranscript.push(
                'EVA: ' + validation.correctionMessage.trim(),
              );
            const ttsMsVal = await speak(vmsg, 'validation_retry');
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs,
              ttsMs: ttsMsVal,
              totalMs: Date.now() - turnStart,
              tpa: userSaid,
              eva: vmsg,
              note: '(validation retry)',
            });
            state.processing = false;
            return;
          }
          extractedUpdates = validation.normalized;
        }

        if (extractedUpdates && Object.keys(extractedUpdates).length > 0) {
          for (const [key, val] of Object.entries(extractedUpdates)) {
            if (hasValue(val ?? null)) state.extractedData[key] = val ?? null;
          }
        }

        state.lastAskedField = getFirstMissingField(
          state.extractedData,
          orderedF,
        );

        const allCollected = orderedF.every((f) =>
          hasValue(state.extractedData[f] ?? null),
        );
        // Only end when AI explicitly set endCall true (e.g. after user said thank you). When AI said "That's all I need, thank you" it sets endCall false — do not end yet.
        let shouldEndCall = endCall === true;
        if (shouldEndCall && !allCollected) {
          const missing = orderedF.filter(
            (f) => !hasValue(state.extractedData[f] ?? null),
          );
          this.logger.warn(
            '[MediaStream] AI returned endCall but not all fields collected; will not end. Missing: ' +
              missing.join(', '),
          );
          shouldEndCall = false;
        }
        /** Closing when ending the call after user said thank you / yes / that's all. */
        const CLOSING_PHRASES = ['You are welcome. Have a wonderful day'];
        const goodbye =
          CLOSING_PHRASES[Math.floor(Math.random() * CLOSING_PHRASES.length)];
        let toSpeak = (nextMessage ?? '').trim();
        // Never confirm a validity date the user didn't say: if we were asking for validity and they didn't give a date, only ask for validity (no "is it July 17 2025 right?")
        const userSaidDate =
          /\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}/i.test(
            userSaid,
          );
        const toSpeakLooksLikeConfirmingDate =
          /(validity|valid)\s+is\s+.*\?|is it\s+.*\s+right\?|july|january|december|2024|2025/i.test(
            toSpeak,
          );
        if (
          state.lastAskedField === 'validity' &&
          !hasValue(state.extractedData.validity ?? null) &&
          !hasValue(extractedUpdates.validity ?? null) &&
          !userSaidDate &&
          toSpeakLooksLikeConfirmingDate
        ) {
          toSpeak = askForFieldPhrase('validity');
        }
        // Safeguard: if user asked for DOB, never include a first-field request in the same turn — wait for "yes we're good" first
        const firstField = orderedF[0];
        const userAskedForDob =
          /date of birth|DOB|what is the (patient )?date of birth/i.test(
            userSaid,
          );
        if (
          firstField &&
          userAskedForDob &&
          new RegExp(
            `(May I have the ${firstField}|Can I get the ${firstField}|Can you provide the ${firstField}|What is the ${firstField})`,
            'i',
          ).test(toSpeak)
        ) {
          toSpeak = toSpeak
            .replace(
              new RegExp(
                `\\s*[.\\s]*(May I have the ${firstField}\\??|Can I get the ${firstField}\\??|Can you provide the ${firstField}\\??|What is the ${firstField}\\??)[^.]*\\.?\\s*$`,
                'i',
              ),
              '',
            )
            .trim();
          if (!toSpeak?.trim()) toSpeak = 'Is it okay?'; // DOB-only turn: avoid blank after strip
        }
        // Never leave toSpeak blank — ensures we always have a clear response after processing
        if (!toSpeak?.trim()) {
          toSpeak = state.lastAskedField
            ? askForFieldPhrase(state.lastAskedField)
            : orderedF[0]
              ? askForFieldPhrase(orderedF[0])
              : 'Can you repeat that?';
        }
        // Recall: answer from stored extractedData so we always give the correct value (e.g. "what is the deductible provided?")
        if (recallReply) {
          const confirmPhrases = [
            'Is it okay?',
            'Is that all you have?',
            'Are we good?',
            'Are we clear?',
          ];
          toSpeak =
            recallReply +
            ' ' +
            confirmPhrases[Math.floor(Math.random() * confirmPhrases.length)];
        }
        const isGenericFallback = /^(what else|is there anything else)/i.test(
          toSpeak,
        );
        const soundsLikeRepeat =
          /didn'?t\s+(get|catch|understand)|couldn'?t\s+catch|sorry,?\s+I\s+didn'?t|can you (please\s+)?repeat|say that once again/i.test(
            toSpeak,
          );
        // Never say "I didn't catch you" when user clearly said something (e.g. "how can I help", "it is 80$") — keep conversation in sync.
        if (looksLikeRealResponse(userSaid) && soundsLikeRepeat) {
          if (userAsksPurposeOfCallOrOpening(userSaid)) {
            toSpeak = pickPurposeOfCallPhrase();
            state.purposeSaid = true;
          } else if (
            /how are you|doing good|doing great/i.test(userSaid.trim()) &&
            !userAsksPurposeOfCallOrOpening(userSaid)
          ) {
            if (!state.purposeSaid) {
              toSpeak = pickPurposeOfCallPhrase();
              state.purposeSaid = true;
            } else {
              toSpeak = state.lastAskedField
                ? askForFieldPhrase(state.lastAskedField)
                : askForFieldPhrase(orderedF[0]);
            }
          } else if (transcriptHasValue(userSaid) && state.lastAskedField) {
            const corrected = extractValueForField(
              userSaid,
              state.lastAskedField,
            );
            if (corrected) {
              const oneUpdate: Record<string, string> = {
                [state.lastAskedField]: corrected,
              };
              const orderedF2 = state.orderedFields.length
                ? state.orderedFields
                : ['coverage', 'deductible', 'copay', 'validity'];
              const validation =
                this.aiService.validateAndNormalizeBenefitExtracted(
                  oneUpdate,
                  userSaid,
                  orderedF2,
                );
              if (!validation.ok) {
                toSpeak = validation.correctionMessage;
              } else {
                const norm = validation.normalized[state.lastAskedField];
                if (norm && state.lastAskedField)
                  state.extractedData[state.lastAskedField] = norm;
                state.lastAskedField = getFirstMissingField(
                  state.extractedData,
                  orderedF2,
                );
                if (!state.lastAskedField) {
                  toSpeak = "That's all I need, thank you.";
                  shouldEndCall = false;
                } else {
                  const ack = [
                    'Got it, thanks.',
                    'Thanks.',
                    'Okay, thank you.',
                    'Noted.',
                  ][Math.floor(Math.random() * 4)];
                  toSpeak = ack + ' ' + askForFieldPhrase(state.lastAskedField);
                }
              }
            } else {
              toSpeak = askForFieldPhrase(state.lastAskedField);
            }
          } else {
            const firstField = state.orderedFields.length
              ? state.orderedFields[0]
              : 'coverage';
            toSpeak = state.lastAskedField
              ? askForFieldPhrase(state.lastAskedField)
              : askForFieldPhrase(firstField);
          }
        }
        // Never repeat opening greeting / "Hi I'm Reena... how are you" or purpose lines mid-call (LLM regression guard).
        if (
          toSpeak?.trim() &&
          userAskedWhoIsCalling(userSaid) &&
          isFullOpeningSelfIntro(toSpeak)
        ) {
          toSpeak =
            "I'm Reena from Went Dentals. I'm on the line to get benefit details.";
        } else if (
          toSpeak?.trim() &&
          !userAskedWhoIsCalling(userSaid) &&
          state.openingGreetingPlayed &&
          isFullOpeningSelfIntro(toSpeak)
        ) {
          const miss =
            state.lastAskedField ??
            getFirstMissingField(state.extractedData, orderedF) ??
            orderedF[0];
          toSpeak = miss
            ? askForFieldPhrase(miss)
            : getRepeatOnlyPrompt();
        } else if (
          toSpeak?.trim() &&
          !userAskedWhoIsCalling(userSaid) &&
          state.purposeSaid &&
          isIntroPurposePhrase(toSpeak)
        ) {
          const miss =
            state.lastAskedField ??
            getFirstMissingField(state.extractedData, orderedF) ??
            orderedF[0];
          toSpeak = miss
            ? askForFieldPhrase(miss)
            : getRepeatOnlyPrompt();
        }
        if (toSpeak && isIntroPurposePhrase(toSpeak)) {
          state.purposeSaid = true;
        }
        if (shouldEndCall) {
          // Always use a short, no-intro closing — never repeat introduction at end of call.
          toSpeak = goodbye;
          // Will enter post-goodbye below: stay on line briefly in case user responds, then hang up
        } else if (
          !toSpeak?.trim() ||
          (isGenericFallback && state.lastAskedField)
        ) {
          toSpeak = state.lastAskedField
            ? askForFieldPhrase(state.lastAskedField)
            : toSpeak?.trim() || 'Is there anything else you can share?';
          if (!(nextMessage ?? '').trim() || isGenericFallback) {
            this.logger.warn(
              '[MediaStream] AI returned empty or generic nextMessage, using fallback',
            );
          }
        }
        // Final safeguard: never speak blank (eliminates silent/blank responses)
        if (!(toSpeak ?? '').trim()) {
          toSpeak = state.lastAskedField
            ? askForFieldPhrase(state.lastAskedField)
            : getRepeatOnlyPrompt();
        } else {
          toSpeak = (toSpeak ?? '').trim();
        }
        if (
          state.patientInfo?.dobFormatted &&
          toSpeak.includes(state.patientInfo.dobFormatted)
        ) {
          state.evaAwaitingYesAfterDob = true;
        }
        // In-memory transcript updates (sync): needed for verification save on stop.
        const userLineForLog =
          userSaid &&
          userSaid !== 'User did not respond or was inaudible.' &&
          !/^\[?inaudible\]?\.?$/i.test(userSaid) &&
          !/^\.{2,}$/.test(userSaid)
            ? userSaid
            : null;
        if (userLineForLog) {
          state.conversationTranscript.push('User: ' + userLineForLog);
        }
        if (toSpeak?.trim()) {
          state.conversationTranscript.push('EVA: ' + toSpeak.trim());
        }

        // Kick off TTS FIRST so the user hears EVA as early as possible.
        // Tracker DB writes and emotion classification run in parallel (fire-and-forget).
        let ttsPromise: Promise<number> = Promise.resolve(0);
        if (toSpeak?.trim()) {
          ttsPromise = speak(toSpeak, 'eva_reply').catch(() => 0);
        }

        if (userLineForLog) {
          void pushLiveTracker(`User: ${userLineForLog}`);
          void emotionPromise
            .then((tpaTone) => {
              if (tpaTone) {
                state.conversationTranscript.push(`[TPA_EMOTION] ${tpaTone}`);
                void pushLiveTracker(`[TPA_EMOTION] ${tpaTone}`);
              }
            })
            .catch(() => {});
        }
        if (toSpeak?.trim()) {
          void pushLiveTracker(`EVA: ${toSpeak.trim()}`);
        }

        if (toSpeak?.trim()) {
          const ttsMsMain = await ttsPromise;
          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs,
            ttsMs: ttsMsMain,
            totalMs: Date.now() - turnStart,
            tpa: userSaid,
            eva: toSpeak.trim(),
          });
        }

        if (shouldEndCall) {
          // Post-goodbye: already said short closing (e.g. "Got you. Have a good day.") — stay on line briefly in case user responds
          state.postGoodbyeUntil = Date.now() + POST_GOODBYE_LISTEN_MS;
          state.postGoodbyeTimeoutId = setTimeout(
            doPostGoodbyeHangUp,
            POST_GOODBYE_LISTEN_MS,
          );
          startFallbackTimer(); // keep processing buffer so we hear if user says something or thank you
        }
      } catch (err: any) {
        this.logger.warn('[MediaStream] Process buffer failed', err?.message);
        const repeatErr = getRepeatOnlyPrompt();
        const ttsErr = await speak(
          repeatErr,
          'repeat_after_process_error',
        ).catch(() => 0);
        this.logCallTurn(state.callSid, {
          prepMs,
          sttMs,
          llmMs,
          ttsMs: ttsErr,
          totalMs: Date.now() - turnStart,
          tpa: '—',
          eva: repeatErr,
          note: `(process error: ${err?.message ?? 'unknown'})`,
        });
      } finally {
        await emotionPromise.catch(() => {});
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
        msg =
          typeof data === 'string'
            ? JSON.parse(data)
            : JSON.parse(data.toString('utf-8'));
      } catch {
        return;
      }

      const event = msg?.event;

      if (event === 'connected') return;

      if (event === 'start') {
        state.streamSid = msg?.streamSid ?? msg?.start?.streamSid ?? null;
        state.callSid = msg?.start?.callSid ?? msg?.callSid ?? null;
        this.logCallEvent(
          state.callSid,
          `start mode=${state.mode} payeeId=${state.payeeId ?? 'none'}`,
        );
        if (!state.mode || state.mode === 'eva') {
          // Resolve payeeId from URL param or from call SID (stored when makeCall was used), so patient details are available before greeting
          if (state.callSid) {
            const ctx = this.twilioService.getStreamContextForCall(
              state.callSid,
            );
            if (ctx) {
              if (!state.payeeId?.trim()) state.payeeId = ctx.payeeId;
              if (!state.appointmentId?.trim() && ctx.appointmentId) {
                state.appointmentId = ctx.appointmentId;
              }
            }
          }
          void pushLiveTracker(
            `[CALL_EVENT] START callSid=${state.callSid ?? 'unknown'}`,
          );
        }
        startFallbackTimer();
        if (state.mode === 'ivr-bypass') {
          // No greeting; we only listen for IVR menu and send DTMF 4 when we hear "customer agent"
          return;
        }
        (async () => {
          try {
            if (state.payeeId) {
              const info = await this.verificationService.getPayeePatientInfo(
                state.payeeId,
              );
              if (info) {
                state.patientInfo = {
                  firstName: info.firstName,
                  lastName: info.lastName,
                  fullName: info.fullName,
                  dobFormatted: info.dobFormatted,
                  ssn: info.ssn,
                };
              } else {
                state.patientInfo = null;
                this.logger.warn(
                  '[MediaStream] Payee not found in DB for payeeId=' +
                    state.payeeId +
                    ' — patient details will be unavailable on this call.',
                );
              }
            }
            // Only use static patient info when there is no payeeId (e.g. generic inbound); never when payeeId is set but payee missing.
            if (!state.patientInfo && !state.payeeId) {
              state.patientInfo = STATIC_PATIENT_INFO;
              this.logger.warn(
                '[MediaStream] Using static patient info (no payeeId on stream). Pass payeeId in the stream URL to use real patient details from the database.',
              );
            }
            state.lastSpeakTime = Date.now();
            state.conversationTranscript.push('EVA: ' + CONVERSATION_GREETING);
            const greetStart = Date.now();
            const ttsGreet = await speak(
              CONVERSATION_GREETING,
              'opening_greeting',
            );
            this.logCallTurn(state.callSid, {
              prepMs: 0,
              sttMs: 0,
              llmMs: null,
              ttsMs: ttsGreet,
              totalMs: Date.now() - greetStart,
              tpa: '—',
              eva: CONVERSATION_GREETING,
              note: '(opening greeting)',
            });
            state.openingGreetingPlayed = true;
          } catch (e) {
            this.logger.warn(
              '[MediaStream] Greeting failed',
              (e as Error)?.message,
            );
          }
        })();
        return;
      }

      if (event === 'media' && msg?.media?.payload) {
        try {
          const payload = Buffer.from(msg.media.payload, 'base64');
          state.buffer.push(payload);
          tryTriggerProcess();
        } catch {}
        return;
      }

      if (event === 'stop') {
        this.logCallEvent(state.callSid, 'stream stopped');
        void pushLiveTracker(
          `[CALL_EVENT] END callSid=${state.callSid ?? 'unknown'}`,
        );
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
        const finalFields = state.orderedFields.length
          ? state.orderedFields
          : ['coverage', 'deductible', 'copay', 'validity'];
        if (
          state.payeeId &&
          finalFields.some(
            (f) =>
              state.extractedData[f] != null &&
              String(state.extractedData[f]).trim(),
          )
        ) {
          pushToVerificationService();
        } else if (!state.payeeId) {
          this.logger.warn(
            '[MediaStream] Call stopped but payeeId missing — verification NOT saved. Use ?payeeId=... in stream URL.',
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
      const intervalMs =
        state.mode === 'ivr-bypass'
          ? IVR_BYPASS_FALLBACK_MS
          : FALLBACK_PROCESS_INTERVAL_MS;
      const minBytes =
        state.mode === 'ivr-bypass' ? IVR_BYPASS_MIN_BYTES : MIN_SPEECH_BYTES;
      state.fallbackTimer = setInterval(() => {
        const combined = Buffer.concat(state.buffer);
        if (combined.length < minBytes) return;
        const now = Date.now();
        if (
          state.mode !== 'ivr-bypass' &&
          state.lastSpeakTime > 0 &&
          now - state.lastSpeakTime < ANSWER_WINDOW_MS
        ) {
          return;
        }
        state.buffer = [];
        clearInterval(state.fallbackTimer!);
        state.fallbackTimer = null;
        processBuffer(combined);
      }, intervalMs);
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
