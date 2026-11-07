// AES-256-GCM for connection credentials: pure, so it is tested without an env or a database.
// vault.ts holds the key ring from the env and is the only caller.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { credentialSchema, type Credential } from "./contracts";

/** The encryption keys by version; new secrets use `current`. */
export type Keyring = {
  current: number;
  keys: ReadonlyMap<number, Buffer>;
};

/** A credential as stored: base64 `iv` and `ciphertext` (with the GCM tag at its end). */
export type SealedSecret = { keyVersion: number; iv: string; ciphertext: string };

const TAG_LENGTH = 16;

/** `"2:<base64>,1:<base64>"`, the newest first, each key 32 bytes. Throws on anything else. */
export function parseKeyring(value: string): Keyring {
  const keys = new Map<number, Buffer>();
  for (const entry of value.split(",")) {
    const [version, encoded] = entry.split(":");
    const key = Buffer.from(encoded ?? "", "base64");
    if (!/^\d+$/.test(version ?? "") || key.length !== 32)
      throw new Error("INTEGRATION_KEYS has an entry that is not <version>:<32-byte base64 key>");
    if (keys.has(Number(version)))
      throw new Error(`INTEGRATION_KEYS has version ${version} twice`);
    keys.set(Number(version), key);
  }
  return { current: [...keys.keys()][0]!, keys };
}

/**
 * Encrypts a credential under the current key. `binding` is authenticated, not stored: the
 * connection and user it belongs to, so a ciphertext copied to another row does not decrypt.
 */
export function seal(
  keyring: Keyring,
  credential: Credential,
  binding: string,
): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyring.keys.get(keyring.current)!, iv);
  cipher.setAAD(Buffer.from(binding, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    keyVersion: keyring.current,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/** Decrypts a sealed credential. Throws when the key is gone, the binding differs or it was changed. */
export function unseal(
  keyring: Keyring,
  { keyVersion, iv, ciphertext }: SealedSecret,
  binding: string,
): Credential {
  const key = keyring.keys.get(keyVersion);
  if (!key) throw new Error(`no key with version ${keyVersion} in INTEGRATION_KEYS`);
  const sealed = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(binding, "utf8"));
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_LENGTH));
  const plaintext = Buffer.concat([
    decipher.update(sealed.subarray(0, sealed.length - TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
  return credentialSchema.parse(JSON.parse(plaintext));
}
