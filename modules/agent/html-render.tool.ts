import "server-only";
import { tool } from "ai";
import {
  clampHtmlRenderHeight,
  findViewportHeightUnit,
  HTML_RENDER_DESCRIPTION,
  normalizeHtmlRenderTitle,
  viewportHeightErrorMessage,
} from "@/lib/html-render/html-render";
import { htmlRenderInputSchema, type HtmlRenderOutput } from "./contracts";

/** `html_render`, adapted from T3 Code (MIT); see THIRD_PARTY_NOTICES.md. */
export const htmlRenderTool = tool({
  description: HTML_RENDER_DESCRIPTION,
  inputSchema: htmlRenderInputSchema,
  // The page itself stays in the tool input, which the client renders. A thrown error goes
  // back to the model as the tool result, so it can fix the page.
  async execute({ title, height, html }): Promise<HtmlRenderOutput> {
    const viewportUnit = findViewportHeightUnit(html);
    if (viewportUnit !== undefined) {
      throw new Error(viewportHeightErrorMessage(viewportUnit));
    }
    return {
      title: normalizeHtmlRenderTitle(title),
      height: clampHtmlRenderHeight(height),
      message: "Page shown above your reply. Do not restate it.",
    };
  },
});
