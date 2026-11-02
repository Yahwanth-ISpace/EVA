let csrfToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function csrfHeaders(): Record<string, string> {
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

function apiBase() {
  return import.meta.env.VITE_BACKEND_URL || "";
}

async function refreshOnce(): Promise<boolean> {
  const base = apiBase();
  const csrfRes = await fetch(`${base}/auth/csrf`, { credentials: "include" });
  if (csrfRes.ok) {
    const body = (await csrfRes.json().catch(() => ({}))) as {
      csrfToken?: string | null;
    };
    if (body.csrfToken) setCsrfToken(body.csrfToken);
  }
  if (!csrfToken) return false;

  const res = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: "{}",
  });
  if (!res.ok) return false;
  const data = (await res.json().catch(() => ({}))) as { csrfToken?: string };
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  return true;
}

export function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshOnce().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
