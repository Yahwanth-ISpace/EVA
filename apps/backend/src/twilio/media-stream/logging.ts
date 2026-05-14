/** Collapse whitespace and cap length for log lines. */
export function truncateForLogLine(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t.length) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}
