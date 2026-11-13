import "server-only";
// What a provider's own agent tool (`providers/<id>/tools.ts`) runs through: the server decides
// which connections it may read, and the provider's code is handed only a `ConnectionAccess`.
import { z } from "zod";
import type { User } from "@/lib/auth/user";
import type { Result } from "@/lib/result";
import { accessFor } from "./access";
import type { ConnectionAccess, RecordReadRefusal } from "./contracts";
import { listConnections, markNeedsReconnect } from "./queries";

/**
 * What a tool that reads connections may see: the user and the connections the server allowed for
 * this answer (for a provider tool, only its provider's: `integrationToolsFor`). Never from the
 * model. The record tools share it.
 */
export const connectionToolContextSchema = z.object({
  user: z.custom<User>().optional(),
  connectionIds: z.array(z.string()),
});
export type ConnectionToolContext = z.infer<typeof connectionToolContextSchema>;

/**
 * Runs `read` with the access of one of the user's connections of `providerId`, answering a
 * refusal as data. A `connectionId` outside the allowed ones is `no_access`, whatever the model
 * asks, and nothing is read; one that is gone, or of another provider, is `not_found`. A credential
 * the provider refuses marks the connection `needs_reconnect`.
 */
export async function readWithConnection<T>(
  { user, connectionIds }: ConnectionToolContext,
  connectionId: string,
  providerId: string,
  read: (access: ConnectionAccess) => Promise<Result<T, RecordReadRefusal>>,
): Promise<T | { error: RecordReadRefusal }> {
  if (!user || !connectionIds.includes(connectionId)) return { error: { kind: "no_access" } };
  const connection = (await listConnections(user)).find(
    (candidate) => candidate.id === connectionId && candidate.providerId === providerId,
  );
  const access = connection && (await accessFor(user, connection));
  if (!access) return { error: { kind: "not_found" } };
  const answer = await read(access);
  if (answer.ok) return answer.value;
  if (answer.error.kind === "needs_reconnect") await markNeedsReconnect(user, connectionId);
  return { error: answer.error };
}
