/** Format a timestamp from the API (e.g. Mongo `savedAt`) for table display. */
export function formatSavedAtDisplay(raw: string | undefined | null): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Date only (no time) — e.g. admin appointments table. */
export function formatSavedAtDateOnly(raw: string | undefined | null): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function savedAtToMillis(raw: string | undefined | null): number {
  if (!raw?.trim()) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}
