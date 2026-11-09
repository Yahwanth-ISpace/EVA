import {
  constants,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  privateDecrypt,
  sign,
} from 'crypto';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MongoService } from '../mongo/mongo.service';

export const CREDENTIAL_ALGORITHM = 'RSA-OAEP-256+A256GCM';

/** Encrypted envelopes older than this are rejected. */
const MAX_AGE_MS = 2 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30 * 1000;

export type CredentialEnvelope = {
  kid: string;
  key: string;
  iv: string;
  data: string;
};

/** Thrown when the client used a public key this server no longer holds. */
export const STALE_KEY_MESSAGE = 'Credential encryption key changed. Retry the request.';

function loadPrivateKey(raw: string): KeyObject {
  const value = raw.trim();
  if (value.includes('-----BEGIN')) {
    return createPrivateKey(value.replace(/\\n/g, '\n'));
  }
  const decoded = Buffer.from(value, 'base64');
  const asText = decoded.toString('utf8');
  if (asText.includes('-----BEGIN')) return createPrivateKey(asText);
  return createPrivateKey({ key: decoded, format: 'der', type: 'pkcs8' });
}

@Injectable()
export class CredentialEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private privateKey!: KeyObject;
  private publicSpki!: string;
  private keyId!: string;
  private indexesReady?: Promise<void>;

  constructor(private readonly mongo: MongoService) {}

  onModuleInit() {
    const configured = process.env.LOGIN_RSA_PRIVATE_KEY?.trim();
    if (configured) {
      this.privateKey = loadPrivateKey(configured);
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('LOGIN_RSA_PRIVATE_KEY is required in production');
      }
      this.logger.warn(
        'LOGIN_RSA_PRIVATE_KEY is not set. Using a per-process key; set it when running more than one instance.',
      );
      this.privateKey = generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey;
    }
    const details = this.privateKey.asymmetricKeyDetails;
    if (this.privateKey.asymmetricKeyType !== 'rsa' || (details?.modulusLength ?? 0) < 2048) {
      throw new Error('LOGIN_RSA_PRIVATE_KEY must be an RSA key of at least 2048 bits');
    }
    const spki = createPublicKey(this.privateKey).export({ format: 'der', type: 'spki' });
    this.publicSpki = spki.toString('base64');
    this.keyId = createHash('sha256').update(spki).digest('hex').slice(0, 16);
  }

  publicKey() {
    return { kid: this.keyId, alg: CREDENTIAL_ALGORITHM, key: this.publicSpki };
  }

  /**
   * Signs a profile the browser can check with the public key from
   * `GET /auth/credential-key`. Editing the role after the response leaves
   * the server breaks this signature.
   */
  signProfile(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = sign('sha256', Buffer.from(body, 'utf8'), this.privateKey).toString('base64url');
    return `${body}.${signature}`;
  }

  /** Decrypt an envelope, reject stale or replayed ones, and return the inner JSON object. */
  async decrypt(envelope: CredentialEnvelope): Promise<Record<string, unknown>> {
    if (envelope.kid !== this.keyId) {
      throw new BadRequestException({ message: STALE_KEY_MESSAGE, code: 'CREDENTIAL_KEY_STALE' });
    }
    let payload: Record<string, unknown>;
    try {
      const aesKey = privateDecrypt(
        {
          key: this.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(envelope.key, 'base64'),
      );
      const iv = Buffer.from(envelope.iv, 'base64');
      const sealed = Buffer.from(envelope.data, 'base64');
      if (aesKey.length !== 32 || iv.length !== 12 || sealed.length <= 16) throw new Error('shape');
      const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAuthTag(sealed.subarray(sealed.length - 16));
      const plain = Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - 16)),
        decipher.final(),
      ]).toString('utf8');
      payload = JSON.parse(plain) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid encrypted credentials');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Invalid encrypted credentials');
    }
    const { ts, nonce, ...rest } = payload;
    const age = Date.now() - Number(ts);
    if (!Number.isFinite(age) || age > MAX_AGE_MS || age < -MAX_CLOCK_SKEW_MS) {
      throw new BadRequestException('Encrypted credentials expired');
    }
    if (typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 64) {
      throw new BadRequestException('Invalid encrypted credentials');
    }
    await this.consumeNonce(nonce);
    return rest;
  }

  private async nonceCollection() {
    const db = await this.mongo.getDb();
    const col = db.collection<{ nonce: string; expiresAt: Date }>('credential_nonces');
    this.indexesReady ??= Promise.all([
      col.createIndex({ nonce: 1 }, { unique: true }),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ])
      .then(() => undefined)
      .catch((err) => {
        this.indexesReady = undefined;
        throw err;
      });
    await this.indexesReady;
    return col;
  }

  private async consumeNonce(nonce: string) {
    const col = await this.nonceCollection();
    try {
      await col.insertOne({
        nonce,
        expiresAt: new Date(Date.now() + MAX_AGE_MS + MAX_CLOCK_SKEW_MS),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException('Encrypted credentials already used');
      }
      throw err;
    }
  }
}
