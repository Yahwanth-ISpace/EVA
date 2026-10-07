import { getIvrDetectionThresholds } from './ivr-detection.config';
import { evaluateAudioPatternLayer } from './audio-pattern-layer';
import { evaluateKeywordLayer } from './keyword-layer';
import type {
  IvrDetectionPhase,
  IvrDetectionSession,
  IvrDetectionTurnInput,
  IvrDetectionTurnResult,
  IvrLlmClassificationResult,
} from './ivr-detection.types';

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function createIvrDetectionSession(): IvrDetectionSession {
  return {
    phase: 'CONNECTING',
    ivrScore: 0,
    humanScore: 0,
    humanSignalCount: 0,
    ivrSignalCount: 0,
    recentTranscripts: [],
    llmFallbackCount: 0,
    lastLlmAt: null,
    turnCount: 0,
    lastLogLine: '',
  };
}

function derivePhase(
  script: IvrDetectionTurnInput['script'],
  ivrScore: number,
  humanScore: number,
  handoffReady: boolean,
): IvrDetectionPhase {
  if (handoffReady) return 'TPA_CONNECTED';
  if (!script.ivrStarted) return 'CONNECTING';
  if (script.dobDtmfSent) {
    if (humanScore >= 55 && ivrScore <= 50) return 'HUMAN_DETECTED';
    return 'IVR_WAITING';
  }
  if (script.dtmfRedirectPending || script.collectingKeypadInput) {
    return 'IVR_INPUT_REQUIRED';
  }
  if (ivrScore >= 42) return 'IVR';
  return 'IVR';
}

function scriptSupportsHandoff(script: IvrDetectionTurnInput['script']): boolean {
  return script.dobDtmfSent && !script.dtmfRedirectPending;
}

function deterministicHandoff(
  input: IvrDetectionTurnInput,
  ivrScore: number,
  humanScore: number,
  thresholds: ReturnType<typeof getIvrDetectionThresholds>,
): boolean {
  if (!scriptSupportsHandoff(input.script)) return false;

  if (input.legacyDentalLiveIntro) return true;

  if (input.legacyLiveAgentMatch && input.script.surveyDone) return true;

  if (
    humanScore >= thresholds.handoffHumanScore &&
    ivrScore <= thresholds.handoffMaxIvrScore
  ) {
    return true;
  }

  if (
    humanScore >= thresholds.handoffMultiSignalHumanScore &&
    input.session.humanSignalCount >= thresholds.handoffMultiSignalMinCount &&
    ivrScore <= thresholds.handoffMaxIvrScore + 8
  ) {
    return true;
  }

  if (
    input.script.routingAgentOnlineDone &&
    humanScore >= thresholds.handoffMultiSignalHumanScore &&
    input.session.humanSignalCount >= 1
  ) {
    return true;
  }

  return false;
}

function ambiguousForLlm(
  input: IvrDetectionTurnInput,
  ivrScore: number,
  humanScore: number,
  handoffReady: boolean,
  thresholds: ReturnType<typeof getIvrDetectionThresholds>,
): boolean {
  if (!thresholds.llmEnabled || handoffReady) return false;
  if (!scriptSupportsHandoff(input.script)) return false;
  if (input.session.llmFallbackCount >= thresholds.llmMaxPerCall) return false;
  if (
    input.session.lastLlmAt != null &&
    Date.now() - input.session.lastLlmAt < thresholds.llmCooldownMs
  ) {
    return false;
  }

  const mixed = humanScore >= 35 && ivrScore >= 35;
  const weakLive =
    input.legacyLiveAgentMatch &&
    !input.script.surveyDone &&
    humanScore >= 40;
  const waitingUncertain =
    input.script.dobDtmfSent &&
    humanScore >= 42 &&
    humanScore < thresholds.handoffHumanScore &&
    ivrScore >= 30;

  return mixed || weakLive || waitingUncertain;
}

