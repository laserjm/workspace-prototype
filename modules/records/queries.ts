import "server-only";
// What the server decides about attached items, from the user's connections: which an answer
// may use, and which a new question may not attach.
import type { User } from "@/lib/auth";
import { getConnections, getProviderForPrompt } from "@/modules/integrations/queries";
import {
  attachedConnectionsOf,
  type AllowedConnection,
  type MessageWithParts,
} from "./contracts";


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
export async function getAllowedConnections(
  requester: User,
  messages: readonly MessageWithParts[],
): Promise<AllowedConnection[]> {
  const ids = attachedConnectionIds(messages);
  if (ids.length === 0) return [];
  const connections = await getConnections(requester);
  const allowed = await Promise.all(
    ids.map(async (id) => {
      const connection = connections.find((candidate) => candidate.id === id);
      const provider = connection && (await getProviderForPrompt(connection.providerId));
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
    }),
  );
  return allowed.flat();
}

/**
 * The connections a new question attaches that are not among the user's: a forged or stale
 * request, which the server refuses. A malformed part attaches nothing here; validation refuses it.
 */
export async function getForeignConnectionIds(
  requester: User,
  message: MessageWithParts,
): Promise<string[]> {
  const ids = attachedConnectionIds([message]);
  if (ids.length === 0) return [];
  const own = new Set((await getConnections(requester)).map((connection) => connection.id));
  return ids.filter((id) => !own.has(id));
}
