import type { UIDataTypes, UIMessage } from "ai";
import { z } from "zod";
import {
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MAX_HTML_LENGTH,
  HTML_RENDER_MAX_TITLE_LENGTH,
  HTML_RENDER_MIN_HEIGHT,
} from "@/lib/html-render/html-render";

/**
 * What the workspace sends alongside each message, as ids only. The server resolves them
 * against its catalogues, so a browser cannot pick a model, skill or record it was not offered.
 */
export const chatOptionsSchema = z.object({
  modelId: z.string().min(1).max(100),
  skillId: z.string().min(1).max(100).optional(),
  scope: z
    .object({
      sourceId: z.string().min(1).max(100),
      recordIds: z.array(z.string().min(1).max(100)).max(100),
    })
    .optional(),
});
export type ChatOptions = z.infer<typeof chatOptionsSchema>;

/**
 * The POST body of /api/chat. `id` and `messages` come from the AI SDK chat transport; the
 * messages are validated separately against the agent's tools.
 */
export const chatTurnDtoSchema = chatOptionsSchema.extend({
  id: z.string().min(1).max(200),
  messages: z.array(z.unknown()).min(1).max(200),
});
export type ChatTurnDto = z.infer<typeof chatTurnDtoSchema>;

/** The `html_render` tool: the model shows a self-contained HTML page above its reply. */
export const htmlRenderInputSchema = z.object({
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
});
export type HtmlRenderInput = z.infer<typeof htmlRenderInputSchema>;

export const htmlRenderOutputSchema = z.object({
  title: z.string(),
  height: z.number(),
  message: z.string(),
});
export type HtmlRenderOutput = z.infer<typeof htmlRenderOutputSchema>;

export type WorkspaceMessageMetadata = {
  /** User messages: when the message was sent. */
  createdAt?: string;
  /** User messages: attachment names (not yet uploaded to the model). */
  attachments?: string[];
  /** Assistant messages: stamped by the server on stream start and finish. */
  startedAt?: string;
  completedAt?: string;
  modelId?: string;
  skillId?: string;
};

/** The tools as the browser sees them; keys are the names the model sees. */
export type WorkspaceUITools = {
  html_render: { input: HtmlRenderInput; output: HtmlRenderOutput };
};

export type WorkspaceUIMessage = UIMessage<
  WorkspaceMessageMetadata,
  UIDataTypes,
  WorkspaceUITools
>;
