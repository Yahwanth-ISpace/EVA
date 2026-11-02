import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE, csrfHeaderRequired } from './cookies';
import { secretsEqual } from '../common/security/timing-safe';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * When cookies are cross-site (SameSite=None), mutating requests that carry a
 * session cookie must echo the CSRF token. Same-site Lax cookies are not sent
 * on cross-site POSTs, so the header is not required in that mode.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!csrfHeaderRequired() || SAFE.has(req.method.toUpperCase())) {
    next();
    return;
  }
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const hasSession = Boolean(cookies?.eva_access || cookies?.eva_refresh);
  if (!hasSession) {
    next();
    return;
  }
  const header = req.get('x-csrf-token') ?? '';
  const cookie = cookies?.[CSRF_COOKIE] ?? '';
  if (!header || !cookie || !secretsEqual(header, cookie)) {
    res.status(403).json({ message: 'CSRF check failed' });
    return;
  }
  next();
}
