import { api } from "./api";

/**
 * Credentials are encrypted in the browser before they leave it, on top of TLS.
 * A one-time AES-256-GCM key seals the JSON body and is wrapped with the
 * server's RSA-OAEP-256 public key. `ts` and `nonce` let the server reject
 * stale or replayed envelopes.
 */
export interface CredentialEnvelope {
  kid: string;
  key: string;
  iv: string;
  data: string;
}

interface PublicKeyResponse {
  kid: string;
  alg: string;
  key: string;
}

let cachedKey: Promise<{ kid: string; key: CryptoKey }> | null = null;

const toBase64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

function serverKey() {
  cachedKey ??= api
    .get<PublicKeyResponse>("/auth/credential-key", undefined, {
      redirectOn401: false,
    })
    .then(async (res) => {
      if (res.alg !== "RSA-OAEP-256+A256GCM" || !res.key || !res.kid) {
        throw new Error("Unsupported credential encryption key");
      }
      const key = await crypto.subtle.importKey(
        "spki",
        fromBase64(res.key),
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );
      return { kid: res.kid, key };
    })
    .catch((err) => {
      cachedKey = null;
      throw err;
    });
  return cachedKey;
}

export function forgetCredentialKey() {
  cachedKey = null;
}

export async function encryptCredentials(
  payload: Record<string, unknown>,
): Promise<CredentialEnvelope> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure connection required to sign in");
  }
  const { kid, key: rsaKey } = await serverKey();
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(
    JSON.stringify({
      ...payload,
      ts: Date.now(),
      nonce: toBase64(crypto.getRandomValues(new Uint8Array(24))),
    }),
  );
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, body);
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawAes);
  return {
    kid,
    key: toBase64(wrapped),
    iv: toBase64(iv),
    data: toBase64(sealed),
  };
}

const STALE_KEY_HINT = "Credential encryption key changed";

/** Send encrypted credentials; refetch the server key once if it rotated. */
export async function postEncrypted<T>(
  url: string,
  payload: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const send = async () =>
    api.post<T>(
      url,
      { credentials: await encryptCredentials(payload), ...extra },
      undefined,
      { redirectOn401: false },
    );
  try {
    return await send();
  } catch (err) {
    if (err instanceof Error && err.message.includes(STALE_KEY_HINT)) {
      forgetCredentialKey();
      return send();
    }
    throw err;
  }
}
