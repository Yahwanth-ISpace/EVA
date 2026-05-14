/**
 * Tunables and fixed phrases for the Twilio media stream (EVA voice).
 * @see media-stream.handler.ts — orchestration lives there.
 */

/** Minimum speech bytes before we consider processing (~0.6 sec at 8kHz mulaw). Low enough to feel snappy but still rejects noise blips. */
export const MIN_SPEECH_BYTES = 4_800;
/** Tail bytes to check for silence (~0.35 sec). Short enough that EVA replies almost immediately after the user finishes. */
export const SILENCE_TAIL_BYTES = 2_800;
/** When transcript is empty, only say "please repeat" if we had at least this much audio (~4 sec). Otherwise skip speaking to avoid cutting off the user. */
export const MIN_BYTES_BEFORE_REPEAT = 32_000;
/** Fraction of tail bytes that must be "silent" to trigger end-of-speech (0–1). 0.78 balances fast turn-end vs. not cutting on brief mid-sentence breaths. */
export const SILENCE_RATIO_THRESHOLD = 0.78;
/** Max buffer before we process anyway (~10 sec). Long monologues get processed so we don't wait forever. */
export const MAX_BUFFER_BYTES = 80_000;
/** Fallback: process at most every N ms when silence not detected. Tightened (2.5s) so an un-detected end-of-turn is caught quickly rather than waiting 5.5s. */
export const FALLBACK_PROCESS_INTERVAL_MS = 2_500;
/** Minimum ms to wait after EVA speaks before we process user audio (avoid capturing EVA's voice and instant double-response). Kept short so barge-in feels natural. */
export const ANSWER_WINDOW_MS = 900;
/** Max time allowed on hold before ending the call (9 minutes) */
export const HOLD_MAX_MS = 9 * 60 * 1000;
/** Chunk size to send back to Twilio (20ms = 160 bytes at 8kHz mulaw). Smaller chunks = playback starts faster. */
export const OUTBOUND_CHUNK_BYTES = 160;

/** After this many consecutive noise / empty / inaudible turns, skip LLM and use a fixed English line. */
export const MAX_NOISE_TURNS_BEFORE_SKIP_LLM = 5;
/** After this many, apologize and end the call (audio unusable). */
export const MAX_NOISE_TURNS_BEFORE_ABORT_CALL = 12;

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

/** First EVA line after the live TPA finishes their opener — identity only on request; no patient name/DOB here. */
export const EVA_INTRO_LINE =
  "Hi, this is Reena — I'm calling from Went Dentals.";

/** @deprecated Use EVA_INTRO_LINE — kept for log labels / backwards compatibility. */
export const CONVERSATION_GREETING = EVA_INTRO_LINE;

/** One sentence, same intent — rotate so we never sound canned when TPA asks purpose (fallback if LLM mis-hears). */
export const PURPOSE_OF_CALL_LINE_VARIANTS = [
  'I need a few benefit details for a patient.',
  "I'm calling to collect insurance benefit information for one of our patients.",
  'Our office needs to verify a few benefit details for a patient.',
  "I'm reaching out to confirm coverage and related benefit information for a patient.",
  'I want to verify benefit details of the patient I have.',
  "I'm following up to get benefit details we need for a patient's visit.",
  'The call is about gathering benefit verification for a patient appointment.',
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
