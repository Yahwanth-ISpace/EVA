import type { IvrAudioPatternLayerResult } from './ivr-detection.types';

/**
 * Layer 2 — lightweight conversation / audio-turn heuristics from STT + buffer metadata.
 * Supporting signal only; never sufficient alone for EVA handoff.
 */
export function evaluateAudioPatternLayer(input: {
  transcript: string;
  audioByteLength: number;
  trailingSilence: boolean;
}): IvrAudioPatternLayerResult {
  const result: IvrAudioPatternLayerResult = {
    ivrDelta: 0,
    humanDelta: 0,
    reasons: [],
  };
  const t = input.transcript.trim();
  if (!t) {
    if (input.trailingSilence && input.audioByteLength > 6000) {
      result.ivrDelta += 6;
      result.reasons.push('audio:silenceTurn(+6 ivr)');
    }
    return result;
  }

  const words = t.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const pressMatches = t.match(/press\s+\d/gi);
  if (pressMatches && pressMatches.length >= 2) {
    result.ivrDelta += 14;
    result.reasons.push('audio:multiPressMenu(+14 ivr)');
  }

  if (wordCount >= 28 && !/\b(i'm|i am|we're|don't|can't)\b/i.test(t)) {
    result.ivrDelta += 8;
    result.reasons.push('audio:longFormalMonologue(+8 ivr)');
  }

  if (
    wordCount >= 4 &&
    wordCount <= 22 &&
    /\b(hi|hello|thanks for holding)\b/i.test(t) &&
    /\b(help|assist|name is|this is)\b/i.test(t)
  ) {
    result.humanDelta += 12;
    result.reasons.push('audio:conversationalOpener(+12 human)');
  }

  if (input.trailingSilence && wordCount <= 14 && /please hold|one moment|survey/i.test(t)) {
    result.ivrDelta += 10;
    result.reasons.push('audio:holdPromptWithSilence(+10 ivr)');
  }

  if (input.audioByteLength >= 12000 && wordCount <= 8 && /press|enter|say/i.test(t)) {
    result.ivrDelta += 6;
    result.reasons.push('audio:shortPromptLongAudio(+6 ivr)');
  }

  return result;
}
