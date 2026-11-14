import "server-only";
// Connecting, testing and disconnecting. A credential goes from the input to the provider's
// `verify` and into the vault, and nowhere else: it is not returned, stored in clear or logged.
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { and, eq } from "drizzle-orm";
import type { User } from "@/lib/auth";
import { db, withTransaction } from "@/lib/db/client";
import { connectionsTable } from "@/lib/db/schema";
import { writeSecret } from "@/lib/db/vault";
import type { ConnectInput, ConnectionListItem } from "./contracts";
import {
  BaseUrlRefused,
  ConnectionNotFound,
  CredentialRejected,
  ProviderNotFound,
  ProviderRateLimited,
  ProviderUnreachable,
} from "./errors";
import { authorizationOf, type Provider, type VerifyRefusal } from "./provider";
import { findProvider } from "./providers";
import { connectionColumns, findOwnedConnection, readCredential } from "./repo";

/**
 * Connects to a provider: the provider checks the credential and names the account, then the
 * connection and its encrypted credential are stored. Connecting the same account at the same
 * address again updates both and marks the connection active.
 */
export async function connect(
  requester: User,
  { providerId, baseUrl: givenUrl, credential }: ConnectInput,
): Promise<ConnectionListItem> {
  const provider = findProvider(providerId);
  if (!provider || !provider.auth.some((method) => method.kind === credential.kind))
    throw new ProviderNotFound(providerId);
  const baseUrl = (givenUrl ?? provider.baseUrl.default)?.replace(/\/+$/, "");
  if (!baseUrl) throw new BaseUrlRefused("", "missing");
  await refuseInternalAddress(baseUrl);

  const verified = await provider.verify({ baseUrl, authorization: authorizationOf(credential) });
  if (!verified.ok) throw refusalError(provider, baseUrl, verified.error);
  const { accountRef, accountLabel, scopes, expiresAt } = verified.value;

  const account = {
    accountLabel,
    authKind: credential.kind,
    status: "active" as const,
    scopes,
    expiresAt: expiresAt ?? null,
    lastVerifiedAt: new Date(),
  };
  return withTransaction(async (tx) => {
    const [row] = await tx
      .insert(connectionsTable)
      .values({ userId: requester.id, providerId, baseUrl, accountRef, ...account })
      .onConflictDoUpdate({
        target: [
          connectionsTable.userId,
          connectionsTable.providerId,
          connectionsTable.baseUrl,
          connectionsTable.accountRef,
        ],
        set: account,
      })
      .returning(connectionColumns);
    if (!row) throw new Error("The upsert returned no connection");
    await writeSecret(tx, requester.id, row.id, credential);
    return row;
  });
}

/**
 * Asks the provider again whether the stored credential works, and records the answer: a
 * refused credential marks the connection `needs_reconnect`. An unreachable provider, or one
 * whose rate limit is reached, changes nothing and throws.
 */
export async function testConnection(
  requester: User,
  connectionId: string,
): Promise<ConnectionListItem> {
  const connection = await findOwnedConnection(requester, connectionId);
  const provider = connection && findProvider(connection.providerId);
  const credential = provider && (await readCredential(requester, connectionId));
  if (!connection || !provider || !credential) throw new ConnectionNotFound(connectionId);

  const verified = await provider.verify({
    baseUrl: connection.baseUrl,
    authorization: authorizationOf(credential),
  });
  if (!verified.ok && verified.error.kind !== "credential_rejected")
    throw refusalError(provider, connection.baseUrl, verified.error);
  const [row] = await db()
    .update(connectionsTable)
    .set(
      verified.ok
        ? {
            status: "active",
            accountLabel: verified.value.accountLabel,
            scopes: verified.value.scopes,
            expiresAt: verified.value.expiresAt ?? null,
            lastVerifiedAt: new Date(),
          }
        : { status: "needs_reconnect" },
    )
    .where(and(eq(connectionsTable.userId, requester.id), eq(connectionsTable.id, connection.id)))
    .returning(connectionColumns);
  if (!row) throw new ConnectionNotFound(connectionId);
  return row;
}

