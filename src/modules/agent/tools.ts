import "server-only";
import { skillTools } from "@/modules/skills/server";
import type { User } from "@/lib/auth/user";
import type { RecordScope } from "@/modules/sources";
import { sourceTools } from "@/modules/sources/server";
import type { AgentContext } from "./context";
import { htmlRenderTool } from "./html-render.tool";

/**
 * Every tool the agent knows. A module's tools live in the module (`sources/tools.ts`) and come
 * in through its `server.ts`; the agent only puts them together. Keys are the names the model
 * sees, and stored conversations hold them: every send validates the whole conversation against
 * this set, so a tool is never renamed, and a removed one keeps a stub under its name.
 */
export const tools = {
  html_render: htmlRenderTool,
  ...sourceTools,
  ...skillTools,
};

export type ToolName = keyof typeof tools;

/**
 * The tools one answer may call, and what each one knows of the thread. A tool that needs
 * context the thread does not have is left out: `search_records` and `get_record` only with
 * attached records that could be read, `load_skill` only with skills to load.
 */
export function toolsFor({
  user,
  attached,
  offeredSkills,
}: AgentContext): {
  activeTools: ToolName[];
  toolsContext: {
    search_records: { user: User; scope?: RecordScope };
    get_record: { user: User; scope?: RecordScope };
    load_skill: { skillIds: string[] };
  };
} {
  const scope = attached?.readable
    ? {
        sourceId: attached.source.id,
        recordIds: attached.records.map((record) => record.id),
      }
    : undefined;
  const skillIds = offeredSkills.map((skill) => skill.id);
  return {
    activeTools: [
      "html_render",
      ...(scope ? (["search_records", "get_record"] as const) : []),
      ...(skillIds.length > 0 ? (["load_skill"] as const) : []),
    ],
    toolsContext: {
      search_records: { user, scope },
      get_record: { user, scope },
      load_skill: { skillIds },
    },
  };
}
