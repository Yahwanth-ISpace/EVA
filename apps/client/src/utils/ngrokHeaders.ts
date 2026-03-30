/**
 * ngrok free tier serves an HTML warning page (ERR_NGROK_6024) unless the client
 * sends this header. See https://ngrok.com/docs/errors/err_ngrok_6024
 */
export const NGROK_SKIP_BROWSER_WARNING = "ngrok-skip-browser-warning";

export function withNgrokBypass(
  apiBaseUrl: string | undefined,
  headers: Record<string, string>,
): Record<string, string> {
  const base = (apiBaseUrl ?? "").toLowerCase();
  if (!base.includes("ngrok")) return headers;
  return { ...headers, [NGROK_SKIP_BROWSER_WARNING]: "true" };
}
