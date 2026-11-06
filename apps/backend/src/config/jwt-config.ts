import type { Algorithm } from 'jsonwebtoken';

export const JWT_ALGORITHM: Algorithm = 'HS256';
export const JWT_ISSUER = 'eva-backend';
export const JWT_AUDIENCE = 'eva-client';

/** HS256 needs at least 256 bits of key material. */
const MIN_SECRET_BYTES = 32;

const KNOWN_WEAK = new Set([
  'secret',
  'changeme',
  'change-me',
  'jwt_secret',
  'jwtsecret',
  'your_jwt_secret',
  'your-secret-key',
  'supersecret',
  'password',
]);

function distinctChars(value: string): number {
  return new Set(value).size;
}

/**
 * Returns the JWT signing secret or throws when it is missing or too weak to
 * resist offline brute force. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() ?? '';
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }
  const bytes = Buffer.byteLength(secret, 'utf8');
  if (
    bytes < MIN_SECRET_BYTES * 2 ||
    KNOWN_WEAK.has(secret.toLowerCase()) ||
    distinctChars(secret) < 16
  ) {
    throw new Error(
      'JWT_SECRET is too weak. Use at least 64 random characters, e.g. ' +
        `node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"`,
    );
  }
  return secret;
}
