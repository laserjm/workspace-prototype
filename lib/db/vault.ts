// The only reader and writer of `connection_secrets`. A secret is encrypted here, under the key
// ring from INTEGRATION_KEYS, and bound to its connection and user, so a copy in another row or
// for another user does not decrypt. The integrations module parses what it stored.
import "server-only";
import { and, eq } from "drizzle-orm";
import { vaultEnv } from "../env";
import { parseKeyring, seal, unseal, type Keyring } from "./cipher";
import { db, type Transaction } from "./client";
import { connectionSecretsTable } from "./schema";

let keyring: Keyring | undefined;
/** The key ring, read on first use. */
function keys() {
  keyring ??= parseKeyring(vaultEnv().INTEGRATION_KEYS);
  return keyring;
}

const bindingOf = (userId: string, connectionId: string) => `${connectionId}:${userId}`;

/** Stores a connection's secret, encrypted under the current key; replaces the one before. */
export async function writeSecret(
  tx: Transaction,
  userId: string,
  connectionId: string,
  value: unknown,
) {
  const sealed = seal(keys(), value, bindingOf(userId, connectionId));
  await tx
    .insert(connectionSecretsTable)
    .values({ connectionId, userId, ...sealed })
    .onConflictDoUpdate({
      target: connectionSecretsTable.connectionId,
      set: sealed,
    });
}

/** The connection's secret, decrypted; none for a connection that is not the user's. */
export async function readSecret(userId: string, connectionId: string): Promise<unknown> {
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
  return row && unseal(keys(), row, bindingOf(userId, connectionId));
}
