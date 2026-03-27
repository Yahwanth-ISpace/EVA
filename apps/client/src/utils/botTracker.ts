export interface BotTrackerRecord {
  id: string;
  payeeId: string;
  transcript: string;
  createdAt: string;
}

function hasCallEventPrefix(line: string, event: 'START' | 'END'): boolean {
  return line.includes(`[CALL_EVENT] ${event}`);
}

export function isCallActiveFromTrackers(trackers: BotTrackerRecord[]): boolean {
  if (!trackers.length) return false;
  const ordered = [...trackers].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let active = false;
  for (const item of ordered) {
    const t = String(item.transcript || '');
    if (hasCallEventPrefix(t, 'START')) active = true;
    if (hasCallEventPrefix(t, 'END')) active = false;
  }
  return active;
}

