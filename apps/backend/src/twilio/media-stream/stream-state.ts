import type { PatientCallContext } from '../../verification/verification.service';

/** Patient info from DB for EVA to use in prompts (name, DOB, SSN when asked). */
export interface PatientInfo {
  firstName: string;
  lastName: string;
  fullName: string;
  dobFormatted: string | null;
  ssn: string | null;
}

/** Mutable WebSocket session state for one Twilio media stream. */
export interface StreamState {
  buffer: Buffer[];
  streamSid: string | null;
  callSid: string | null;
  processing: boolean;
  fallbackTimer: ReturnType<typeof setInterval> | null;
  patientId: string | null;
  patientInfo: PatientInfo | null;
  /** Pre-loaded full identity context (provider NPI/Tax ID, member ID, payer, etc.)
   *  so EVA can answer TPA verification questions immediately without extra DB round-trips. */
  callContext: PatientCallContext | null;
  /** Dynamic verification fields (key = field name from VerificationRequirement). */
  extractedData: Record<string, string | null>;
  /** Ordered list of field keys to collect (matches appointment `verificationFields` or requirement). */
  orderedFields: string[];
  /** Exact question text per field key from appointment / requirement payload (ask verbatim). */
  fieldQuestionByKey: Record<string, string>;
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
  mode: 'eva' | 'tpa-ivr';
  /** True after we've already said our purpose (e.g. "I need a few benefit details") — avoid repeating it while user is speaking. */
  purposeSaid: boolean;
  /**
   * TPA has opened the benefit Q&A segment (e.g. "What would you like to know about the patient?").
   * Until this is true, EVA must not ask verbatim benefit verification questions.
   */
  tpaBenefitQnaOpen: boolean;
  /** Identity verification far enough along to allow benefit collection once TPA opens benefit Q&A. */
  patientIdentityReadyForBenefits: boolean;
  /** One-time gentle line after very long silence while waiting for TPA benefit-topic handoff. */
  postDobSilenceNudgePlayed: boolean;
  /** True after "I would need …" prefixes the first missing benefit question (one time per call). */
  firstBenefitSoINeedPrefixUsed: boolean;
  /** Count of TPA-led identity questions we have answered from the cache. */
  identityAnswersGiven: number;
  /** True on the turn we completed the last benefit field — triggers the "That's all I have"
   *  intermediate line. Next TPA turn will typically be a thank-you / goodbye; then we close. */
  justCompletedAllFields: boolean;
  /** Locked after we play the "That's all I have" line so we never ask any benefit field again. */
  allDoneAnnounced: boolean;
  /** Consecutive turns with skip / inaudible / weak audio — for skip-LLM and abort guardrails. */
  consecutiveNoiseOrEmptyTurns: number;
  /** Set after EVA's first spoken intro on the live call (deferred until the TPA finishes their opener). */
  openingGreetingPlayed: boolean;
}

/** Per-call TPA IVR script (Part 1); survives Twilio reconnect after DTMF. */
export type TpaIvrRuntimeState = {
  callStartedAt: number;
  /** Heard characteristic IVR open (recording, language menu, etc.). */
  ivrStarted: boolean;
  disclaimerEnDone: boolean;
  disclaimerEsDone: boolean;
  /** When English disclaimer was first heard (for Spanish wait timeout). */
  disclaimerEnAt: number | null;
  saidProviderYes: boolean;
  saidEligibilityBenefits: boolean;
  saidRepresentativeSummary: boolean;
  memberDtmfSent: boolean;
  dobDtmfSent: boolean;
  routingPullDone: boolean;
  routingAgentOnlineDone: boolean;
  surveyDone: boolean;
};
