import "server-only";
import { htmlRenderTool } from "./html-render.tool";

/**
 * Every tool the agent can call. Keys are the names the model sees, and stored conversations
 * hold them: every send validates the whole conversation against this set, so a tool is never
 * renamed, and a removed one keeps a stub under its name.
 */
export const tools = { html_render: htmlRenderTool };
