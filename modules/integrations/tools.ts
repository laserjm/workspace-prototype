import "server-only";
// The providers' own agent tools, gathered for the agent's registry (`integrationTools`), and which
// of them one answer may call.
import type { User } from "@/lib/auth/user";
import type { ConnectionToolContext } from "./connection-tool";
import { github } from "./providers/github";
import { githubTools } from "./providers/github/tools";

/** Each provider's tools, by provider id: a tool reads only connections of its provider. */
const toolsByProvider = { [github.id]: githubTools };

/**
 * Every provider tool, each provider's spread by name so the registry keeps their types. Keys are
 * the names the model sees and stored conversations hold.
 */
export const integrationTools = { ...githubTools };

export type IntegrationToolName = keyof typeof integrationTools;

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
  const activeTools: IntegrationToolName[] = [];
  const toolsContext = {} as Record<IntegrationToolName, ConnectionToolContext>;
  for (const [provider, tools] of Object.entries(toolsByProvider)) {
    const connectionIds = connections
      .filter((connection) => connection.provider === provider)
      .map((connection) => connection.connectionId);
    for (const name of Object.keys(tools) as IntegrationToolName[]) {
      toolsContext[name] = { user, connectionIds };
      if (connectionIds.length > 0) activeTools.push(name);
    }
  }
  return { activeTools, toolsContext };
}
