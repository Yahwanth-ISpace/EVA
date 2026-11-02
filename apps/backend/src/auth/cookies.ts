import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'eva_access';
export const REFRESH_COOKIE = 'eva_refresh';
export const CSRF_COOKIE = 'eva_csrf';

export const ACCESS_MS = 15 * 60 * 1000;
export const REFRESH_MS = 12 * 60 * 60 * 1000;
export const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieSameSite(): 'lax' | 'strict' | 'none' {
  const raw = process.env.COOKIE_SAMESITE?.toLowerCase();
  if (raw === 'none' || raw === 'strict' || raw === 'lax') return raw;
  return 'lax';
}

export function csrfHeaderRequired(): boolean {
  return cookieSameSite() === 'none';
}

function baseOptions(maxAge: number, httpOnly: boolean): CookieOptions {
  const sameSite = cookieSameSite();
  const secure =
    sameSite === 'none' ||
    process.env.COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
  return { httpOnly, secure, sameSite, maxAge, path: '/' };
}

export function setAuthCookies(
  res: Response,
  access: string,
  refresh: string,
  csrf: string,
  remember: boolean,
) {
  const refreshMs = remember ? REMEMBER_MS : REFRESH_MS;
  res.cookie(ACCESS_COOKIE, access, baseOptions(ACCESS_MS, true));
  res.cookie(REFRESH_COOKIE, refresh, { ...baseOptions(refreshMs, true), path: '/auth' });
  res.cookie(CSRF_COOKIE, csrf, baseOptions(refreshMs, false));
}

export function setCsrfCookie(res: Response, csrf: string) {
  res.cookie(CSRF_COOKIE, csrf, baseOptions(REMEMBER_MS, false));
}

export function clearAuthCookies(res: Response) {
  const expired = baseOptions(0, true);
  res.clearCookie(ACCESS_COOKIE, { ...expired, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...expired, path: '/auth' });
  res.clearCookie(CSRF_COOKIE, { ...baseOptions(0, false), path: '/' });
}
