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

/** The first message of a new thread. `id` is the chat's, picked by the browser. */
export const startThreadInputSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  prompt: z.string().trim().min(1).max(10_000),
  provider: z.enum(["claude", "openai"]),
  scope: chatOptionsSchema.shape.scope,
});
export type StartThreadInput = z.infer<typeof startThreadInputSchema>;

/** A thread's id as a URL names it (`/api/threads/[id]/messages`). */
export const threadIdSchema = z.uuid();

/**
 * The POST body of /api/threads/[id]/messages: the thread's latest message, which the AI SDK chat
 * transport sends (`prepareSendMessagesRequest` in `ChatStore`); the URL names the thread. The
 * server holds the rest of the conversation, so a browser cannot rewrite it. The message is
 * validated with the conversation against the agent's tools.
 */
export const chatTurnDtoSchema = chatOptionsSchema.extend({
  message: z.looseObject({
    id: z.string().min(1).max(200),
    role: z.literal("user"),
  }),
});
export type ChatTurnDto = z.infer<typeof chatTurnDtoSchema>;

/** A fork of `fromThreadId` through one of its responses. `id` is the fork's, picked by the browser. */
export const forkThreadInputSchema = z.object({
  fromThreadId: z.uuid(),
  id: z.uuid(),
  throughMessageId: z.string().min(1).max(200),
});
export type ForkThreadInput = z.infer<typeof forkThreadInputSchema>;

const isoTimestampSchema = z.iso.datetime({ offset: true });

/** Where a thread sat before a change, for the undo: active, settled, snoozed or woken. */
export const threadPlacementSchema = z
  .object({
    settledAt: isoTimestampSchema.optional(),
    snoozedUntil: isoTimestampSchema.optional(),
    wokeAt: isoTimestampSchema.optional(),
  })
  .refine(
    (placement) => Object.values(placement).filter(Boolean).length <= 1,
    "A thread has one placement.",
  );

/**
 * A change to where a thread sits in the sidebar. The server applies it with its own clock;
 * `return` puts the thread back where it was (an undo).
 */
export const placeThreadInputSchema = z.object({
  threadId: z.uuid(),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("settle") }),
    z.object({ kind: z.literal("snooze"), until: isoTimestampSchema }),
    z.object({ kind: z.literal("restore") }),
    z.object({ kind: z.literal("acknowledgeWake") }),
    z.object({ kind: z.literal("return"), placement: threadPlacementSchema }),
  ]),
});
export type PlaceThreadInput = z.infer<typeof placeThreadInputSchema>;
export type ThreadChange = PlaceThreadInput["change"];

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
