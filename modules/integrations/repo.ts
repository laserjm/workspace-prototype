import "server-only";
// The stored connections, shared by the reads and the writes: the ownership check, the
// reconnect mark and what a provider's code is handed for one request.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { connectionsTable } from "@/lib/db/schema";
import { readSecret } from "@/lib/db/vault";
import {
  credentialSchema,
  type ConnectionListItem,
  type ConnectionToolContext,
  type Credential,
  type RecordReadRefusal,
} from "./contracts";
import { authorizationOf, type Answer, type ConnectionAccess } from "./provider";

/** The columns a `ConnectionListItem` is read from; never the secret, which is in another table. */
export const connectionColumns = {
  id: connectionsTable.id,
  providerId: connectionsTable.providerId,
  accountLabel: connectionsTable.accountLabel,
  status: connectionsTable.status,
  baseUrl: connectionsTable.baseUrl,
  scopes: connectionsTable.scopes,
  expiresAt: connectionsTable.expiresAt,
  lastVerifiedAt: connectionsTable.lastVerifiedAt,
};

/** One of the requester's connections; null for a missing, foreign or malformed id. */
export async function findOwnedConnection(
  requester: User,
  connectionId: string,
): Promise<ConnectionListItem | null> {
  const id = z.uuid().safeParse(connectionId);
  if (!id.success) return null;
  const [row] = await db()
    .select(connectionColumns)
    .from(connectionsTable)
    .where(and(eq(connectionsTable.userId, requester.id), eq(connectionsTable.id, id.data)));
  return row ?? null;
}

/** The connection's credential, from the vault; none when it is missing. */
export async function readCredential(
  requester: User,
  connectionId: string,
): Promise<Credential | undefined> {
  const secret = await readSecret(requester.id, connectionId);
  return secret === undefined ? undefined : credentialSchema.parse(secret);
}

/**
 * What a connection's provider code is given for one request: the API address and the
 * `Authorization` header value, from the vault. None when the stored credential is missing.
 */
export async function accessFor(
  requester: User,
  connection: ConnectionListItem,
): Promise<ConnectionAccess | undefined> {
  const credential = await readCredential(requester, connection.id);
  return (
    credential && {
      connectionId: connection.id,
      baseUrl: connection.baseUrl,
      authorization: authorizationOf(credential),
    }
  );
}

/**
 * Marks a connection whose credential the provider refused, once: an active one becomes
 * `needs_reconnect`, and the user connects again. A read is what finds out, so reads call it.
 */
export async function markNeedsReconnect(requester: User, connectionId: string) {
  await db()
    .update(connectionsTable)
    .set({ status: "needs_reconnect" })
    .where(
      and(
        eq(connectionsTable.userId, requester.id),
        eq(connectionsTable.id, connectionId),
        eq(connectionsTable.status, "active"),
      ),
    );
}

/**
 * Runs `read` with the access of one of the requester's connections of `providerId`, answering a
 * refusal as data. A `connectionId` outside the allowed ones is `no_access`, whatever the model
 * asks, and nothing is read; one that is gone, or of another provider, is `not_found`. A
 * credential the provider refuses marks the connection `needs_reconnect`.
 */
export async function readWithConnection<T>(
  { user, connectionIds }: ConnectionToolContext,
  connectionId: string,
  providerId: string,
  read: (access: ConnectionAccess) => Promise<Answer<T, RecordReadRefusal>>,
): Promise<T | { error: RecordReadRefusal }> {
  if (!user || !connectionIds.includes(connectionId)) return { error: { kind: "no_access" } };
  const connection = await findOwnedConnection(user, connectionId);
  const access =
    connection?.providerId === providerId ? await accessFor(user, connection) : undefined;
  if (!access) return { error: { kind: "not_found" } };
  const answer = await read(access);
  if (answer.ok) return answer.value;
  if (answer.error.kind === "needs_reconnect") await markNeedsReconnect(user, connectionId);
  return { error: answer.error };
}
