export function loggedOutAuthState() {
  return {
    loading: false,
    error: null as string | null,
    user: null,
    token: null as string | null,
    isAuthenticated: false,
    role: null,
  };
}

let authRedirectStarted = false;

export function isJwtExpired(token: string | null | undefined): boolean {
  if (!token) return true;

  try {
    const segment = token.split(".")[1];
    if (!segment) return true;

    const payload = JSON.parse(
      atob(segment.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { exp?: number };

    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function clearAuthStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("role");
}

export function hasValidSession(
  user: unknown,
  token: string | null | undefined
): boolean {
  return Boolean(user && token && !isJwtExpired(token));
}

function redirectOnce(path: string) {
  clearAuthStorage();
  if (authRedirectStarted || window.location.pathname === path) return;
  authRedirectStarted = true;
  window.location.replace(path);
}

/** Drop stored credentials and load the login page once. */
export function redirectToLogin() {
  redirectOnce("/login");
}

/** Drop stored credentials and show the session-expired page once. */
export function redirectToSessionExpired() {
  redirectOnce("/session-expired");
}

export function isPublicAuthRequest(url: string) {
  return url.includes("/auth/login") || url.includes("/auth/register");
}

