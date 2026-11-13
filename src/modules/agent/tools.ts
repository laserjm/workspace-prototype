import "server-only";
import type { User } from "@/lib/auth/user";
import { recordTools } from "@/modules/records/server";
import { skillTools } from "@/modules/skills/server";
import type { AgentContext } from "./context";
import { htmlRenderTool } from "./html-render.tool";

/**
 * Every tool the agent knows. A module's tools live in the module (`records/tools.ts`) and come
 * in through its `server.ts`; the agent only puts them together. Keys are the names the model
 * sees, and stored conversations hold them: every send validates the whole conversation against
 * this set, so a tool is never renamed, and a removed one keeps a stub under its name.
 */
export const tools = {
  html_render: htmlRenderTool,
  ...recordTools,
  ...skillTools,
};

export type ToolName = keyof typeof tools;

/**
 * The tools one answer may call, and what each one knows of the thread. A tool that needs
 * context the thread does not have is left out: `search_records` only with a connection the
 * server allowed, `load_skill` only with skills to load.
 */
export function toolsFor({
  user,
  connections = [],
  offeredSkills,
}: AgentContext): {
  activeTools: ToolName[];
  toolsContext: {
    search_records: { user: User; connectionIds: string[] };
    load_skill: { skillIds: string[] };
  };
} {
  const connectionIds = connections.map((connection) => connection.connectionId);
  const skillIds = offeredSkills.map((skill) => skill.id);
  return {
    activeTools: [
      "html_render",
      ...(connectionIds.length > 0 ? (["search_records"] as const) : []),
      ...(skillIds.length > 0 ? (["load_skill"] as const) : []),
    ],
    toolsContext: {
      search_records: { user, connectionIds },
      load_skill: { skillIds },
    },
  };
}
