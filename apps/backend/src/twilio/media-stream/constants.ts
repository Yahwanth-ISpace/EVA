/**
 * Tunables and fixed phrases for the Twilio media stream (EVA voice).
 * @see media-stream.handler.ts — orchestration lives there.
 */

/** Minimum speech bytes before we consider processing (~0.6 sec at 8kHz mulaw). Low enough to feel snappy but still rejects noise blips. */
export const MIN_SPEECH_BYTES = 4_800;
/** Tail bytes to check for silence (~0.45 sec). Slightly longer so EVA does not jump in before the rep finishes. */
export const SILENCE_TAIL_BYTES = Number(
  process.env.EVA_SILENCE_TAIL_BYTES || 3_600,
);
/** When transcript is empty, only say "please repeat" if we had at least this much audio (~4 sec). Otherwise skip speaking to avoid cutting off the user. */
export const MIN_BYTES_BEFORE_REPEAT = 32_000;
/** Fraction of tail bytes that must be "silent" to trigger end-of-speech (0–1). */
export const SILENCE_RATIO_THRESHOLD = Number(
  process.env.EVA_SILENCE_RATIO_THRESHOLD || 0.82,
);
/** Max buffer before we process anyway (~10 sec). Long monologues get processed so we don't wait forever. */
export const MAX_BUFFER_BYTES = 80_000;
/** Fallback: process at most every N ms when silence not detected. */
export const FALLBACK_PROCESS_INTERVAL_MS = Number(
  process.env.EVA_FALLBACK_PROCESS_INTERVAL_MS || 4_000,
);
/** Minimum ms to wait after EVA speaks before we process user audio (avoid echo + rushed replies). */
export const ANSWER_WINDOW_MS = Number(process.env.EVA_ANSWER_WINDOW_MS || 2_700);
/** Brief pause before EVA speaks (feels like a person thinking, not instant machine reply). */
export const EVA_PRE_SPEAK_DELAY_MS = Number(
  process.env.EVA_PRE_SPEAK_DELAY_MS || 550,
);
/** Real-time pacing for outbound mulaw (160 bytes ≈ 20 ms at 8 kHz). Set 0 to send all audio at once. */
export const EVA_TTS_CHUNK_PACE_MS = Number(
  process.env.EVA_TTS_CHUNK_PACE_MS || 20,
);
/** Max time allowed on hold before ending the call (9 minutes) */
export const HOLD_MAX_MS = 9 * 60 * 1000;
/** Chunk size to send back to Twilio (20ms = 160 bytes at 8kHz mulaw). Smaller chunks = playback starts faster. */
export const OUTBOUND_CHUNK_BYTES = 160;

/** After this many consecutive inaudible turns, skip LLM and use a fixed English line. */
export const MAX_NOISE_TURNS_BEFORE_SKIP_LLM = Number(
  process.env.EVA_MAX_NOISE_SKIP_LLM || 8,
);
/**
 * Legacy abort threshold — hang-up on noise is OFF by default (see EVA_ABORT_CALL_ON_NOISE).
 * Kept high so accidental disconnects from line noise are rare even when enabled.
 */
export const MAX_NOISE_TURNS_BEFORE_ABORT_CALL = Number(
  process.env.EVA_MAX_NOISE_ABORT || 40,
);
/** When true, EVA may hang up after MAX_NOISE_TURNS_BEFORE_ABORT_CALL inaudible turns. Default: stay on the line. */
export const EVA_ABORT_CALL_ON_NOISE =
  process.env.EVA_ABORT_CALL_ON_NOISE === '1' ||
  process.env.EVA_ABORT_CALL_ON_NOISE === 'true';

/** TPA IVR (`mode=tpa-ivr`): process buffered audio on this interval when end-of-turn silence is not detected. */
export const TPA_IVR_STREAM_FALLBACK_MS = 2500;
/** TPA IVR: minimum audio bytes before running STT (~0.5 s). */
export const TPA_IVR_STREAM_MIN_BYTES = 4_000;

