import "server-only";
import type { User } from "@/lib/auth/user";
import { integrationTools, integrationToolsFor } from "@/modules/integrations/server";
import { recordTools } from "@/modules/records/server";
import { skillTools } from "@/modules/skills/server";
import type { AgentContext } from "./context";
import { htmlRenderTool } from "./html-render.tool";

/**
 * Every tool the agent knows. A module's tools live in the module (`records/tools.ts`, a
 * provider's in its folder, gathered as `integrationTools`) and come in through its `server.ts`;
 * the agent only puts them together. Keys are the names the model
 * sees, and stored conversations hold them: every send validates the whole conversation against
 * this set, so a tool is never renamed, and a removed one keeps a stub under its name.
 */
export const tools = {
  html_render: htmlRenderTool,
  ...recordTools,
  ...integrationTools,
  ...skillTools,
};

export type ToolName = keyof typeof tools;

/**
 * The tools one answer may call, and what each one knows of the thread. A tool that needs
 * context the thread does not have is left out: `search_records` and `read_record` only with a
 * connection the server allowed, a provider's own tools (`github_pull_request_diff`) only with one
 * of its connections allowed, `load_skill` only with skills to load.
 */
export function toolsFor({
  user,
  connections = [],
  offeredSkills,
}: AgentContext): {
  activeTools: ToolName[];
  toolsContext: {
    search_records: { user: User; connectionIds: string[] };
    read_record: { user: User; connectionIds: string[] };
    load_skill: { skillIds: string[] };
  } & ReturnType<typeof integrationToolsFor>["toolsContext"];
} {
  const connectionIds = connections.map((connection) => connection.connectionId);
  const skillIds = offeredSkills.map((skill) => skill.id);
  const integration = integrationToolsFor(user, connections);
  return {
    activeTools: [
      "html_render",
      ...(connectionIds.length > 0 ? (["search_records", "read_record"] as const) : []),
      ...integration.activeTools,
      ...(skillIds.length > 0 ? (["load_skill"] as const) : []),
    ],
    toolsContext: {
      search_records: { user, connectionIds },
      read_record: { user, connectionIds },
      ...integration.toolsContext,
      load_skill: { skillIds },
    },
  };
}
