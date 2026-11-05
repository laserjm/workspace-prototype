import "server-only";
import { skillTools } from "@/modules/skills/server";
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
 * context the thread does not have is left out: `search_records` only with attached records,
 * `load_skill` only with skills to load.
 */
export function toolsFor({ attached, offeredSkills }: AgentContext): {
  activeTools: ToolName[];
  toolsContext: {
    search_records: { scope?: RecordScope };
    load_skill: { skillIds: string[] };
  };
} {
  const scope = attached && {
    sourceId: attached.source.id,
    recordIds: attached.records.map((record) => record.id),
  };
  const skillIds = offeredSkills.map((skill) => skill.id);
  return {
    activeTools: [
      "html_render",
      ...(scope ? (["search_records"] as const) : []),
      ...(skillIds.length > 0 ? (["load_skill"] as const) : []),
    ],
    toolsContext: {
      search_records: { scope },
      load_skill: { skillIds },
    },
  };
}
