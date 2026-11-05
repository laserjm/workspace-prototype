import { z } from "zod";
import { chatOptionsSchema, MODEL_PROVIDERS } from "@/modules/agent";

/** The first message of a new thread. `id` is the chat's, picked by the browser. */
export const startThreadInputSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  prompt: z.string().trim().min(1).max(10_000),
  provider: z.enum(MODEL_PROVIDERS),
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
