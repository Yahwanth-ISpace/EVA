/** Row from GET /bot-trackers/payee/:payeeId */
export type BotTrackerRecord = {
  id: string;
  payeeId: string;
  callLog?: unknown;
  createdAt: string;
  transcript?: string;
};

export function formatCallLogLine(record: BotTrackerRecord): string {
  const raw = record.callLog ?? record.transcript;
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

export type LiveLogMessageRole = "eva" | "tpa" | "system";

/** Backend bot-tracker lines: `[TPA_EMOTION] angry|happy|normal` */
export type TpaEmotionTone = "angry" | "happy" | "normal";

export function parseTpaEmotionLine(line: string): TpaEmotionTone | null {
  const m = line.trim().match(/^\[TPA_EMOTION\]\s+(angry|happy|normal)\s*$/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (v === "angry" || v === "happy" || v === "normal") return v;
  return null;
}

/** One row for the live call-activity chat (merges tone line + following User line). */
export type LiveActivityChatRow = {
  id: string;
  role: LiveLogMessageRole;
  text: string;
  createdAt: string;
  /** Present when this TPA utterance had a successful ER classification */
  tpaTone?: TpaEmotionTone;
};

export function buildLiveActivityChatRows(
  chronological: BotTrackerRecord[],
): LiveActivityChatRow[] {
  const out: LiveActivityChatRow[] = [];
  for (let i = 0; i < chronological.length; i++) {
    const log = chronological[i]!;
    const raw = formatCallLogLine(log);
    const tone = parseTpaEmotionLine(raw);
    if (tone != null) {
      const next = chronological[i + 1];
      if (next) {
        const nparsed = parseLiveLogMessage(formatCallLogLine(next));
        if (nparsed.role === "tpa") {
          out.push({
            id: next.id,
            role: "tpa",
            text: nparsed.text,
            createdAt: next.createdAt,
            tpaTone: tone,
          });
          i++;
          continue;
        }
      }
      out.push({
        id: log.id,
        role: "system",
        text:
          tone === "angry"
            ? "TPA tone: Angry"
            : tone === "happy"
              ? "TPA tone: Happy"
              : "TPA tone: Normal",
        createdAt: log.createdAt,
      });
      continue;
    }
    const { role, text } = parseLiveLogMessage(raw);
    out.push({
      id: log.id,
      role,
      text,
      createdAt: log.createdAt,
    });
  }
  return out;
}

export function parseLiveLogMessage(rawLine: string): {
  role: LiveLogMessageRole;
  text: string;
} {
  const line = rawLine.trim();
  if (line.startsWith("EVA:")) {
    return { role: "eva", text: line.slice(4).trim() };
  }
  if (line.startsWith("User:")) {
    return { role: "tpa", text: line.slice(5).trim() };
  }
  return { role: "system", text: line };
}

export function formatLiveLogTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export type TranscriptTurn =
  | {
      kind: "message";
      role: LiveLogMessageRole;
      text: string;
      /** Set when a `[TPA_EMOTION]` line preceded this User turn in the saved log */
      tpaTone?: TpaEmotionTone;
    }
  | { kind: "divider" };

export function parseTranscriptIntoTurns(fullText: string): TranscriptTurn[] {
  if (!fullText?.trim()) return [];
  const rawLines = fullText.split(/\r?\n/);
  const out: TranscriptTurn[] = [];
  let pendingTpaTone: TpaEmotionTone | undefined;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const emo = parseTpaEmotionLine(trimmed);
    if (emo != null) {
      pendingTpaTone = emo;
      continue;
    }

    if (/^---+\s*$/.test(trimmed)) {
      pendingTpaTone = undefined;
      out.push({ kind: "divider" });
      continue;
    }

    const speaker = trimmed.match(/^\s*(EVA|User)\s*:\s*(.*)$/i);
    if (speaker) {
      const isEva = speaker[1].toLowerCase() === "eva";
      const role = isEva ? "eva" : "tpa";
      const tone = role === "tpa" ? pendingTpaTone : undefined;
      if (role === "tpa") pendingTpaTone = undefined;
      out.push({
        kind: "message",
        role,
        text: (speaker[2] ?? "").trim() || "—",
        tpaTone: tone,
      });
      continue;
    }

    const last = out[out.length - 1];
    if (
      last?.kind === "message" &&
      (last.role === "eva" || last.role === "tpa")
    ) {
      last.text = `${last.text}\n${trimmed}`.trim();
      continue;
    }

    pendingTpaTone = undefined;
    out.push({ kind: "message", role: "system", text: trimmed });
  }

  return out;
}

export function extractActiveCallSidFromTrackers(
  trackers: BotTrackerRecord[],
): string | null {
  const chron = [...trackers].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let openSid: string | null = null;
  for (const t of chron) {
    const line = formatCallLogLine(t);
    if (line.includes("[CALL_EVENT] START")) {
      const m = line.match(/callSid=([^\s]+)/);
      const sid = m?.[1]?.trim();
      openSid = sid && sid !== "unknown" ? sid : null;
    } else if (line.includes("[CALL_EVENT] END")) {
      openSid = null;
    }
  }
  return openSid;
}

export function isCallActiveFromTrackers(
  trackers: BotTrackerRecord[],
): boolean {
  if (!trackers.length) return false;
  const chron = [...trackers].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let open = false;
  for (const t of chron) {
    const line = formatCallLogLine(t);
    if (line.includes("[CALL_EVENT] START")) open = true;
    else if (line.includes("[CALL_EVENT] END")) open = false;
  }
  return open;
}

/**
 * True if any `[TPA_EMOTION] angry` appears after the latest `[CALL_EVENT] START`
 * (full payee log; not UI-sliced). Still true after `[CALL_EVENT] END` until a newer START.
 */
export function hasTpaAngrySinceLatestCallStart(
  chronological: BotTrackerRecord[],
): boolean {
  let lastStart = -1;
  for (let i = 0; i < chronological.length; i++) {
    const line = formatCallLogLine(chronological[i]!);
    if (line.includes("[CALL_EVENT] START")) lastStart = i;
  }
  if (lastStart < 0) return false;
  for (let j = lastStart; j < chronological.length; j++) {
    if (parseTpaEmotionLine(formatCallLogLine(chronological[j]!)) === "angry")
      return true;
  }
  return false;
}
