import "server-only";
// The integrations module's agent tools (docs/adr/0005): each provider's own tools, gathered for
// the agent's registry, and which of them one answer may call. They run through
// `readWithConnection` (repo.ts): the server decides which connections a tool may read, and a
// provider's code is handed only a `ConnectionAccess`.
import type { User } from "@/lib/auth";
import type { ConnectionToolContext } from "./contracts";
import { github } from "./providers/github";
import { githubTools } from "./providers/github/tools";

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