/** Layer 3 — fuse signals, update session, decide handoff vs LLM fallback. */
export function runIvrDetectionTurn(
  input: IvrDetectionTurnInput,
): IvrDetectionTurnResult {
  const thresholds = getIvrDetectionThresholds();
  const session = input.session;
  session.turnCount += 1;

  const layerNotes: string[] = [];
  const keyword = evaluateKeywordLayer(input.transcript);
  const audio = evaluateAudioPatternLayer({
    transcript: input.transcript,
    audioByteLength: input.audioByteLength,
    trailingSilence: input.trailingSilence,
  });

  layerNotes.push(...keyword.reasons, ...audio.reasons);

  session.ivrScore = clampScore(
    session.ivrScore -
      thresholds.scoreDecayPerTurn +
      keyword.ivrDelta +
      audio.ivrDelta,
  );
  session.humanScore = clampScore(
    session.humanScore -
      thresholds.scoreDecayPerTurn +
      keyword.humanDelta +
      audio.humanDelta,
  );

  if (keyword.humanDelta >= 18 || audio.humanDelta >= 10) {
    session.humanSignalCount += 1;
  }
  if (keyword.ivrDelta >= 14 || audio.ivrDelta >= 8) {
    session.ivrSignalCount += 1;
  }

  const snippet = input.transcript.trim().slice(0, 280);
  if (snippet) {
    session.recentTranscripts = [
      snippet,
      ...session.recentTranscripts,
    ].slice(0, 6);
  }

  if (input.script.dtmfRedirectPending) {
    session.ivrScore = clampScore(session.ivrScore + 8);
    layerNotes.push('script:dtmfRedirect(+8 ivr)');
  }
  if (input.script.dobDtmfSent) {
    layerNotes.push('script:postDobPhase');
  }

  let handoffReady = deterministicHandoff(
    input,
    session.ivrScore,
    session.humanScore,
    thresholds,
  );

  const phase = derivePhase(
    input.script,
    session.ivrScore,
    session.humanScore,
    handoffReady,
  );
  session.phase = phase;

  const shouldInvokeLlmFallback =
    !handoffReady &&
    ambiguousForLlm(
      input,
      session.ivrScore,
      session.humanScore,
      handoffReady,
      thresholds,
    );

  const logSummary =
    `IVR_DETECT phase=${phase} ivrScore=${session.ivrScore} humanScore=${session.humanScore} ` +
    `signals(h=${session.humanSignalCount},i=${session.ivrSignalCount}) ` +
    `handoff=${handoffReady} llm=${shouldInvokeLlmFallback}`;

  session.lastLogLine = logSummary;

  return {
    phase,
    ivrScore: session.ivrScore,
    humanScore: session.humanScore,
    shouldHandoffToEva: handoffReady,
    shouldInvokeLlmFallback,
    logSummary,
    layerNotes,
  };
}

/** Apply layer 4 LLM classification onto the session (call after Gemini returns). */
export function applyIvrLlmClassification(
  session: IvrDetectionSession,
  llm: IvrLlmClassificationResult,
): { shouldHandoffToEva: boolean; logLine: string } {
  const thresholds = getIvrDetectionThresholds();
  session.llmFallbackCount += 1;
  session.lastLlmAt = Date.now();

  let shouldHandoff = false;
  if (
    llm.classification === 'HUMAN_TPA' &&
    llm.confidence >= thresholds.llmMinConfidence
  ) {
    session.humanScore = clampScore(session.humanScore + 25);
    session.humanSignalCount += 1;
    session.phase = 'TPA_CONNECTED';
    shouldHandoff = true;
  } else if (llm.classification === 'IVR' && llm.confidence >= 0.65) {
    session.ivrScore = clampScore(session.ivrScore + 20);
    session.ivrSignalCount += 1;
  }

  const logLine =
    `IVR_LLM class=${llm.classification} conf=${llm.confidence.toFixed(2)} ` +
    `handoff=${shouldHandoff} rationale=${(llm.rationale || '').slice(0, 120)}`;

  session.lastLogLine = `${session.lastLogLine} | ${logLine}`;
  return { shouldHandoffToEva: shouldHandoff, logLine };
}
