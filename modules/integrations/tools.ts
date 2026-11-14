import "server-only";
// The integrations module's agent tools (docs/adr/0005): each provider's own tools, gathered for
// the agent's registry, which of them one answer may call, and what they run through. The server
// decides which connections a tool may read; a provider's code is handed only a
// `ConnectionAccess`.
import { z } from "zod";
import type { User } from "@/lib/auth";
import type { RecordReadRefusal } from "./contracts";
import type { Answer, ConnectionAccess } from "./provider";
import { github } from "./providers/github";
import { githubTools } from "./providers/github/tools";
import { accessFor, findOwnedConnection, markNeedsReconnect } from "./repo";

/**
 * What a tool that reads connections may see: the requester and the connections the server
 * allowed for this answer (for a provider tool, only its provider's: `integrationToolsFor`).
 * Never from the model. The record tools share it.
 */
export const connectionToolContextSchema = z.object({
  user: z.custom<User>().optional(),
  connectionIds: z.array(z.string()),
});
export type ConnectionToolContext = z.infer<typeof connectionToolContextSchema>;

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

/**
 * Every provider tool, each provider's spread by name so the registry keeps their types. Keys are
 * the names the model sees and stored conversations hold.
 */
export const integrationTools = { ...githubTools };

export type IntegrationToolName = keyof typeof integrationTools;

/** The provider whose connections each tool reads; the compiler asks for a line per tool. */
const providerOf: Record<IntegrationToolName, string> = {
  github_pull_request_diff: github.id,
};

/**
 * The provider tools one answer may call, and what each knows of the thread: a provider's tools
 * are offered only while one of its connections is allowed, and each sees only those.
 */
export function integrationToolsFor(
  user: User | undefined,
  connections: readonly { connectionId: string; provider: string }[],
): {
  activeTools: IntegrationToolName[];
  toolsContext: Record<IntegrationToolName, ConnectionToolContext>;
} {
  const contextOf = (name: IntegrationToolName): ConnectionToolContext => ({
    user,
    connectionIds: connections
      .filter((connection) => connection.provider === providerOf[name])
      .map((connection) => connection.connectionId),
  });
  const toolsContext = { github_pull_request_diff: contextOf("github_pull_request_diff") };
  const names = Object.keys(providerOf).filter(
    (name): name is IntegrationToolName => Object.hasOwn(providerOf, name),
  );
  return {
    activeTools: names.filter((name) => toolsContext[name].connectionIds.length > 0),
    toolsContext,
  };
}
