import { createHmac, timingSafeEqual } from 'crypto';

export type StreamClaims = {
  patientId: string;
  appointmentId?: string;
  mode?: string;
  exp: number;
};

function signingSecret(): string | null {
  const secret = (
    process.env.STREAM_SIGNING_SECRET ||
    process.env.TWILIO_AUTH_TOKEN ||
    ''
  ).trim();
  return secret || null;
}

export function streamAuthEnforced(): boolean {
  if (signingSecret()) return true;
  return process.env.NODE_ENV === 'production';
}

export function signStreamToken(input: {
  patientId: string;
  appointmentId?: string;
  mode?: string;
}): string | null {
  const secret = signingSecret();
  if (!secret || !input.patientId?.trim()) return null;
  const claims: StreamClaims = {
    patientId: input.patientId.trim(),
    appointmentId: input.appointmentId?.trim() || undefined,
    mode: input.mode?.trim() || undefined,
    exp: Date.now() + 4 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyStreamToken(token: string | null | undefined): StreamClaims | null {
  const secret = signingSecret();
  if (!secret || !token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StreamClaims;
    if (!claims?.patientId || typeof claims.exp !== 'number' || Date.now() > claims.exp) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
