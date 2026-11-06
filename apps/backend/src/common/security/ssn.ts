import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const raw = process.env.SSN_ENCRYPTION_KEY?.trim();
  if (raw) {
    const asBase64 = Buffer.from(raw, 'base64');
    if (asBase64.length === 32) return asBase64;
    const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
    if (asHex?.length === 32) return asHex;
    return createHash('sha256').update(raw).digest();
  }
  throw new Error('SSN_ENCRYPTION_KEY is required to store or read an SSN');
}

/** Encrypt a patient SSN for storage. Legacy plaintext is encrypted on write. */
export function encryptSsn(value: string | null | undefined): string | null {
  if (value == null) return null;
  const plain = String(value).trim();
  if (!plain) return null;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

export function decryptSsn(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const value = String(stored).trim();
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64url');
  if (buf.length < 12 + 16) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function ssnLastFour(stored: string | null | undefined): string | null {
  const plain = decryptSsn(stored);
  if (!plain) return null;
  const digits = plain.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** Value safe to return from an API. Never the full SSN. */
export function maskSsn(stored: string | null | undefined): string | null {
  const last4 = ssnLastFour(stored);
  return last4 ? `***-**-${last4}` : null;
}

export function presentPayee<T extends Record<string, unknown>>(payee: T | null | undefined): T | null {
  if (!payee) return payee ?? null;
  const masked = maskSsn(
    typeof payee.ssn === 'string' || payee.ssn == null ? (payee.ssn as string | null) : null,
  );
  return { ...payee, ssn: masked };
}

/** Patient SSN field names used by Sabrina documents. Tax IDs are left as-is. */
export function isSsnFieldName(key: string): boolean {
  const compact = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (
    compact === 'ssn' ||
    compact === 'patientssn' ||
    compact === 'socialsecurity' ||
    compact === 'socialsecuritynumber'
  );
}

function isTraversable(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Date || Buffer.isBuffer(value)) return false;
  if ((value as { _bsontype?: string })._bsontype) return false;
  return true;
}

/**
 * Encrypt plaintext SSN fields in place and return the dotted paths to persist.
 * Values that already use the enc:v1 prefix are left unchanged.
 */
export function applySsnEncryption(value: unknown): Record<string, string> {
  const updates: Record<string, string> = {};
  const visit = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, path ? `${path}.${index}` : String(index)));
      return;
    }
    if (!isTraversable(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const next = path ? `${path}.${key}` : key;
      if (
        isSsnFieldName(key) &&
        (typeof child === 'string' || typeof child === 'number')
      ) {
        const plain = String(child).trim();
        if (plain && !plain.startsWith(PREFIX)) {
          const encrypted = encryptSsn(plain);
          if (encrypted) {
            node[key] = encrypted;
            updates[next] = encrypted;
          }
        }
      } else {
        visit(child, next);
      }
    }
  };
  visit(value, '');
  return updates;
}

/** Clone a Sabrina payload and encrypt SSN fields before it is written. */
export function encryptSsnFields<T>(value: T): T {
  const clone = structuredClone(value);
  applySsnEncryption(clone);
  return clone;
}

export function documentHasSsn(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => documentHasSsn(item));
  if (!isTraversable(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (isSsnFieldName(key)) {
      if (typeof child === 'string' || typeof child === 'number') {
        if (String(child).trim()) return true;
      }
    } else if (documentHasSsn(child)) {
      return true;
    }
  }
  return false;
}

/** First stored SSN value, encrypted or legacy plaintext, for last-four disclosure. */
export function firstSsnValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstSsnValue(item);
      if (found) return found;
    }
    return null;
  }
  if (!isTraversable(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (
      isSsnFieldName(key) &&
      (typeof child === 'string' || typeof child === 'number') &&
      String(child).trim()
    ) {
      return String(child);
    }
  }
  for (const child of Object.values(value)) {
    const found = firstSsnValue(child);
    if (found) return found;
  }
  return null;
}

/** Drop SSN fields so ciphertext is not sent to the browser. */
export function redactSsnFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSsnFields(item)) as T;
  if (!isTraversable(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSsnFieldName(key)) continue;
    out[key] = redactSsnFields(child);
  }
  return out as T;
}
