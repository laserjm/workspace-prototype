"use server";
// Connecting, testing and disconnecting. `action` signs the caller in and validates the input;
// each handler names the user's id in every query (ARCHITECTURE.md, "Data ownership"). A
// credential goes from the input to the provider's `verify` and into the vault, and nowhere
// else: it is not returned, stored in clear or logged. Only the actions are exported.
import { and, eq } from "drizzle-orm";
import { action } from "@/lib/actions/server";
import { db, withTransaction } from "@/lib/db/client";
import { connectionsTable } from "@/lib/db/schema";
import { notFound, type NotFound, type ValidationFailed } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import {
  authorizationOf,
  connectInputSchema,
  connectionInputSchema,
  type Connection,
  type CredentialRejected,
  type ProviderUnreachable,
  type RateLimited,
} from "./contracts";
import { baseUrlRefusal } from "./address";
import { findProvider } from "./providers";
import { connectionColumns, findStoredConnection } from "./queries";
import { readCredential, writeSecret } from "./vault";

/** The connect form shows `message` as its URL field's error. */
const badBaseUrl = (message: string): ValidationFailed => ({
  _tag: "ValidationFailed",
  issues: [{ path: "baseUrl", message }],
});

/**
 * Connects to a provider: the provider checks the credential and names the account, then the
 * connection and its encrypted credential are stored. Connecting the same account at the same
 * address again updates both and marks the connection active.
 */
export const connectAction = action(
  connectInputSchema,
  async (
    { providerId, baseUrl: givenUrl, credential },
    { user },
  ): Promise<
    Result<
      Connection,
      | NotFound
      | ValidationFailed
      | CredentialRejected
      | ProviderUnreachable
      | RateLimited
    >
  > => {
    const provider = findProvider(providerId);
    if (!provider?.verify) return err(notFound("Provider", providerId));
    if (!provider.auth.some((method) => method.kind === credential.kind))
      return err(notFound("Sign-in method", credential.kind));
    const baseUrl = (givenUrl ?? provider.baseUrl?.default)?.replace(/\/+$/, "");
    if (!baseUrl) return err(badBaseUrl(`Enter the ${provider.name} URL.`));
    const refused = await baseUrlRefusal(baseUrl);
    if (refused) return err(badBaseUrl(refused));

    const verified = await provider.verify({
      baseUrl,
      authorization: authorizationOf(credential),
    });
    if (!verified.ok) return verified;
    const { accountRef, accountLabel, scopes, expiresAt } = verified.value;

    const now = new Date();
    const account = {
      accountLabel,
      authKind: credential.kind,
      status: "active" as const,
      scopes,
      expiresAt: expiresAt ?? null,
      lastVerifiedAt: now,
    };
    const stored = await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(connectionsTable)
        .values({ userId: user.id, providerId, baseUrl, accountRef, ...account })
        .onConflictDoUpdate({
          target: [
            connectionsTable.userId,
            connectionsTable.providerId,
            connectionsTable.baseUrl,
            connectionsTable.accountRef,
          ],
          set: { ...account, updatedAt: now },
        })
        .returning(connectionColumns);
      await writeSecret(tx, user.id, row!.id, credential);
      return row!;
    });
    return ok(stored);
  },
);

/**
 * Asks the provider again whether the stored credential works, and records the answer: a
 * refused credential marks the connection `needs_reconnect`. An unreachable provider, or one
 * whose rate limit is reached, changes nothing.
 */
export const testConnectionAction = action(
  connectionInputSchema,
  async (
    { connectionId },
    { user },
  ): Promise<Result<Connection, NotFound | ProviderUnreachable | RateLimited>> => {
    const connection = await findStoredConnection(user, connectionId);
    const provider = connection && findProvider(connection.providerId);
    const credential =
      provider?.verify && (await readCredential(user.id, connectionId));
    if (!connection || !provider?.verify || !credential)
      return err(notFound("Connection", connectionId));

    const verified = await provider.verify({
      baseUrl: connection.baseUrl,
      authorization: authorizationOf(credential),
    });
    if (!verified.ok && verified.error._tag !== "CredentialRejected")
      return err(verified.error);
    const now = new Date();
    const [row] = await db()
      .update(connectionsTable)
      .set(
        verified.ok
          ? {
              status: "active",
              accountLabel: verified.value.accountLabel,
              scopes: verified.value.scopes,
              expiresAt: verified.value.expiresAt ?? null,
              lastVerifiedAt: now,
              updatedAt: now,
            }
          : { status: "needs_reconnect", updatedAt: now },
      )
      .where(
        and(
          eq(connectionsTable.userId, user.id),
          eq(connectionsTable.id, connectionId),
        ),
      )
      .returning(connectionColumns);
    return row ? ok(row) : err(notFound("Connection", connectionId));
  },
);

/** Removes a connection and its credential. The token stays valid at the provider. */
export const disconnectAction = action(
  connectionInputSchema,
  async (
    { connectionId },
    { user },
  ): Promise<Result<{ id: string }, NotFound>> => {
    const [row] = await db()
      .delete(connectionsTable)
      .where(
        and(
          eq(connectionsTable.userId, user.id),
          eq(connectionsTable.id, connectionId),
        ),
      )
      .returning({ id: connectionsTable.id });
    return row ? ok(row) : err(notFound("Connection", connectionId));
  },
);
