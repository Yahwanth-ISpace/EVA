import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  isCallActiveFromTrackers,
  type BotTrackerRecord,
} from "./botTracker";

const DEFAULT_ACTIVE_MS = 2000;
const DEFAULT_IDLE_MS = 8000;

function anyCallActive(map: Record<string, BotTrackerRecord[]>): boolean {
  return Object.values(map).some((rows) => isCallActiveFromTrackers(rows));
}

/**
 * Polls bot-tracker lines for a payee. Polls faster while a verification call is active.
 */
export function useLiveBotTrackers(
  payeeId: string | undefined,
  options?: { activeIntervalMs?: number; idleIntervalMs?: number },
): BotTrackerRecord[] {
  const [records, setRecords] = useState<BotTrackerRecord[]>([]);
  const activeMs = options?.activeIntervalMs ?? DEFAULT_ACTIVE_MS;
  const idleMs = options?.idleIntervalMs ?? DEFAULT_IDLE_MS;

  useEffect(() => {
    if (!payeeId) {
      setRecords([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number, fn: () => void) => {
      timer = setTimeout(fn, delayMs);
    };

    const tick = async () => {
      try {
        const data = await api.get<BotTrackerRecord[]>(
          `/bot-trackers/payee/${payeeId}`,
        );
        if (cancelled) return;
        setRecords(data);
        const delay = isCallActiveFromTrackers(data) ? activeMs : idleMs;
        schedule(delay, tick);
      } catch {
        if (cancelled) return;
        setRecords([]);
        schedule(idleMs, tick);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [payeeId, activeMs, idleMs]);

  return records;
}

/** Polls bot-tracker lines for many payees (e.g. dashboard list). */
export function useLiveBotTrackersByPayeeIds(
  payeeIds: string[],
  options?: { activeIntervalMs?: number; idleIntervalMs?: number },
): Record<string, BotTrackerRecord[]> {
  const sortedKey = useMemo(
    () => [...payeeIds].filter(Boolean).sort().join("\0"),
    [payeeIds],
  );
  const ids = useMemo(
    () => (sortedKey ? sortedKey.split("\0") : []),
    [sortedKey],
  );

  const [byPayee, setByPayee] = useState<Record<string, BotTrackerRecord[]>>(
    {},
  );
  const activeMs = options?.activeIntervalMs ?? DEFAULT_ACTIVE_MS;
  const idleMs = options?.idleIntervalMs ?? DEFAULT_IDLE_MS;

  useEffect(() => {
    if (!ids.length) {
      setByPayee({});
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number, fn: () => void) => {
      timer = setTimeout(fn, delayMs);
    };

    const tick = async () => {
      try {
        const pairs = await Promise.all(
          ids.map(async (payeeId) => {
            const logs = await api.get<BotTrackerRecord[]>(
              `/bot-trackers/payee/${payeeId}`,
            );
            return [payeeId, logs] as const;
          }),
        );
        if (cancelled) return;
        const next: Record<string, BotTrackerRecord[]> = {};
        for (const [payeeId, logs] of pairs) next[payeeId] = logs;
        setByPayee(next);
        const delay = anyCallActive(next) ? activeMs : idleMs;
        schedule(delay, tick);
      } catch {
        if (cancelled) return;
        schedule(idleMs, tick);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ids, activeMs, idleMs]);

  return byPayee;
}
