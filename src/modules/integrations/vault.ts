// The only reader and writer of `connection_secrets` (ESLint: no other file imports the table).
// A credential is decrypted here, per request, and leaves only as an `Authorization` header value
// (access.ts); it never reaches the browser, the prompt or the logs.
import "server-only";
import { and, eq } from "drizzle-orm";
import type { UserId } from "@/lib/auth/user";
import { db, type withTransaction } from "@/lib/db/client";
import { connectionSecretsTable } from "@/lib/db/schema";
import { parseKeyring, seal, unseal, type Keyring } from "./cipher";
import type { Credential } from "./contracts";

type Transaction = Parameters<Parameters<typeof withTransaction>[1]>[0];

let keyring: Keyring | undefined;
/**
 * The key ring from INTEGRATION_KEYS, read on first use: lib/env.ts parses every setting on
 * import, and modules that only import this file (through records.ts) must load without them.
 */
async function keys() {
  keyring ??= parseKeyring((await import("@/lib/env")).env.INTEGRATION_KEYS);
  return keyring;
}

/** What the ciphertext is bound to: a copy in another row or for another user does not decrypt. */
const bindingOf = (userId: UserId, connectionId: string) =>
  `${connectionId}:${userId}`;

/** Stores a connection's credential, encrypted under the current key; replaces the one before. */
export async function writeSecret(
  tx: Transaction,
  userId: UserId,
  connectionId: string,
  credential: Credential,
) {
  const sealed = seal(await keys(), credential, bindingOf(userId, connectionId));
  await tx
    .insert(connectionSecretsTable)
    .values({ connectionId, userId, ...sealed })
    .onConflictDoUpdate({
      target: connectionSecretsTable.connectionId,
      set: { ...sealed, updatedAt: new Date() },
    });
}

/** The connection's credential, decrypted; none for a connection that is not the user's. */
export async function readCredential(
  userId: UserId,
  connectionId: string,
): Promise<Credential | undefined> {
  const [row] = await db()
    .select({
      keyVersion: connectionSecretsTable.keyVersion,
      iv: connectionSecretsTable.iv,
      ciphertext: connectionSecretsTable.ciphertext,
    })
    .from(connectionSecretsTable)
    .where(
      and(
        eq(connectionSecretsTable.userId, userId),
        eq(connectionSecretsTable.connectionId, connectionId),
      ),
    );
  return row && unseal(await keys(), row, bindingOf(userId, connectionId));
}
