/**
 * End-of-turn detection (mulaw silence) and stream modes that use IVR-timed processing.
 */
import { SILENCE_RATIO_THRESHOLD, SILENCE_TAIL_BYTES } from './constants';

export function streamModeUsesIvrTiming(m: 'eva' | 'tpa-ivr'): boolean {
  return m === 'tpa-ivr';
}

/** Mulaw: 0xFF (positive silence) and 0x7F (negative silence) are the two silence poles; treat nearby codes as silent too so we detect end-of-speech reliably. */
export function isSilentByte(b: number): boolean {
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
export function isSilenceAtEnd(buffer: Buffer): boolean {
  if (buffer.length < SILENCE_TAIL_BYTES) return false;
  const tail = buffer.subarray(buffer.length - SILENCE_TAIL_BYTES);
  let silent = 0;
  for (let i = 0; i < tail.length; i++) {
    if (isSilentByte(tail[i])) silent++;
  }
  return silent / tail.length >= SILENCE_RATIO_THRESHOLD;
}
