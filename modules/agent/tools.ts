import "server-only";
// The agent's tool registry. A module's tools live in the module and come in through its tools.ts
// (docs/adr/0005); the agent puts them together and adds its own, `html_render`.
import { tool } from "ai";
import type { User } from "@/lib/auth";
import { integrationTools, integrationToolsFor } from "@/modules/integrations/tools";
import { recordTools } from "@/modules/records/tools";
import { skillTools } from "@/modules/skills/tools";
import {
  clampHtmlRenderHeight,
  HTML_RENDER_COLUMN_WIDTH,
  HTML_RENDER_MAX_FIT_HEIGHT,
  htmlRenderInput,
  normalizeHtmlRenderTitle,
  type HtmlRenderOutput,
} from "./contracts";
import type { AgentContext } from "./domain";

// html_render, adapted from T3 Code's packages/shared/src/htmlRender.ts and the html_render tool
// in apps/server/src/mcp/toolkits/html (MIT). See THIRD_PARTY_NOTICES.md.

const HTML_RENDER_THEME_GUIDE = [
  "Use theme CSS variables on :root, not fixed colors:",
  "--background, --foreground, --muted, --card, --popover, --secondary, --border, --ring, --primary, --accent, --destructive, --warning, --success, --info, --code-background",
  "(most have a matching -foreground; accent, destructive, and warning also have -surface),",
  "--chart-1 to --chart-6, --radius, --font-sans, --font-mono.",
  "The base sheet sets background, text, and font.",
].join(" ");

const HTML_RENDER_LAYOUT_GUIDE = [
  `Frame width is reply width (up to ${HTML_RENDER_COLUMN_WIDTH}px desktop, about 360px phones), on the thread background.`,
  "Leave html, body, and the outer element with no background color, no outer card, border, banner title, or side padding. This wins over any rule that sets a page background.",
  "The host adds an overridable 8px html gutter for selection rings and shadows. Use fluid widths within it.",
  "A box that needs its own background gets 16px padding and var(--radius) corners. Give charts fixed pixel heights.",
  "Let content set the height. Do not use vh units or height:100% on html or body. Both are rejected or loop.",
].join(" ");

const HTML_RENDER_PAGE_RULES =
  "Write a complete, self-contained document. Inline <style> and <script>. Remote URLs (for example a chart library from a CDN) load as-is.";

const HTML_RENDER_DESCRIPTION = `Show a finished HTML page (chart, dashboard, mockup, a long or sortable table, or a diagram Mermaid cannot draw) inline in this thread, above your final reply. Use it when a visual makes the answer clearer or the user asks for one. Do not announce or restate the page. Frame fits height up to ${HTML_RENDER_MAX_FIT_HEIGHT}px. ${HTML_RENDER_PAGE_RULES} ${HTML_RENDER_LAYOUT_GUIDE} ${HTML_RENDER_THEME_GUIDE}`;

// Check only stylesheets and style attributes, even inside scripts; skip comments whole.
// Consume unclosed comments, tags, or quotes through EOF to keep both patterns linear.
const CSS_SOURCE =
  /<!--[\s\S]*?(?:-->|$)|<style\b[^>]*(?:>|$)([\s\S]*?)(?:<\/style\s*>|$)|\sstyle\s*=\s*(?:"([^"]*)(?:"|$)|'([^']*)(?:'|$)|([^\s>]+))/gi;
// The lookbehind skips base64 runs, such as an inlined image that happens to contain "1vh".
const VIEWPORT_HEIGHT_UNIT =
  /(?<![\w.+/])(?:\d+(?:\.\d+)?|\.\d+)[sld]?vh(?![\w-])/i;

/** Returns the first viewport height unit in the page's CSS, if any. */
export function findViewportHeightUnit(html: string): string | undefined {
  for (const [, sheet, doubleQuoted, singleQuoted, unquoted] of html.matchAll(
    CSS_SOURCE,
  )) {
    const css = sheet ?? doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    const found = VIEWPORT_HEIGHT_UNIT.exec(css)?.[0];
    if (found !== undefined) return found;
  }
  return undefined;
}

export function viewportHeightErrorMessage(found: string) {
  return `The page uses a viewport height unit (${found}). The frame grows to fit the page, so a size that follows the viewport makes it grow again and again. Let content set the height, or use fixed pixel heights.`;
}


/** `html_render`: the page stays in the tool input, which the client renders. */
const htmlRenderTool = tool({
  description: HTML_RENDER_DESCRIPTION,
  inputSchema: htmlRenderInput,
  // A thrown error goes back to the model as the tool result, so it can fix the page.
  async execute({ title, height, html }): Promise<HtmlRenderOutput> {
    const viewportUnit = findViewportHeightUnit(html);
    if (viewportUnit !== undefined) throw new Error(viewportHeightErrorMessage(viewportUnit));
    return {
      title: normalizeHtmlRenderTitle(title),
      height: clampHtmlRenderHeight(height),
      message: "Page shown above your reply. Do not restate it.",
    };
  },
});


/**
 * Every tool the agent knows. A module's tools live in the module (`records/tools.ts`, a
 * provider's in its folder, gathered as `integrationTools`) and come in through its `tools.ts`;
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

const recordToolNames: ToolName[] = ["search_records", "read_record"];
const skillToolNames: ToolName[] = ["load_skill"];

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
      ...(connectionIds.length > 0 ? recordToolNames : []),
      ...integration.activeTools,
      ...(skillIds.length > 0 ? skillToolNames : []),
    ],
    toolsContext: {
      search_records: { user, connectionIds },
      read_record: { user, connectionIds },
      ...integration.toolsContext,
      load_skill: { skillIds },
    },
  };
}
