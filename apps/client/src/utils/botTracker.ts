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
  | { kind: "message"; role: LiveLogMessageRole; text: string }
  | { kind: "divider" };

export function parseTranscriptIntoTurns(fullText: string): TranscriptTurn[] {
  if (!fullText?.trim()) return [];
  const rawLines = fullText.split(/\r?\n/);
  const out: TranscriptTurn[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^---+\s*$/.test(trimmed)) {
      out.push({ kind: "divider" });
      continue;
    }

    const speaker = trimmed.match(/^\s*(EVA|User)\s*:\s*(.*)$/i);
    if (speaker) {
      const isEva = speaker[1].toLowerCase() === "eva";
      out.push({
        kind: "message",
        role: isEva ? "eva" : "tpa",
        text: (speaker[2] ?? "").trim() || "—",
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