/** If no IVR start phrase is detected, begin scripted matching after this many ms. */
export const TPA_IVR_FORCE_START_MS = Number(
  process.env.TPA_IVR_FORCE_START_MS || 28000,
);
/** After English recording disclaimer, auto-skip waiting for Spanish if not heard (ms). */
export const TPA_IVR_SPANISH_WAIT_MS = Number(
  process.env.TPA_IVR_SPANISH_WAIT_MS || 16000,
);

/** Brief reply when the TPA greets or asks how EVA is (no full intro yet — wait for their next line). */
export const EVA_SOCIAL_GREETING_REPLY = "Hi, I'm doing great, thank you!";

/** Reply when the TPA asked how EVA is doing (no leading "Hi, I'm Reena" — intro follows in the same turn). */
export const EVA_HOW_ARE_YOU_REPLY = "I'm doing great, thank you!";

/** Identity intro without a second "Hi" — used after EVA_HOW_ARE_YOU_REPLY or on the turn after greet-only. */
export const EVA_INTRO_IDENTITY_LINE =
  "I'm Reena — I'm calling from Went Dentals.";

/** First EVA line after a substantive TPA opener (how can I help, long intro) when how-are-you was not asked. */
export const EVA_INTRO_LINE = `Hi, this is Reena — I'm calling from Went Dentals.`;

/** @deprecated Use EVA_INTRO_LINE — kept for log labels / backwards compatibility. */
export const CONVERSATION_GREETING = EVA_INTRO_LINE;

/**
 * Single line when the TPA asks how they can help — no coverage/deductible list here.
 * Voice path uses this (see `pickPurposeOfCallPhrase` in guardrails.ts).
 */
export const EVA_SIMPLE_PURPOSE_FOR_OPENING =
  'I need a few benefit details of a patient.';

/** After a time-of-day greeting when the rep does not speak for ~1s. */
export const EVA_TIME_OF_DAY_PURPOSE_FOLLOWUP =
  'I want to verify a few patient benefits.';

/** Mid-call hi/hello presence check — do not re-introduce. */
export const EVA_MID_CALL_CONTINUE_LINE =
  'Hi, sorry. Can we please continue now?';

/** Optional extra phrasing (e.g. tests); voice uses `EVA_SIMPLE_PURPOSE_FOR_OPENING` only. */
export const PURPOSE_OF_CALL_LINE_VARIANTS = [
  EVA_SIMPLE_PURPOSE_FOR_OPENING,
  'I want to verify benefit details of the patient I have.',
  'Our office needs to verify a few benefit details for a patient.',
] as const;

export const EVA_HOLD_ACK = "Sure, I'll hold. Take your time.";
/** After they say "thanks for waiting", "are you there" etc. — acknowledge only; do not re-ask the question yet. */
export const EVA_RESUME_ACK =
  "No problem, thank you for getting back. I'm on the call.";

/** Duration (ms) to stay on the line after saying goodbye (in case user responds); then hang up if no input */
export const POST_GOODBYE_LISTEN_MS = 10_000;

/**
 * After EVA gives DOB (awaiting TPA), if the line is still quiet for this long, EVA may say
 * one gentle nudge — not used during normal benefit-gate waiting.
 */
export const POST_DOB_LONG_SILENCE_NUDGE_MS = Number(
  process.env.POST_DOB_LONG_SILENCE_NUDGE_MS || 42000,
);

export const EVA_POST_DOB_SILENCE_NUDGE =
  "Sounds good. Whenever you're ready, I can go through the benefit details we need for this patient.";

/** Randomized short ack after TPA gives a benefit value (then ask next field). */
export const EVA_POST_VALUE_ACK_PHRASES = [
  'Okay.',
  'Got you.',
  'Thank you.',
  'Awesome.',
  'Thanks.',
  'Done.',
  'Okay, and next.',
  'Yup.',
] as const;