/** Removes a connection and its credential. The token stays valid at the provider. */
export async function disconnect(requester: User, connectionId: string): Promise<{ id: string }> {
  const connection = await findOwnedConnection(requester, connectionId);
  if (!connection) throw new ConnectionNotFound(connectionId);
  const [row] = await db()
    .delete(connectionsTable)
    .where(and(eq(connectionsTable.userId, requester.id), eq(connectionsTable.id, connection.id)))
    .returning({ id: connectionsTable.id });
  if (!row) throw new ConnectionNotFound(connectionId);
  return row;
}

function refusalError(provider: Provider, baseUrl: string, refusal: VerifyRefusal) {
  switch (refusal.kind) {
    case "credential_rejected":
      return new CredentialRejected(provider.name);
    case "rate_limited":
      return new ProviderRateLimited(provider.name, refusal.retryAt);
    case "unreachable":
      return new ProviderUnreachable(provider.name, baseUrl, refusal.status);
  }
}

// The base URL check (ARCHITECTURE.md, "Integrations are provider folders"): a connection may not
// point the server at itself or at an internal network. It runs when a connection is saved, not
// on each request, and does not pin the address it saw (decided in #44).

type Internal = "loopback" | "private" | "link-local";

const RANGES: ReadonlyArray<{
  kind: Internal;
  network: string;
  prefix: number;
  family: "ipv4" | "ipv6";
}> = [
  { kind: "loopback", network: "0.0.0.0", prefix: 8, family: "ipv4" },
  { kind: "loopback", network: "127.0.0.0", prefix: 8, family: "ipv4" },
  { kind: "loopback", network: "::", prefix: 128, family: "ipv6" },
  { kind: "loopback", network: "::1", prefix: 128, family: "ipv6" },
  { kind: "private", network: "10.0.0.0", prefix: 8, family: "ipv4" },
  { kind: "private", network: "172.16.0.0", prefix: 12, family: "ipv4" },
  { kind: "private", network: "192.168.0.0", prefix: 16, family: "ipv4" },
  { kind: "private", network: "fc00::", prefix: 7, family: "ipv6" },
  { kind: "link-local", network: "169.254.0.0", prefix: 16, family: "ipv4" },
  { kind: "link-local", network: "fe80::", prefix: 10, family: "ipv6" },
];

/** One block list per kind. An IPv4-mapped IPv6 address matches its IPv4 range. */
const BLOCKS = RANGES.reduce((blocks, { kind, network, prefix, family }) => {
  const list = blocks.get(kind) ?? new BlockList();
  list.addSubnet(network, prefix, family);
  return blocks.set(kind, list);
}, new Map<Internal, BlockList>());

/** Which internal kind of address this is; none for an address on the internet. */
function internalKind(address: string): Internal | undefined {
  const family = isIP(address) === 6 ? "ipv6" : "ipv4";
  for (const [kind, list] of BLOCKS) if (list.check(address, family)) return kind;
  return undefined;
}

/** Throws `BaseUrlRefused` when the workspace will not send requests to this base URL. */
async function refuseInternalAddress(baseUrl: string): Promise<void> {
  // The URL parser has already normalised IPv4 (`0x7f.1` is `127.0.0.1`) and bracketed IPv6.
  const host = new URL(baseUrl).hostname.replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost"))
    throw new BaseUrlRefused(host, "loopback");
  const literal = host.replace(/^\[(.*)\]$/, "$1");
  if (isIP(literal)) {
    const kind = internalKind(literal);
    if (kind) throw new BaseUrlRefused(host, kind);
    return;
  }
  // Every address the name resolves to, since a request may use any of them. A name that does
  // not resolve here is refused too, rather than left to a later lookup that might answer.
  const addresses = await lookup(host, { all: true }).catch(() => undefined);
  if (!addresses?.length) throw new BaseUrlRefused(host, "unresolved");
  for (const { address } of addresses) {
    const kind = internalKind(address);
    if (kind) throw new BaseUrlRefused(host, kind, address);
  }
}
