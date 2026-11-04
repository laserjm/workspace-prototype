import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  HTML_RENDER_DESCRIPTION,
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MAX_HTML_LENGTH,
  HTML_RENDER_MAX_TITLE_LENGTH,
  HTML_RENDER_MIN_HEIGHT,
  clampHtmlRenderHeight,
  findViewportHeightUnit,
  normalizeHtmlRenderTitle,
  viewportHeightErrorMessage,
} from "@/lib/html-render/html-render";

// The tool name the model sees is its key in `tools/index.ts`; keep it equal
// to this filename (`html_render`).
export default tool({
  description: HTML_RENDER_DESCRIPTION,
  inputSchema: z.object({
    html: z
      .string()
      .min(1)
      .max(HTML_RENDER_MAX_HTML_LENGTH)
      .describe("A complete, self-contained HTML document."),
    title: z.string().min(1).max(HTML_RENDER_MAX_TITLE_LENGTH),
    height: z
      .number()
      .int()
      .describe(
        `Estimated frame height in CSS pixels, ${HTML_RENDER_MIN_HEIGHT} to ${HTML_RENDER_MAX_HEIGHT}. The frame fits the page once it loads.`,
      ),
  }),
  // The page itself stays in the tool input, which the client renders. A thrown
  // error goes back to the model as the tool result, so it can fix the page.
  async execute({ html, title, height }) {
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
