/**
 * TPA / IVR phrase matching and DTMF builders for scripted navigation.
 */

/** Member ID for keypad: digits only; optional `TPA_IVR_MEMBER_SUFFIX` (e.g. `#`). */
export function buildMemberIdDtmf(memberId: string | null | undefined): string {
  const digits = (memberId || '').replace(/\D/g, '');
  const suffix = (process.env.TPA_IVR_MEMBER_SUFFIX || '').trim();
  return digits + suffix;
}

/** DOB as MMDDYYYY for US payer keypads. Optional `TPA_IVR_DOB_SUFFIX`. */
export function buildDobDtmf(dob: Date | null | undefined): string | null {
  if (!dob || !Number.isFinite(dob.getTime())) return null;
  const m = dob.getMonth() + 1;
  const day = dob.getDate();
  const y = dob.getFullYear();
  const core = `${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}${y}`;
  const suffix = (process.env.TPA_IVR_DOB_SUFFIX || '').trim();
  return core + suffix;
}

/** First IVR audio (menus, recording notice, language choice). */
export function tpaIvrSoundsLikeIvrStart(t: string): boolean {
  const s = t.toLowerCase();
  if (s.length < 12) return false;
  return (
    /this call (may be|will be|is being) (recorded|monitored)/.test(s) ||
    /recorded (or|and) monitored|quality assurance|training purposes/.test(s) ||
    /for english|for spanish|para español|presione|press\s*[12]/.test(s) ||
    /welcome to|thank you for calling/.test(s)
  );
}

export function tpaIvrSoundsLikeEnglishRecordingDisclaimer(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /this call (may be|will be|is) (recorded|monitored)/.test(s) ||
    /recorded for quality|monitor(ed)? or record(ed)?|training and quality/.test(
      s,
    )
  );
}

export function tpaIvrSoundsLikeSpanishRecordingDisclaimer(t: string): boolean {
  const s = t.toLowerCase();
  return (
    (/español|espanol|ser[aá]\s+grabad|esta llamada|grabaci[oó]n/.test(s) &&
      /(llamada|ser[aá]|grabad|calidad)/.test(s)) ||
    /esta llamada.*grab/.test(s)
  );
}

export function tpaIvrSoundsLikeBenefitSummaryOrDetailPrompt(t: string): boolean {
  const s = t.toLowerCase();
  if (s.length < 20) return false;
  return (
    /brief\s+benefits?\s+summary|detail\s+facts?|benefits?\s+summary\s+or\s+detail/.test(
      s,
    ) ||
    (/would you like\b/.test(s) &&
      /brief/.test(s) &&
      (/detail|summary/.test(s) || /representative/.test(s)))
  );
}

export function tpaIvrSoundsLikePullUpAccountRouting(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /thank you.*one moment.*pull\s+up|pull\s+up (the|your) account|while i pull up (the|your) account/.test(
      s,
    ) || /one moment.*pull up/.test(s)
  );
}

export function tpaIvrSoundsLikeAgentOnlineRouting(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /one moment.*get.*agent|get the agent online|agent online to help|connect you to (a\s+)?(live\s+)?agent/.test(
      s,
    ) || /representative will be with you/.test(s)
  );
}

export function tpaIvrSoundsLikeSurveyStayOnLine(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /survey/.test(s) &&
    (/stay on the line|your experience is important|rate your experience|take the survey/.test(
      s,
    ) ||
      /wait on the call.*survey/.test(s))
  );
}

/** Part 2 handoff: live TPA intro (e.g. “calling Dental …, my name is …, how can I help you today”). */
export function tpaIvrSoundsLikeDentalTpaLiveIntro(t: string): boolean {
  const s = t.toLowerCase();
  if (s.length < 25) return false;
  const dental =
    /calling\s+(dental|the dental)/.test(s) ||
    /\bdental\s+(clinic|office|plan|clawn|lawn)\b/.test(s);
  const named =
    /\bmy name is\b/.test(s) ||
    /\bthis is\b.{0,30}\b(from|with)\b/.test(s) ||
    /\b(i am|i'm)\b.{0,20}\b(from|with)\b/.test(s);
  const offersHelp = /how can i help you( today)?\??/i.test(s);
  return dental && named && offersHelp;
}

export function tpaIvrSoundsLikeProviderQuestion(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /health care provider|healthcare provider/.test(s) &&
    /are you|calling from|provider/.test(s)
  );
}

export function tpaIvrSoundsLikeReasonPrompt(t: string): boolean {
  const s = t.toLowerCase();
  if (s.length < 10) return false;
  if (tpaIvrSoundsLikeBenefitSummaryOrDetailPrompt(t)) return false;
  return (
    /what can i help you( with)?( today)?\?*/.test(s) ||
    /what can i do for you( today)?\?*/.test(s) ||
    /how can i help you( today)?\?*/.test(s) ||
    /how may i (direct|assist|help) you( today)?\?*/.test(s)
  );
}

export function tpaIvrSoundsLikeMemberIdPrompt(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /member\s*(id|i\.?\s*d\.?|number|#)|subscriber\s*(id|number)|identification number|enter.*(your\s*)?(id|member)/.test(
      s,
    ) && !/date of birth|dob|birthday/.test(s)
  );
}

export function tpaIvrSoundsLikeDobPrompt(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /date of birth|birth\s*date|enter.*dob|your birthday|month.*day.*year/.test(
      s,
    ) && !/member\s*id/.test(s)
  );
}

export function tpaIvrSoundsLikeLiveAgent(t: string): boolean {
  const s = t.trim();
  if (s.length < 10 || s.length > 500) return false;
  if (tpaIvrSoundsLikeDentalTpaLiveIntro(s)) return true;
  if (
    /for english|for spanish|press \d|say or press|enter your \d|this call may be recorded/i.test(
      s,
    )
  ) {
    return false;
  }
  const selfIntro =
    (/\b(hi|hello|good (morning|afternoon|evening))\b/i.test(s) &&
      /\b(i'?m|my name is|this is|speaking)\b/i.test(s)) ||
    /\b(this is)\b.{0,40}\b(from|with)\b/i.test(s) ||
    /\bmy name is\b/i.test(s);
  const holdReturnWithAssist =
    /\b(thank you for holding|thanks for holding|appreciate your patience)\b/i.test(
      s,
    ) && /\b(how can i help|how may i help|how can i assist)\b/i.test(s);
  return selfIntro || holdReturnWithAssist;
}