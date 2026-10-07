/** High-level IVR bypass / handoff phases for a TPA outbound call. */
export type IvrDetectionPhase =
  | 'CONNECTING'
  | 'IVR'
  | 'IVR_INPUT_REQUIRED'
  | 'IVR_WAITING'
  | 'HUMAN_DETECTED'
  | 'TPA_CONNECTED';

export type IvrLlmClassification = 'IVR' | 'HUMAN_TPA' | 'UNCERTAIN';

/** Per-call rolling detection state (keyed by callSid in the media-stream handler). */
export interface IvrDetectionSession {
  phase: IvrDetectionPhase;
  /** Rolling 0–100 — higher means more IVR-like evidence this call. */
  ivrScore: number;
  /** Rolling 0–100 — higher means more live-human / TPA evidence. */
  humanScore: number;
  humanSignalCount: number;
  ivrSignalCount: number;
  recentTranscripts: string[];
  llmFallbackCount: number;
  lastLlmAt: number | null;
  turnCount: number;
  lastLogLine: string;
}

export interface IvrKeywordLayerResult {
  ivrDelta: number;
  humanDelta: number;
  reasons: string[];
}

export interface IvrAudioPatternLayerResult {
  ivrDelta: number;
  humanDelta: number;
  reasons: string[];
}

export interface IvrDetectionTurnInput {
  transcript: string;
  audioByteLength: number;
  trailingSilence: boolean;
  /** Known scripted IVR path flags (member/DOB DTMF, routing, survey, etc.). */
  script: {
    ivrStarted: boolean;
    dobDtmfSent: boolean;
    memberDtmfSent: boolean;
    routingPullDone: boolean;
    routingAgentOnlineDone: boolean;
    surveyDone: boolean;
    dtmfRedirectPending: boolean;
    /** STT matched member ID or DOB keypad prompt this turn. */
    collectingKeypadInput: boolean;
  };
  session: IvrDetectionSession;
  /** Strong legacy live-agent phrase match from `tpa-ivr.ts`. */
  legacyLiveAgentMatch: boolean;
  legacyDentalLiveIntro: boolean;
}

export interface IvrDetectionTurnResult {
  phase: IvrDetectionPhase;
  ivrScore: number;
  humanScore: number;
  shouldHandoffToEva: boolean;
  shouldInvokeLlmFallback: boolean;
  logSummary: string;
  layerNotes: string[];
}

export interface IvrLlmClassificationResult {
  classification: IvrLlmClassification;
  confidence: number;
  rationale?: string;
}
