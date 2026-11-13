import "server-only";
// Server-only public API of the records module: what the server decides about attached items.
import type { User } from "@/lib/auth/user";
import { listConnections, providerForPrompt } from "@/modules/integrations/server";
import { attachedConnectionsOf, type MessageWithParts } from "./attached-items";

/** A connection the agent may use for one answer, as its prompt names it. */
export type AllowedConnection = {
  connectionId: string;
  /** The provider's id, e.g. "github". */
  provider: string;
  /** The provider's name, e.g. "GitHub". */
  providerName: string;
  /** The connection's account, e.g. "@acme". */
  account: string;
  /** What the connection reaches, e.g. "Organisation acme, 4 repositories", when known. */
  reach?: string;
  /** The provider's guide for the agent. */
  guide?: string;
};

/** Every connection the thread's questions attached, once each, in the order first attached. */
function attachedConnectionIds(messages: readonly MessageWithParts[]): string[] {
  const ids = messages.flatMap((message) =>
    attachedConnectionsOf(message).map((connection) => connection.connectionId),
  );
  return [...new Set(ids)];
}

/**
 * The connections an answer may use (ADR 0003): those any of the thread's questions attached,
 * with or without items, that are still the user's and do not need reconnecting. The server
 * decides, never the model. Sending fetches nothing: no provider is asked.
 */
export async function allowedConnections(
  user: User,
  messages: readonly MessageWithParts[],
): Promise<AllowedConnection[]> {
  const ids = attachedConnectionIds(messages);
  if (ids.length === 0) return [];
  const connections = await listConnections(user);
  return ids.flatMap((id) => {
    const connection = connections.find((candidate) => candidate.id === id);
    const provider = connection && providerForPrompt(connection.providerId);
    if (!connection || !provider || connection.status !== "active") return [];
    return [
      {
        connectionId: connection.id,
        provider: connection.providerId,
        providerName: provider.name,
        account: connection.accountLabel,
        ...(provider.guide ? { guide: provider.guide } : {}),
      },
    ];
  });
}

/**
 * The connections a new question attaches that are not among the user's: a forged or stale
 * request, which the server refuses. A malformed part attaches nothing here; validation refuses it.
 */
export async function foreignConnectionIds(
  user: User,
  message: MessageWithParts,
): Promise<string[]> {
  const ids = attachedConnectionIds([message]);
  if (ids.length === 0) return [];
  const own = new Set((await listConnections(user)).map((connection) => connection.id));
  return ids.filter((id) => !own.has(id));
}
