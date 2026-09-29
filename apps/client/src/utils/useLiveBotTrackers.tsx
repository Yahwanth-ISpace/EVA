import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { ActiveLiveCall } from "./appointmentRecord";
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
export type LiveBotTrackersResult = {
  records: BotTrackerRecord[];
  /** False after the first fetch attempt for the current payeeId completes. */
  initialLoading: boolean;
};

export function useLiveBotTrackers(
  payeeId: string | undefined,
  options?: { activeIntervalMs?: number; idleIntervalMs?: number },
): LiveBotTrackersResult {
  const [records, setRecords] = useState<BotTrackerRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(() => Boolean(payeeId));
  const activeMs = options?.activeIntervalMs ?? DEFAULT_ACTIVE_MS;
  const idleMs = options?.idleIntervalMs ?? DEFAULT_IDLE_MS;

  useEffect(() => {
    if (!payeeId) {
      setRecords([]);
      setInitialLoading(false);
      return;
    }

    setInitialLoading(true);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstFetch = true;

    const schedule = (delayMs: number, fn: () => void) => {
      timer = setTimeout(fn, delayMs);
    };

    const finishInitialLoad = () => {
      if (!firstFetch) return;
      firstFetch = false;
      setInitialLoading(false);
    };

    const tick = async () => {
      try {
        const data = await api.get<BotTrackerRecord[]>(
          `/bot-trackers/payee/${payeeId}`,
        );
        if (cancelled) return;
        setRecords(data);
        finishInitialLoad();
        const delay = isCallActiveFromTrackers(data) ? activeMs : idleMs;
        schedule(delay, tick);
      } catch {
        if (cancelled) return;
        setRecords([]);
        finishInitialLoad();
        schedule(idleMs, tick);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [payeeId, activeMs, idleMs]);

  return { records, initialLoading };
}

/** Polls bot-tracker lines for many payees (e.g. dashboard list). */
export type LiveBotTrackersByPayeeResult = {
  byPayee: Record<string, BotTrackerRecord[]>;
  /** False after the first fetch attempt for the current payee id set completes. */
  initialLoading: boolean;
};

export function useLiveBotTrackersByPayeeIds(
  payeeIds: string[],
  options?: { activeIntervalMs?: number; idleIntervalMs?: number },
): LiveBotTrackersByPayeeResult {
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
  const [initialLoading, setInitialLoading] = useState(() => ids.length > 0);
  const activeMs = options?.activeIntervalMs ?? DEFAULT_ACTIVE_MS;
  const idleMs = options?.idleIntervalMs ?? DEFAULT_IDLE_MS;

  useEffect(() => {
    if (!ids.length) {
      setByPayee({});
      setInitialLoading(false);
      return;
    }

    setInitialLoading(true);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstFetch = true;

    const schedule = (delayMs: number, fn: () => void) => {
      timer = setTimeout(fn, delayMs);
    };

    const finishInitialLoad = () => {
      if (!firstFetch) return;
      firstFetch = false;
      setInitialLoading(false);
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
        finishInitialLoad();
        const delay = anyCallActive(next) ? activeMs : idleMs;
        schedule(delay, tick);
      } catch {
        if (cancelled) return;
        finishInitialLoad();
        schedule(idleMs, tick);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ids, activeMs, idleMs]);

  return { byPayee, initialLoading };
}

/** In-memory active EVA calls from the media-stream handler (authoritative for per-appointment live state). */
export type ActiveLiveCallsResult = {
  calls: ActiveLiveCall[];
  /** False after the first poll attempt completes. */
  initialLoading: boolean;
};

export function useActiveLiveCalls(
  pollMs = 2000,
): ActiveLiveCallsResult {
  const [calls, setCalls] = useState<ActiveLiveCall[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstFetch = true;

    const finishInitialLoad = () => {
      if (!firstFetch) return;
      firstFetch = false;
      setInitialLoading(false);
    };

    const tick = async () => {
      try {
        const data = await api.get<ActiveLiveCall[]>("/twilio/active-calls");
        if (!cancelled) setCalls(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setCalls([]);
      }
      if (!cancelled) finishInitialLoad();
      if (!cancelled) timer = setTimeout(tick, pollMs);
    };

    setInitialLoading(true);
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollMs]);

  return { calls, initialLoading };
}
