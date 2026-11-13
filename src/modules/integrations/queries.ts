import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { User } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { connectionsTable } from "@/lib/db/schema";
import type { Connection, ProviderChoice } from "./contracts";
import { providers } from "./providers";
import { sampleConnection } from "./providers/sample";

/** The columns a `Connection` is read from; never the secret, which is in another table. */
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

export const toConnection = (row: Omit<Connection, "builtIn">): Connection => ({
  ...row,
  builtIn: false,
});

/** The user's connections: the sample first, then the stored ones in the order they were made. */
export async function listConnections(user: User): Promise<Connection[]> {
  const rows = await db()
    .select(connectionColumns)
    .from(connectionsTable)
    .where(eq(connectionsTable.userId, user.id))
    .orderBy(asc(connectionsTable.createdAt));
  return [sampleConnection, ...rows.map(toConnection)];
}

/** One of the user's stored connections; none for another user's or a missing one. */
export async function findStoredConnection(
  user: User,
  connectionId: string,
): Promise<Connection | undefined> {
  const [row] = await db()
    .select(connectionColumns)
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.userId, user.id),
        eq(connectionsTable.id, connectionId),
      ),
    );
  return row && toConnection(row);
}

/**
 * Marks a connection whose credential the provider refused while reading, once: an active one
 * becomes `needs_reconnect`, and the user connects again. The one write outside the actions,
 * because a read is what finds out.
 */
export async function markNeedsReconnect(user: User, connectionId: string) {
  await db()
    .update(connectionsTable)
    .set({ status: "needs_reconnect", updatedAt: new Date() })
    .where(
      and(
        eq(connectionsTable.userId, user.id),
        eq(connectionsTable.id, connectionId),
        eq(connectionsTable.status, "active"),
      ),
    );
}

/** Every provider, as the browser sees it: no code. Shared data, no user. */
export async function listProviderChoices(): Promise<ProviderChoice[]> {
  return providers.map(({ id, name, description, auth, baseUrl, records }) => ({
    id,
    name,
    description,
    auth,
    ...(baseUrl ? { baseUrl } : {}),
    ...(records ? { records: { types: records.types, filters: records.filters, hint: records.hint } } : {}),
  }));
}
