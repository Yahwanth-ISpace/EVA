/**
 * Media stream handler — Twilio WebSocket orchestration for EVA (STT → LLM → TTS, verification, IVR modes).
 *
 * Supporting modules live in this folder, grouped by concern:
 * - `constants.ts` — buffer/timing tunables and fixed phrases (`EVA_INTRO_LINE`, hold/resume lines, …)
 * - `speech.ts` — mulaw silence / end-of-turn detection and `streamModeUsesIvrTiming`
 * - `tpa-ivr.ts` — payer IVR phrase detection and DTMF builders
 * - `guardrails.ts` — user/EVA intent, identity Q&A, benefit heuristics, recall/hold/resume
 * - `stream-state.ts` — `StreamState`, `TpaIvrRuntimeState`, `PatientInfo`
 * - `static-context.ts` — fallback patient + `PatientCallContext` for inbound/demo
 * - `call-context-sync.ts` — map appointment `verificationSteps` → `fieldQuestionByKey`
 * - `field-order-load.ts` — lazy-load ordered fields + questions (Mongo vs Prisma)
 * - `logging.ts` — log line truncation
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
import {
  VerificationService,
  type PatientCallContext,
} from '../verification/verification.service';
import { VerificationRequirementService } from '../verification-requirement/verification-requirement.service';
import { BotTrackerService } from '../bot-tracker/bot-tracker.service';
import { TwilioService } from './twilio.service';
import {
  AudioEmotionService,
  type TpaEmotionCategory,
} from '../audio-emotion/audio-emotion.service';
import { getFfmpegErrorMessage } from '../voice/ffmpeg-check';
import { applyVerificationStepsToStreamState } from './media-stream/call-context-sync';
import { loadBenefitFieldOrderIfNeeded } from './media-stream/field-order-load';
import {
  ANSWER_WINDOW_MS,
  EVA_INTRO_LINE,
  EVA_HOLD_ACK,
  EVA_POST_DOB_SILENCE_NUDGE,
  EVA_RESUME_ACK,
  FALLBACK_PROCESS_INTERVAL_MS,
  HOLD_MAX_MS,
  POST_DOB_LONG_SILENCE_NUDGE_MS,
  TPA_IVR_STREAM_FALLBACK_MS,
  TPA_IVR_STREAM_MIN_BYTES,
  MAX_BUFFER_BYTES,
  MAX_NOISE_TURNS_BEFORE_ABORT_CALL,
  MAX_NOISE_TURNS_BEFORE_SKIP_LLM,
  MIN_BYTES_BEFORE_REPEAT,
  MIN_SPEECH_BYTES,
  OUTBOUND_CHUNK_BYTES,
  POST_GOODBYE_LISTEN_MS,
  TPA_IVR_FORCE_START_MS,
  TPA_IVR_SPANISH_WAIT_MS,
} from './media-stream/constants';
import { truncateForLogLine } from './media-stream/logging';
import { isSilenceAtEnd, streamModeUsesIvrTiming } from './media-stream/speech';
import { STATIC_CALL_CONTEXT, STATIC_PATIENT_INFO } from './media-stream/static-context';
import type { StreamState, TpaIvrRuntimeState } from './media-stream/stream-state';
import {
  buildDobDtmf,
  buildMemberIdDtmf,
  tpaIvrSoundsLikeAgentOnlineRouting,
  tpaIvrSoundsLikeBenefitSummaryOrDetailPrompt,
  tpaIvrSoundsLikeDentalTpaLiveIntro,
  tpaIvrSoundsLikeDobPrompt,
  tpaIvrSoundsLikeEnglishRecordingDisclaimer,
  tpaIvrSoundsLikeIvrStart,
  tpaIvrSoundsLikeLiveAgent,
  tpaIvrSoundsLikeMemberIdPrompt,
  tpaIvrSoundsLikeProviderQuestion,
  tpaIvrSoundsLikePullUpAccountRouting,
  tpaIvrSoundsLikeReasonPrompt,
  tpaIvrSoundsLikeSpanishRecordingDisclaimer,
  tpaIvrSoundsLikeSurveyStayOnLine,
} from './media-stream/tpa-ivr';
import {
  answerIdentityFromContext,
  detectIdentityAsk,
  extractValueForField,
  getFirstMissingField,
  getRecallReply,
  getRepeatOnlyPrompt,
  isBareAcknowledgement,
  isBenefitFieldAsk,
  isFullOpeningSelfIntro,
  isHoldPhrase,
  isIntroPurposePhrase,
  isResumePhrase,
  isSubstantiveTpaOpener,
  isThankYouOrGoodbye,
  isTpaBenefitQnaHandoff,
  pickPurposeOfCallPhrase,
  transcriptHasValue,
  transcriptIsDate,
  transcriptIsMoney,
  userAsksPurposeOfCallOrOpening,
  userAskedWhoIsCalling,
  verbatimBenefitQuestion,
} from './media-stream/guardrails';

@Injectable()
export class MediaStreamHandlerService {
  private readonly logger = new Logger(MediaStreamHandlerService.name);

  private readonly tpaIvrByCallSid = new Map<string, TpaIvrRuntimeState>();

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
    PatientID?: string | null,
    mode?: string | null,
    AppointmentID?: string | null,
  ): void {
    const isTpaIvr = mode === 'tpa-ivr';
    const state: StreamState = {
      buffer: [],
      streamSid: null,
      callSid: null,
      processing: false,
      fallbackTimer: null,
      patientId: PatientID ?? null,
      patientInfo: null,
      callContext: null,
      extractedData: {},
      orderedFields: [],
      fieldQuestionByKey: {},
      verificationRequirementId: null,
      appointmentId: AppointmentID?.trim() || null,
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
      mode: isTpaIvr ? 'tpa-ivr' : 'eva',
      purposeSaid: false,
      tpaBenefitQnaOpen: false,
      patientIdentityReadyForBenefits: false,
      evaAwaitingYesAfterDob: false,
      postDobSilenceNudgePlayed: false,
      identityAnswersGiven: 0,
      evaAwaitingYesAfterIdentity: false,
      justCompletedAllFields: false,
      allDoneAnnounced: false,
      consecutiveNoiseOrEmptyTurns: 0,
      openingGreetingPlayed: false,
    };

    const send = (obj: object) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    const pushLiveTracker = async (line: string) => {
      if (!state.patientId || !line?.trim()) return;
      try {
        await this.botTrackerService.create({
          PatientID: state.patientId,
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
      if (!state.patientId) {
        this.logger.warn(
          '[MediaStream] Verification NOT saved: patientId is missing. Pass patientId (or payeeId) in the media-stream URL so verification can be stored.',
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
          state.patientId,
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
        state.patientId &&
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
      if (!streamModeUsesIvrTiming(state.mode) && state.onHold) return;
      const now = Date.now();
      if (
        !streamModeUsesIvrTiming(state.mode) &&
        state.lastSpeakTime > 0 &&
        now - state.lastSpeakTime < ANSWER_WINDOW_MS
      ) {
        return;
      }
      const combined = Buffer.concat(state.buffer);
      const minBytes = streamModeUsesIvrTiming(state.mode)
        ? TPA_IVR_STREAM_MIN_BYTES
        : MIN_SPEECH_BYTES;
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

      const qField = (field: string) =>
        verbatimBenefitQuestion(field, state.fieldQuestionByKey);

      const ensurePatientCallContext = async () => {
        if (state.callContext || !state.patientId?.trim()) return;
        const ctx = await this.verificationService
          .getPatientCallContext(state.patientId, state.appointmentId)
          .catch(() => null);
        if (ctx) {
          state.callContext = ctx;
          state.patientInfo = {
            firstName: ctx.patient.firstName,
            lastName: ctx.patient.lastName,
            fullName: ctx.patient.fullName,
            dobFormatted: ctx.patient.dobFormatted,
            ssn: ctx.patient.ssn,
          };
          applyVerificationStepsToStreamState(state, ctx);
        }
      };

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

        emotionPromise = streamModeUsesIvrTiming(state.mode)
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

        // --- TPA IVR Part 1: payer IVR script (listen → speech/DTMF) → Part 2: live TPA intro → EVA ---
        if (state.mode === 'tpa-ivr') {
          if (!state.callSid) {
            state.processing = false;
            return;
          }
          const ivr = this.ensureTpaIvrState(state.callSid);
          const elapsed = Date.now() - ivr.callStartedAt;
          const t = userSaid.trim();
          let spoke: string | null = null;
          let redirected = false;

          const ivrDebugNote = () =>
            `TPA_IVR flags ivr=${ivr.ivrStarted} en=${ivr.disclaimerEnDone} es=${ivr.disclaimerEsDone} prov=${ivr.saidProviderYes} elig=${ivr.saidEligibilityBenefits} rep=${ivr.saidRepresentativeSummary} mid=${ivr.memberDtmfSent} dob=${ivr.dobDtmfSent} rPull=${ivr.routingPullDone} rAgent=${ivr.routingAgentOnlineDone} survey=${ivr.surveyDone}`;

          if (
            ivr.disclaimerEnDone &&
            !ivr.disclaimerEsDone &&
            ivr.disclaimerEnAt != null &&
            Date.now() - ivr.disclaimerEnAt > TPA_IVR_SPANISH_WAIT_MS
          ) {
            ivr.disclaimerEsDone = true;
          }

          if (!ivr.ivrStarted) {
            if (
              tpaIvrSoundsLikeIvrStart(t) ||
              elapsed > TPA_IVR_FORCE_START_MS
            ) {
              ivr.ivrStarted = true;
              this.logCallEvent(
                state.callSid,
                'TPA_IVR_PART1 — IVR start detected (listen-only until scripted responses)',
              );
            } else {
              this.logCallTurn(state.callSid, {
                prepMs,
                sttMs,
                llmMs: null,
                ttsMs: 0,
                totalMs: Date.now() - turnStart,
                tpa: t || '—',
                eva: '—',
                note: '(TPA IVR waiting for IVR start — silent)',
              });
              state.processing = false;
              return;
            }
          }

          if (tpaIvrSoundsLikeEnglishRecordingDisclaimer(t)) {
            ivr.disclaimerEnDone = true;
            if (ivr.disclaimerEnAt == null) ivr.disclaimerEnAt = Date.now();
          }
          if (tpaIvrSoundsLikeSpanishRecordingDisclaimer(t)) {
            ivr.disclaimerEsDone = true;
          }

          // --- Part 2 handoff: after DOB, routing + survey prompts are silent; then live TPA intro ---
          if (ivr.dobDtmfSent) {
            if (tpaIvrSoundsLikePullUpAccountRouting(t)) {
              ivr.routingPullDone = true;
            }
            if (tpaIvrSoundsLikeAgentOnlineRouting(t)) {
              ivr.routingAgentOnlineDone = true;
            }
            if (tpaIvrSoundsLikeSurveyStayOnLine(t)) {
              ivr.surveyDone = true;
            }

            const handoffLive =
              tpaIvrSoundsLikeDentalTpaLiveIntro(t) ||
              (ivr.surveyDone && tpaIvrSoundsLikeLiveAgent(t));
            if (handoffLive) {
              const ttsHandoff = await this.handoffToEvaSession(
                state,
                speak,
                pushLiveTracker,
              );
              this.logCallTurn(state.callSid, {
                prepMs,
                sttMs,
                llmMs: null,
                ttsMs: ttsHandoff,
                totalMs: Date.now() - turnStart,
                tpa: t,
              eva: '—',
                note: '(TPA IVR Part 2 → EVA live agent)',
              });
              state.processing = false;
              return;
            }

            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs: 0,
              totalMs: Date.now() - turnStart,
              tpa: t || '—',
              eva: '—',
              note: `(TPA IVR Part 1 post-DOB — silent until live TPA) ${ivrDebugNote()}`,
            });
            state.processing = false;
            return;
          }

          if (!ivr.saidProviderYes && tpaIvrSoundsLikeProviderQuestion(t)) {
            spoke = 'Yes';
            ivr.saidProviderYes = true;
          } else if (
            ivr.saidProviderYes &&
            !ivr.saidEligibilityBenefits &&
            tpaIvrSoundsLikeReasonPrompt(t)
          ) {
            spoke = 'Eligibility Benefits';
            ivr.saidEligibilityBenefits = true;
          } else if (
            ivr.saidEligibilityBenefits &&
            !ivr.saidRepresentativeSummary &&
            tpaIvrSoundsLikeBenefitSummaryOrDetailPrompt(t)
          ) {
            spoke = 'Representative';
            ivr.saidRepresentativeSummary = true;
          } else if (
            ivr.saidRepresentativeSummary &&
            !ivr.memberDtmfSent &&
            tpaIvrSoundsLikeMemberIdPrompt(t) &&
            state.patientId
          ) {
            await ensurePatientCallContext();
            const mid =
              state.callContext?.memberId != null
                ? buildMemberIdDtmf(state.callContext.memberId)
                : buildMemberIdDtmf(process.env.EVA_MEMBER_ID);
            if ((mid.match(/\d/g) ?? []).length > 0) {
              const base = (process.env.BACKEND_URL || '').trim();
              if (base) {
                const q = new URLSearchParams({
                  digits: mid,
                  patientId: state.patientId,
                  payeeId: state.patientId,
                });
                if (state.appointmentId?.trim()) {
                  q.set('appointmentId', state.appointmentId.trim());
                }
                const url = `${base}/twilio/tpa-ivr-dtmf?${q.toString()}`;
                ivr.memberDtmfSent = true;
                redirected = true;
                this.twilioService
                  .redirectCall(state.callSid, url)
                  .catch((e: any) =>
                    this.logger.warn(
                      '[MediaStream] TPA IVR member DTMF redirect failed',
                      (e as Error)?.message,
                    ),
                  );
              }
            } else {
              this.logger.warn(
                '[MediaStream] TPA IVR: no member ID digits available (set EVA_MEMBER_ID or call context).',
              );
            }
          } else if (
            ivr.memberDtmfSent &&
            !ivr.dobDtmfSent &&
            tpaIvrSoundsLikeDobPrompt(t) &&
            state.patientId
          ) {
            await ensurePatientCallContext();
            const dob = state.callContext?.patient?.dob ?? null;
            const dtmf = buildDobDtmf(dob);
            if (dtmf) {
              const base = (process.env.BACKEND_URL || '').trim();
              if (base) {
                const q = new URLSearchParams({
                  digits: dtmf,
                  patientId: state.patientId,
                  payeeId: state.patientId,
                });
                if (state.appointmentId?.trim()) {
                  q.set('appointmentId', state.appointmentId.trim());
                }
                const url = `${base}/twilio/tpa-ivr-dtmf?${q.toString()}`;
                ivr.dobDtmfSent = true;
                redirected = true;
                this.twilioService
                  .redirectCall(state.callSid, url)
                  .catch((e: any) =>
                    this.logger.warn(
                      '[MediaStream] TPA IVR DOB DTMF redirect failed',
                      (e as Error)?.message,
                    ),
                  );
              }
            } else {
              this.logger.warn(
                '[MediaStream] TPA IVR: patient DOB missing — cannot send DOB DTMF.',
              );
            }
          }

          if (redirected) {
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs: 0,
              totalMs: Date.now() - turnStart,
              tpa: t,
              eva: '—',
              note: '(TPA IVR DTMF redirect)',
            });
            state.processing = false;
            return;
          }

          if (spoke) {
            const ttsMs = await speak(spoke, 'tpa_ivr').catch(() => 0);
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs,
              totalMs: Date.now() - turnStart,
              tpa: t,
              eva: spoke,
              note: '(TPA IVR Part 1)',
            });
            void pushLiveTracker(`EVA: ${spoke}`);
            state.processing = false;
            return;
          }

          this.logCallTurn(state.callSid, {
            prepMs,
            sttMs,
            llmMs: null,
            ttsMs: 0,
            totalMs: Date.now() - turnStart,
            tpa: t || '—',
            eva: '—',
            note: `(TPA IVR no scripted action) ${ivrDebugNote()}`,
          });
          state.processing = false;
          return;
        }

        // --- Lazy-load benefit fields / questions for this patient (once per call) ---
        await loadBenefitFieldOrderIfNeeded(state, {
          ensurePatientCallContext,
          verificationRequirementService: this.verificationRequirementService,
          warn: (message, detail) => this.logger.warn(message, detail),
        });

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
              state.patientId &&
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
                state.patientId &&
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
        // Any transcript that is ONLY a bracketed / parenthesised audio-event marker
        // (e.g. "[phone ringing]", "[clicking]", "[click]", "(background noise)") is NOT
        // a real TPA utterance — STT hallucinated it from room noise. Treat as silence.
        const bracketedNonSpeech =
          /^\[[^\]]{1,40}\]\s*\.?\s*$/.test(userSaid.trim()) ||
          /^\([^)]{1,40}\)\s*\.?\s*$/.test(userSaid.trim());
        const inaudibleLike =
          bracketedNonSpeech ||
          /^\[?inaudible\]?\.?$/i.test(userSaid) ||
          /^\.{2,}$/.test(userSaid) ||
          /^[\s\.\-]+$/.test(userSaid);
        const isIdleOrEmpty =
          userSaid.length === 0 ||
          (noiseOrTooShort && !looksLikeRealResponse(userSaid)) ||
          inaudibleLike;
        // When transcript is empty but we had very little audio, skip saying "repeat" to avoid cutting off the user (next chunk may have speech).
        // Also: when the transcript is ONLY a bracketed non-speech marker, silently skip — do
        // NOT re-ask the current field. Re-asking on every "[phone ringing]" is what made EVA
        // sound like she was interrupting / talking over the TPA.
        const skipRepeatForShortAudio =
          bracketedNonSpeech ||
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
        // Live TPA speaks first; EVA waits for a substantive opener (or a clear identity
        // question), then introduces herself — optionally with purpose and/or identity answer
        // in the same spoken turn when the TPA combined them.
        if (
          state.mode === 'eva' &&
          !state.openingGreetingPlayed &&
          !state.onHold &&
          !wasInaudibleTurn &&
          userSaid.trim().length > 0 &&
          !state.callEnded &&
          looksLikeRealResponse(userSaid)
        ) {
          const idAskFirst = detectIdentityAsk(userSaid);
          const idAnsFirst =
            idAskFirst && state.callContext
              ? answerIdentityFromContext(idAskFirst, state.callContext)
              : null;
          const openOk =
            isSubstantiveTpaOpener(userSaid) || !!idAnsFirst?.trim();
          if (openOk) {
            const alsoPurpose = userAsksPurposeOfCallOrOpening(userSaid);
            const parts: string[] = [EVA_INTRO_LINE];
            if (alsoPurpose) {
              parts.push(pickPurposeOfCallPhrase());
              state.purposeSaid = true;
            }
            if (idAnsFirst?.trim()) {
              parts.push(idAnsFirst.trim());
              const isNotOnFile = /\bI\s+do\s+not\s+have\b/i.test(idAnsFirst);
              if (!isNotOnFile) {
                state.identityAnswersGiven += 1;
                state.evaAwaitingYesAfterIdentity = true;
              }
            }
            const toSpeakFirst = parts.join(' ');
            if (userSaid?.trim())
              state.conversationTranscript.push('User: ' + userSaid.trim());
            state.conversationTranscript.push('EVA: ' + toSpeakFirst);
            const ttsMsIntro = await speak(toSpeakFirst, 'eva_intro_after_tpa');
            state.openingGreetingPlayed = true;
            state.consecutiveNoiseOrEmptyTurns = 0;
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs: ttsMsIntro,
              totalMs: Date.now() - turnStart,
              tpa: userSaid,
              eva: toSpeakFirst,
              note: '(EVA intro after live TPA opener)',
            });
            state.processing = false;
            startFallbackTimer();
            return;
          }
        }
        // Inaudible/empty: re-ask the same field only (no AI call) so conversation stays in phase.
        if (wasInaudibleTurn) {
          const quietMs =
            state.lastSpeakTime > 0 ? Date.now() - state.lastSpeakTime : 0;
          const awaitingBenefitTopicOrDobAck =
            state.evaAwaitingYesAfterDob ||
            (state.patientIdentityReadyForBenefits &&
              !state.tpaBenefitQnaOpen);
          if (
            state.mode === 'eva' &&
            awaitingBenefitTopicOrDobAck &&
            !state.postDobSilenceNudgePlayed &&
            state.lastSpeakTime > 0 &&
            quietMs >= POST_DOB_LONG_SILENCE_NUDGE_MS
          ) {
            state.postDobSilenceNudgePlayed = true;
            state.conversationTranscript.push('EVA: ' + EVA_POST_DOB_SILENCE_NUDGE);
            void pushLiveTracker(`EVA: ${EVA_POST_DOB_SILENCE_NUDGE}`);
            const ttsNudge = await speak(
              EVA_POST_DOB_SILENCE_NUDGE,
              'post_dob_long_silence_nudge',
            );
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs: null,
              ttsMs: ttsNudge,
              totalMs: Date.now() - turnStart,
              tpa: effectiveTranscript,
              eva: EVA_POST_DOB_SILENCE_NUDGE,
              note: `(post-DOB long silence ≥ ${POST_DOB_LONG_SILENCE_NUDGE_MS}ms)`,
            });
            state.consecutiveNoiseOrEmptyTurns = 0;
            state.processing = false;
            startFallbackTimer();
            return;
          }
          const repeatPhrase = getRepeatOnlyPrompt();
          const reaskSame = state.lastAskedField
            ? repeatPhrase + ' ' + qField(state.lastAskedField)
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

        // --------------------------------------------------------------------
        // Identity-phase progression (Phase 2 → Phase 3 transition tracking)
        // --------------------------------------------------------------------
        // 1) TPA confirms after ANY identity answer we gave (not just DOB):
        //    flip `patientIdentityReadyForBenefits` so EVA can start Phase 3.
        const tpaConfirmed =
          /^(yes|yeah|yep|correct|that'?s\s+right|right|ok|okay|alright|sure|thank\s+you|thanks|go\s+ahead|got\s+it)/i.test(
            userSaid.trim(),
          );
        if (
          (state.evaAwaitingYesAfterDob || state.evaAwaitingYesAfterIdentity) &&
          tpaConfirmed &&
          state.identityAnswersGiven >= 1
        ) {
          state.patientIdentityReadyForBenefits = true;
          state.evaAwaitingYesAfterDob = false;
          state.evaAwaitingYesAfterIdentity = false;
          state.postDobSilenceNudgePlayed = false;
        }

        if (isTpaBenefitQnaHandoff(userSaid)) {
          state.tpaBenefitQnaOpen = true;
          state.postDobSilenceNudgePlayed = true;
        } else if (
          state.patientIdentityReadyForBenefits &&
          !state.tpaBenefitQnaOpen &&
          /\b(what is|what's|what are|can you (tell me|provide|share)|give me)\b.*\b(coverage|deductible|copay|coinsurance|out[-\s]?of[-\s]?pocket|maximum|validity|effective date|annual maximum|benefit)\b/i.test(
            userSaid,
          )
        ) {
          state.tpaBenefitQnaOpen = true;
          state.postDobSilenceNudgePlayed = true;
        }

        const recallReply = getRecallReply(
          userSaid,
          state.extractedData,
          orderedF,
        );

        // Identity short-circuit: when the TPA asks a crisp verification question
        // (NPI / Tax ID / member ID / patient or subscriber name or DOB / provider name)
        // and we have the cached value, answer directly — skip the LLM entirely. This is
        // what keeps EVA fast AND prevents the LLM from drifting to "I am calling to verify..."
        const identityAsk = detectIdentityAsk(userSaid);
        const identityDirectReply =
          identityAsk && !recallReply
            ? answerIdentityFromContext(identityAsk, state.callContext)
            : null;

        let nextMessage = '';
        let extractedUpdates: Record<string, string | null> = {};
        let endCall = false;

        const skipLlmDueToNoise =
          !recallReply &&
          !identityDirectReply &&
          state.consecutiveNoiseOrEmptyTurns >= MAX_NOISE_TURNS_BEFORE_SKIP_LLM;

        let noiseSkipMessage = '';
        if (skipLlmDueToNoise) {
          const miss =
            state.lastAskedField ??
            getFirstMissingField(state.extractedData, orderedF) ??
            orderedF[0];
          noiseSkipMessage =
            "I'm having trouble hearing you clearly. " +
            qField(miss ?? 'coverage');
        }

        // Bare-acknowledgement short-circuit: purpose already stated and identity not yet
        // cleared, and the TPA just said "okay / alright / sure". Do NOT call the LLM; reply
        // with a tiny ack so EVA doesn't leak a benefit-field ask ahead of identity verification.
        const earlyAckAfterPurpose =
          state.purposeSaid &&
          !state.patientIdentityReadyForBenefits &&
          !identityAsk &&
          !recallReply &&
          isBareAcknowledgement(userSaid);

        if (identityDirectReply) {
          // Skip LLM — answer directly from the pre-loaded call context.
          nextMessage = identityDirectReply;
          extractedUpdates = {};
          endCall = false;
          // Only count it as a real identity answer if we actually had the value in the
          // cache (not the "I do not have that on my end" fallback).
          const isNotOnFile = /\bI\s+do\s+not\s+have\b/i.test(
            identityDirectReply,
          );
          if (!isNotOnFile) {
            state.identityAnswersGiven += 1;
            state.evaAwaitingYesAfterIdentity = true;
          }
        } else if (earlyAckAfterPurpose) {
          nextMessage = 'Of course.';
          extractedUpdates = {};
          endCall = false;
          llmMs = 0;
        } else if (!recallReply && !skipLlmDueToNoise) {
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
              tpaBenefitQnaOpen:
                state.tpaBenefitQnaOpen || state.patientInfo === null,
            },
            state.callContext,
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
        // After-hold safeguard: we were asking for lastAskedField; if user gave a value but AI put
        // it in the wrong field, assign to lastAskedField only — UNLESS the transcript is clearly
        // a different type than the expected field (e.g. expected=validity but TPA said "twenty-four
        // dollars"). In that case, we honour the LLM's routing into the matching money field and
        // leave validity to be asked again on the next turn.
        const expectedField = state.lastAskedField;
        const userIsMoney = transcriptIsMoney(userSaid);
        const userIsDate = transcriptIsDate(userSaid);
        const typeMismatch =
          (expectedField === 'validity' && userIsMoney) ||
          ((expectedField === 'copay' ||
            expectedField === 'deductible' ||
            expectedField === 'coverage') &&
            userIsDate);
        if (
          expectedField &&
          orderedF.includes(expectedField) &&
          !isIdleOrEmpty &&
          transcriptHasValue(userSaid) &&
          extractedUpdates &&
          Object.keys(extractedUpdates).length > 0 &&
          !typeMismatch
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

        // When there's a clear type mismatch (e.g. dollar amount given while we were asking for
        // validity), DROP any LLM extraction for the expected field — it will be junk like
        // {validity: "twenty-four dollars"} which slips past validation. Keep only the correctly
        // typed fields that the LLM may have routed elsewhere in the same response.
        if (
          typeMismatch &&
          expectedField &&
          extractedUpdates &&
          extractedUpdates[expectedField as keyof typeof extractedUpdates]
        ) {
          const cleaned: Record<string, string | null> = {
            ...extractedUpdates,
          };
          delete cleaned[expectedField as keyof typeof cleaned];
          extractedUpdates = cleaned;
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
        // Detect the TRANSITION: all fields are now collected and we have not yet
        // delivered the "That's all I have" intermediate line. This guarantees the
        // two-step closing regardless of whether the LLM noticed the transition.
        if (allCollected && !state.allDoneAnnounced) {
          state.justCompletedAllFields = true;
        }
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
        // NEVER end on the turn we just finished collecting — we want the explicit
        // "That's all I have" line FIRST, then wait for the TPA's thank-you / confirmation,
        // and only then play the final goodbye.
        if (
          shouldEndCall &&
          state.justCompletedAllFields &&
          !state.allDoneAnnounced
        ) {
          shouldEndCall = false;
        }
        // Inverse: we already said "That's all I have" on a previous turn, and now the
        // TPA responded with a courtesy ("thank you / welcome / have a good day / bye /
        // yes"). That is our cue to play the final goodbye even if the LLM didn't flip
        // endCall (models sometimes miss this).
        if (
          !shouldEndCall &&
          state.allDoneAnnounced &&
          allCollected &&
          userSaid &&
          /^(you'?re\s+welcome|welcome|thank\s+you|thanks|yes|yeah|yep|sure|ok|okay|alright|bye|goodbye|have\s+a\s+(good|great|wonderful|nice)\s+(day|one))/i.test(
            userSaid.trim(),
          )
        ) {
          shouldEndCall = true;
        }
        /** Closing when ending the call after user said thank you / yes / that's all. */
        const CLOSING_PHRASES = [
          "You're welcome. Have a wonderful day.",
          'You are welcome. Have a wonderful day.',
        ];
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
          toSpeak = qField('validity');
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
            ? qField(state.lastAskedField)
            : orderedF[0]
              ? qField(orderedF[0])
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
          // Identity question has highest priority — answer from cheat-sheet, skip all else.
          const idAskHere = detectIdentityAsk(userSaid);
          const idAnswerHere = idAskHere
            ? answerIdentityFromContext(idAskHere, state.callContext)
            : null;
          if (idAnswerHere) {
            toSpeak = idAnswerHere;
          } else if (
            userAsksPurposeOfCallOrOpening(userSaid) &&
            !state.purposeSaid
          ) {
            // Only say purpose the FIRST time they ask — after that, a short acknowledgement + move on.
            toSpeak = pickPurposeOfCallPhrase();
            state.purposeSaid = true;
          } else if (userAsksPurposeOfCallOrOpening(userSaid)) {
            // They asked purpose again — brief one-liner, no intro.
            toSpeak =
              'As I mentioned, we just need a few patient benefit details from your end.';
          } else if (
            /how are you|doing good|doing great/i.test(userSaid.trim())
          ) {
            if (!state.purposeSaid) {
              toSpeak = pickPurposeOfCallPhrase();
              state.purposeSaid = true;
            } else {
              // Social pleasantry mid-call — brief, non-purpose reply.
              toSpeak = "I'm doing well, thank you.";
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
                  toSpeak = "That's all I have. Thank you for your help.";
                  state.allDoneAnnounced = true;
                  state.justCompletedAllFields = false;
                  shouldEndCall = false;
                } else {
                  const ack = [
                    'Got it, thanks.',
                    'Thanks.',
                    'Okay, thank you.',
                    'Noted.',
                  ][Math.floor(Math.random() * 4)];
                  toSpeak = ack + ' ' + qField(state.lastAskedField);
                }
              }
            } else {
              toSpeak = qField(state.lastAskedField);
            }
          } else {
            const firstField = state.orderedFields.length
              ? state.orderedFields[0]
              : 'coverage';
            toSpeak = state.lastAskedField
              ? qField(state.lastAskedField)
              : qField(firstField);
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
          toSpeak = miss ? qField(miss) : getRepeatOnlyPrompt();
        } else if (
          toSpeak?.trim() &&
          !userAskedWhoIsCalling(userSaid) &&
          isIntroPurposePhrase(toSpeak)
        ) {
          // Mid-call LLM drift guard: the model produced a purpose/intro line.
          // Replace with the most useful concrete answer we can give right now —
          // prefer a direct identity answer if the TPA asked one, otherwise ask
          // for the next missing benefit field (or a neutral repeat as last resort).
          const identityFallback =
            identityAsk && state.callContext
              ? answerIdentityFromContext(identityAsk, state.callContext)
              : null;
          if (identityFallback) {
            toSpeak = identityFallback;
          } else if (state.purposeSaid) {
            const miss =
              state.lastAskedField ??
              getFirstMissingField(state.extractedData, orderedF) ??
              orderedF[0];
            toSpeak = miss ? qField(miss) : getRepeatOnlyPrompt();
          }
          // else: first time saying purpose — allowed to stand; purposeSaid will be set below.
        }
        if (toSpeak && isIntroPurposePhrase(toSpeak)) {
          state.purposeSaid = true;
        }

        // ---------------------------------------------------------------------------
        // GUARD: do not let EVA ask for ANY benefit field until identity is cleared AND
        // the TPA has opened benefit Q&A ("what do you want to know about the patient…").
        // ---------------------------------------------------------------------------
        const benefitCollectionGated =
          !state.patientIdentityReadyForBenefits || !state.tpaBenefitQnaOpen;
        if (
          state.purposeSaid &&
          benefitCollectionGated &&
          !state.allDoneAnnounced &&
          toSpeak &&
          isBenefitFieldAsk(toSpeak, orderedF, state.fieldQuestionByKey) &&
          !identityAsk &&
          !identityDirectReply
        ) {
          this.logger.warn(
            '[MediaStream] LLM asked benefit field before identity + benefit gate — correcting.',
          );
          state.lastAskedField = null;
          if (
            state.patientIdentityReadyForBenefits &&
            !state.tpaBenefitQnaOpen
          ) {
            const uLogSilent =
              userSaid &&
              userSaid !== 'User did not respond or was inaudible.' &&
              !/^\[?inaudible\]?\.?$/i.test(userSaid) &&
              !/^\.{2,}$/.test(userSaid)
                ? userSaid
                : null;
            if (uLogSilent)
              state.conversationTranscript.push('User: ' + uLogSilent);
            if (uLogSilent) void pushLiveTracker(`User: ${uLogSilent}`);
            this.logCallTurn(state.callSid, {
              prepMs,
              sttMs,
              llmMs,
              ttsMs: 0,
              totalMs: Date.now() - turnStart,
              tpa: userSaid,
              eva: '—',
              note: '(benefit gate: silent until TPA opens benefit Q&A)',
            });
            state.processing = false;
            startFallbackTimer();
            return;
          }
          toSpeak = isBareAcknowledgement(userSaid)
            ? 'Of course.'
            : 'Sure, please go ahead with your verification questions.';
        }

        // ---------------------------------------------------------------------------
        // FIELD-ORDER ENFORCEMENT
        // The LLM frequently drifts — it says "Can I get the deductible?" when the
        // actual next missing field is validity, or acknowledges ("Got it, thanks")
        // and silently skips a field we never captured. Source of truth is
        // `state.lastAskedField` (recomputed above from extractedData). If the LLM's
        // proposed line is asking for a different field than lastAskedField, rewrite
        // it so EVA always asks for the correct next missing field.
        // ---------------------------------------------------------------------------
        if (
          state.patientIdentityReadyForBenefits &&
          state.tpaBenefitQnaOpen &&
          !state.allDoneAnnounced &&
          !state.justCompletedAllFields &&
          !allCollected &&
          state.lastAskedField &&
          toSpeak &&
          isBenefitFieldAsk(toSpeak, orderedF, state.fieldQuestionByKey)
        ) {
          const expected = state.lastAskedField;
          const expectedSpaced = expected
            .replace(/([A-Z])/g, ' $1')
            .toLowerCase()
            .trim();
          const toSpeakLc = toSpeak.toLowerCase();
          const verbatimQ = state.fieldQuestionByKey[expected]?.trim();
          const verbatimLc = verbatimQ?.toLowerCase() ?? '';
          const alreadyAsksExpected =
            (verbatimLc && toSpeakLc === verbatimLc) ||
            (verbatimLc && toSpeakLc.includes(verbatimLc)) ||
            toSpeakLc.includes(expected.toLowerCase()) ||
            toSpeakLc.includes(expectedSpaced);
          if (!alreadyAsksExpected) {
            this.logger.warn(
              `[MediaStream] LLM asked wrong field (draft="${toSpeak}") — realigning to expected="${expected}".`,
            );
            // Keep any acknowledgement of the value we just received, then ask the right field.
            const ack =
              /^(got it|thanks|thank\s*you|okay|noted|alright|great)[.,!]?/i.test(
                toSpeak,
              )
                ? 'Thanks. '
                : '';
            toSpeak = ack + qField(expected);
          }
        }

        // TYPE-MISMATCH RETRY: we were asking for X but the TPA answered with a
        // clearly different type (e.g. dollars given for validity). The extraction
        // cleanup above already dropped the junk value; now make sure EVA's reply
        // re-asks the right field with a slightly clearer prompt instead of a bland
        // "Can I get the validity?" repeat.
        if (
          typeMismatch &&
          expectedField &&
          state.lastAskedField === expectedField &&
          !allCollected
        ) {
          if (expectedField === 'validity') {
            toSpeak =
              'Thanks, but for the validity I need a date — month and year work. Could you share that?';
          } else if (
            expectedField === 'copay' ||
            expectedField === 'deductible' ||
            expectedField === 'coverage'
          ) {
            const unit =
              expectedField === 'coverage' ? 'a percentage' : 'dollars';
            toSpeak = `Thanks, but for the ${expectedField.replace(
              /([A-Z])/g,
              ' $1',
            )} I need ${unit}. Could you share that?`;
          }
        }

        // ---------------------------------------------------------------------------
        // "That's all I have" INTERMEDIATE STEP
        // When we just completed the last benefit field this turn, override whatever
        // EVA was about to say with a short closing-summary line, wait for TPA's
        // thank-you / acknowledgement, then the next turn will play the final goodbye.
        // ---------------------------------------------------------------------------
        if (state.justCompletedAllFields && !state.allDoneAnnounced) {
          toSpeak = "That's all I have. Thank you for your help.";
          state.allDoneAnnounced = true;
          state.justCompletedAllFields = false;
          shouldEndCall = false;
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
            ? qField(state.lastAskedField)
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
            ? qField(state.lastAskedField)
            : getRepeatOnlyPrompt();
        } else {
          toSpeak = (toSpeak ?? '').trim();
        }
        if (
          state.patientInfo?.dobFormatted &&
          toSpeak.includes(state.patientInfo.dobFormatted)
        ) {
          state.evaAwaitingYesAfterDob = true;
          state.evaAwaitingYesAfterIdentity = true;
          state.postDobSilenceNudgePlayed = false;
        }
        // Generalised: any time EVA's reply just delivered a cached identity value,
        // expect the TPA's confirmation on the next turn. This lets the Phase 2 → Phase 3
        // transition fire after e.g. member ID confirmation, not just DOB.
        if (identityDirectReply && toSpeak === identityDirectReply) {
          const isNotOnFile = /\bI\s+do\s+not\s+have\b/i.test(
            identityDirectReply,
          );
          if (!isNotOnFile) state.evaAwaitingYesAfterIdentity = true;
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
          `start mode=${state.mode} patientId=${state.patientId ?? 'none'}`,
        );
        if (!state.mode || state.mode === 'eva' || state.mode === 'tpa-ivr') {
          // Resolve patientId from URL param or from call SID (stored when makeCall was used)
          if (state.callSid) {
            const ctx = this.twilioService.getStreamContextForCall(
              state.callSid,
            );
            if (ctx) {
              if (!state.patientId?.trim()) state.patientId = ctx.PatientID;
              if (!state.appointmentId?.trim() && ctx.AppointmentID) {
                state.appointmentId = ctx.AppointmentID;
              }
            }
          }
          void pushLiveTracker(
            `[CALL_EVENT] START callSid=${state.callSid ?? 'unknown'}`,
          );
        }
        startFallbackTimer();
        if (state.mode === 'tpa-ivr') {
          if (state.callSid) {
            this.ensureTpaIvrState(state.callSid);
          }
          void (async () => {
            if (!state.patientId?.trim()) return;
            const ctx = await this.verificationService
              .getPatientCallContext(state.patientId, state.appointmentId)
              .catch((e: any) => {
                this.logger.warn(
                  '[MediaStream] TPA IVR: failed to load call context',
                  e?.message,
                );
                return null;
              });
            if (ctx) {
              state.callContext = ctx;
              state.patientInfo = {
                firstName: ctx.patient.firstName,
                lastName: ctx.patient.lastName,
                fullName: ctx.patient.fullName,
                dobFormatted: ctx.patient.dobFormatted,
                ssn: ctx.patient.ssn,
              };
              applyVerificationStepsToStreamState(state, ctx);
              this.logger.log(
                `[MediaStream] TPA IVR context loaded: memberId=${ctx.memberId ? 'yes' : 'no'} dob=${ctx.patient.dob ? 'yes' : 'no'}`,
              );
            }
          })();
          return;
        }
        (async () => {
          try {
            let contextPromise: Promise<PatientCallContext | null> =
              Promise.resolve(null);
            if (state.patientId) {
              contextPromise = this.verificationService
                .getPatientCallContext(state.patientId, state.appointmentId)
                .catch((e: any) => {
                  this.logger.warn(
                    '[MediaStream] Failed to load call context',
                    e?.message,
                  );
                  return null;
                });
            }

            const ctx = await contextPromise;
            if (ctx) {
              state.callContext = ctx;
              state.patientInfo = {
                firstName: ctx.patient.firstName,
                lastName: ctx.patient.lastName,
                fullName: ctx.patient.fullName,
                dobFormatted: ctx.patient.dobFormatted,
                ssn: ctx.patient.ssn,
              };
              applyVerificationStepsToStreamState(state, ctx);
              this.logger.log(
                `[MediaStream] Call context loaded: patient=${ctx.patient.fullName} provider=${ctx.provider?.fullName ?? 'none'} payer=${ctx.payer?.companyName ?? 'none'} memberId=${ctx.memberId ? 'yes' : 'no'} taxId=${ctx.provider?.taxId ? 'yes' : 'no'}`,
              );
            } else if (state.patientId) {
              state.patientInfo = null;
              state.callContext = null;
              this.logger.warn(
                '[MediaStream] Patient not found for patientId=' +
                  state.patientId +
                  ' — patient details will be unavailable on this call.',
              );
            }
            if (!state.patientInfo && !state.patientId) {
              state.patientInfo = STATIC_PATIENT_INFO;
              state.callContext = STATIC_CALL_CONTEXT;
              applyVerificationStepsToStreamState(
                state,
                STATIC_CALL_CONTEXT,
              );
              this.logger.warn(
                '[MediaStream] Using static patient info (no patientId on stream). Pass patientId (or payeeId) in the stream URL to use real patient details from the database.',
              );
            }
            this.logCallEvent(
              state.callSid,
              'EVA stream started — listening for live TPA before intro',
            );
          } catch (e) {
            this.logger.warn(
              '[MediaStream] Start context load failed',
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
          state.patientId &&
          finalFields.some(
            (f) =>
              state.extractedData[f] != null &&
              String(state.extractedData[f]).trim(),
          )
        ) {
          pushToVerificationService();
        } else if (!state.patientId) {
          this.logger.warn(
            '[MediaStream] Call stopped but patientId missing — verification NOT saved. Use ?patientId=... or ?payeeId=... in stream URL.',
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
      const intervalMs = streamModeUsesIvrTiming(state.mode)
        ? TPA_IVR_STREAM_FALLBACK_MS
        : FALLBACK_PROCESS_INTERVAL_MS;
      const minBytes = streamModeUsesIvrTiming(state.mode)
        ? TPA_IVR_STREAM_MIN_BYTES
        : MIN_SPEECH_BYTES;
      state.fallbackTimer = setInterval(() => {
        const combined = Buffer.concat(state.buffer);
        if (combined.length < minBytes) return;
        const now = Date.now();
        if (
          !streamModeUsesIvrTiming(state.mode) &&
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

  private ensureTpaIvrState(callSid: string | null): TpaIvrRuntimeState {
    const fresh = (): TpaIvrRuntimeState => ({
      callStartedAt: Date.now(),
      ivrStarted: false,
      disclaimerEnDone: false,
      disclaimerEsDone: false,
      disclaimerEnAt: null,
      saidProviderYes: false,
      saidEligibilityBenefits: false,
      saidRepresentativeSummary: false,
      memberDtmfSent: false,
      dobDtmfSent: false,
      routingPullDone: false,
      routingAgentOnlineDone: false,
      surveyDone: false,
    });
    const sid = callSid?.trim();
    if (!sid) {
      return fresh();
    }
    let s = this.tpaIvrByCallSid.get(sid);
    if (!s) {
      s = fresh();
      this.tpaIvrByCallSid.set(sid, s);
    }
    return s;
  }

  /** Built-in IVR phase finished — begin normal EVA verification conversation. */
  private async handoffToEvaSession(
    state: StreamState,
    speak: (text: string, label?: string) => Promise<number>,
    pushLiveTracker: (line: string) => void | Promise<void>,
  ): Promise<number> {
    if (state.callSid) {
      this.tpaIvrByCallSid.delete(state.callSid);
    }
    state.mode = 'eva';
    const sourceLabel = 'TPA_IVR';
    void pushLiveTracker(
      `[CALL_EVENT] ${sourceLabel}_LIVE_AGENT — EVA listening (deferred intro)`,
    );
    this.logCallEvent(
      state.callSid,
      `${sourceLabel} handoff: live agent detected; EVA waits for TPA opener`,
    );

    let contextPromise: Promise<PatientCallContext | null> =
      Promise.resolve(null);
    if (state.patientId) {
      contextPromise = state.callContext
        ? Promise.resolve(state.callContext)
        : this.verificationService
            .getPatientCallContext(state.patientId, state.appointmentId)
            .catch((e: any) => {
              this.logger.warn(
                `[MediaStream] Failed to load call context after ${sourceLabel}`,
                e?.message,
              );
              return null;
            });
    }

    state.openingGreetingPlayed = false;

    const ctx = await contextPromise;
    if (ctx) {
      state.callContext = ctx;
      state.patientInfo = {
        firstName: ctx.patient.firstName,
        lastName: ctx.patient.lastName,
        fullName: ctx.patient.fullName,
        dobFormatted: ctx.patient.dobFormatted,
        ssn: ctx.patient.ssn,
      };
      applyVerificationStepsToStreamState(state, ctx);
      this.logger.log(
        `[MediaStream] Call context loaded after ${sourceLabel}: patient=${ctx.patient.fullName}`,
      );
    } else if (state.patientId) {
      state.patientInfo = null;
      state.callContext = null;
      this.logger.warn(
        `[MediaStream] Patient context missing after ${sourceLabel} — patient details may be unavailable.`,
      );
    }

    if (!state.patientInfo && !state.patientId) {
      state.patientInfo = STATIC_PATIENT_INFO;
      state.callContext = STATIC_CALL_CONTEXT;
      applyVerificationStepsToStreamState(state, STATIC_CALL_CONTEXT);
      this.logger.warn(
        `[MediaStream] Using static patient info (no patientId after ${sourceLabel}).`,
      );
    }

    return 0;
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
