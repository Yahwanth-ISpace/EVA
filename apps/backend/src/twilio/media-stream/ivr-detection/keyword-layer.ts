import {
  DEFAULT_IVR_KEYWORD_RULES,
  type IvrKeywordRule,
} from './ivr-detection.config';
import type { IvrKeywordLayerResult } from './ivr-detection.types';
import {
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
} from '../tpa-ivr';

function applyRules(
  transcript: string,
  rules: IvrKeywordRule[],
  acc: IvrKeywordLayerResult,
): void {
  const t = transcript.trim();
  if (!t) return;
  for (const rule of rules) {
    if (rule.pattern.test(t)) {
      if (rule.kind === 'ivr') {
        acc.ivrDelta += rule.weight;
        acc.reasons.push(`keyword:${rule.id}(+${rule.weight} ivr)`);
      } else {
        acc.humanDelta += rule.weight;
        acc.reasons.push(`keyword:${rule.id}(+${rule.weight} human)`);
      }
    }
  }
}

/** Layer 1 — configurable regex rules + known payer IVR path phrase matchers. */
export function evaluateKeywordLayer(transcript: string): IvrKeywordLayerResult {
  const result: IvrKeywordLayerResult = {
    ivrDelta: 0,
    humanDelta: 0,
    reasons: [],
  };
  applyRules(transcript, DEFAULT_IVR_KEYWORD_RULES, result);

  const t = transcript.trim();
  if (!t) return result;

  if (tpaIvrSoundsLikeIvrStart(t)) {
    result.ivrDelta += 20;
    result.reasons.push('tpa-ivr:ivrStart(+20 ivr)');
  }
  if (
    tpaIvrSoundsLikeEnglishRecordingDisclaimer(t) ||
    tpaIvrSoundsLikeSpanishRecordingDisclaimer(t)
  ) {
    result.ivrDelta += 12;
    result.reasons.push('tpa-ivr:disclaimer(+12 ivr)');
  }
  if (tpaIvrSoundsLikeProviderQuestion(t)) {
    result.ivrDelta += 16;
    result.reasons.push('tpa-ivr:providerQuestion(+16 ivr)');
  }
  if (tpaIvrSoundsLikeReasonPrompt(t)) {
    result.ivrDelta += 14;
    result.reasons.push('tpa-ivr:reasonPrompt(+14 ivr)');
  }
  if (tpaIvrSoundsLikeBenefitSummaryOrDetailPrompt(t)) {
    result.ivrDelta += 14;
    result.reasons.push('tpa-ivr:benefitSummaryPrompt(+14 ivr)');
  }
  if (tpaIvrSoundsLikeMemberIdPrompt(t) || tpaIvrSoundsLikeDobPrompt(t)) {
    result.ivrDelta += 18;
    result.reasons.push('tpa-ivr:idOrDobPrompt(+18 ivr)');
  }
  if (tpaIvrSoundsLikePullUpAccountRouting(t)) {
    result.ivrDelta += 10;
    result.reasons.push('tpa-ivr:pullUpAccount(+10 ivr)');
  }
  if (tpaIvrSoundsLikeAgentOnlineRouting(t)) {
    result.ivrDelta += 10;
    result.reasons.push('tpa-ivr:agentOnlineRouting(+10 ivr)');
  }
  if (tpaIvrSoundsLikeSurveyStayOnLine(t)) {
    result.ivrDelta += 12;
    result.reasons.push('tpa-ivr:survey(+12 ivr)');
  }
  if (tpaIvrSoundsLikeDentalTpaLiveIntro(t)) {
    result.humanDelta += 45;
    result.reasons.push('tpa-ivr:dentalLiveIntro(+45 human)');
  } else if (tpaIvrSoundsLikeLiveAgent(t)) {
    result.humanDelta += 32;
    result.reasons.push('tpa-ivr:liveAgent(+32 human)');
  }

  return result;
}
