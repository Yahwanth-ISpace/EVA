/** Row from GET /appointments/:id/bot-trackers (or legacy /bot-trackers APIs) */
export type BotTrackerRecord = {
  id: string;
  payeeId: string;
  appointmentId?: string | null;
  callLog?: unknown;
  createdAt: string;
  /** Legacy field if API still returns old shape */
  transcript?: string;
};

/** Normalize JSON or string call log for display / START–END detection. */
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

/**
 * Call is "live" if the latest START/END pair is unclosed (START after last END).
 * Trackers are typically returned newest-first; we sort by time ascending.
 */
/** Latest open CallSid from START/END markers in tracker lines (for dashboard end-call). */
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
