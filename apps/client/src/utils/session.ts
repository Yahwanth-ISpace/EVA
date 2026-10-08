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

let loginRedirectStarted = false;

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

/** Drop stored credentials and load the login page once. */
export function redirectToLogin() {
  clearAuthStorage();
  if (loginRedirectStarted || window.location.pathname === "/login") return;
  loginRedirectStarted = true;
  window.location.replace("/login");
}

export function isPublicAuthRequest(url: string) {
  return url.includes("/auth/login") || url.includes("/auth/register");
}

