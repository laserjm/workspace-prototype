// The thread, its errors, the rules that make and continue one, and the input schemas of its
// actions and its chat route. Where a thread sits in the sidebar is `placement.ts`; how its
// conversation grows and forks is `conversation.ts`.
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  chatOptionsSchema,
  MODEL_PROVIDERS,
  type ModelProvider,
} from "@/modules/agent";

/** When a response started and, once it has, when it finished. */
export type ResponseTiming = { startedAt: string; completedAt: string | null };

/** Where a thread sits in the sidebar. No field set: active. */
export type ThreadPlacement = {
  settledAt?: string;
  snoozedUntil?: string;
  wokeAt?: string;
};

export type ThreadShelf = "active" | "snoozed" | "settled";

/**
 * Sidebar and session metadata. The conversation is stored apart, in the thread's messages. `projectId`
 * refers to a project of the projects module; null: the thread has no project.
 */
export type Thread = ThreadPlacement & {
  id: string;
  projectId: string | null;
  title: string;
  branch: string;
  /** ISO timestamp. */
  createdAt: string;
  provider: ModelProvider;
  forkedFrom?: { threadId: string; title: string; responseIndex: number };
} & ConversationCounts;

/** How much the thread's stored conversation holds: its questions and their attachments. */
export type ConversationCounts = { turnCount: number; attachmentCount: number };

/** The placement of an active thread, spread over a thread to clear the one it had. */
export const ACTIVE: { [K in keyof Required<ThreadPlacement>]: undefined } = {
  settledAt: undefined,
  snoozedUntil: undefined,
  wokeAt: undefined,
};

// Errors

/** The latest response is still being prepared. */
export type ThreadStillWorking = {
  _tag: "ThreadStillWorking";
  threadId: string;
};

/** A snooze must end in the future. */
export type SnoozeTimeInPast = { _tag: "SnoozeTimeInPast" };

/** A custom snooze names no date or duration that can be read. */
export type SnoozeTimeUnreadable = { _tag: "SnoozeTimeUnreadable" };

export type ThreadError =
  | ThreadStillWorking
  | SnoozeTimeInPast
  | SnoozeTimeUnreadable;

// Rules

export type NewThread = {
  id: string;
  projectId: string | null;
  /** The first message; it titles the thread. */
  prompt: string;
  provider: ModelProvider;
};

export function startThread(input: NewThread, now: Date): Thread {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.prompt,
    branch: "main",
    createdAt: now.toISOString(),
    provider: input.provider,
    // The first message is sent once the thread is stored.
    turnCount: 0,
    attachmentCount: 0,
  };
}

/**
 * Asking again: the thread records the provider it now talks to and, if it was parked,
 * returns to active. Refused while the last response is still in flight.
 */
export function continueThread(
  thread: Thread,
  provider: ModelProvider,
  working: boolean,
): Result<Thread, ThreadStillWorking> {
  if (working) return err({ _tag: "ThreadStillWorking", threadId: thread.id });
  return ok({ ...thread, ...ACTIVE, provider });
}

/** The thread with one more question, carrying `attachmentCount` attachments. */
export function countTurn(thread: Thread, attachmentCount: number): Thread {
  return {
    ...thread,
    turnCount: thread.turnCount + 1,
    attachmentCount: thread.attachmentCount + attachmentCount,
  };
}

/**
 * An independent copy of the thread through response `responseIndex`, in the same project. The
 * conversation through that response is copied with it (`forkPoint`); `counts` are
 * that copy's.
 */
export function forkThread(
  thread: Thread,
  through: { responseIndex: number; counts: ConversationCounts },
  id: string,
  now: Date,
): Thread {
  const { responseIndex, counts } = through;
  return {
    ...thread,
    ...ACTIVE,
    ...counts,
    id,
    title: `Fork: ${thread.title.replace(/^Fork: /, "")}`,
    createdAt: now.toISOString(),
    forkedFrom: { threadId: thread.id, title: thread.title, responseIndex },
  };
}

// Input schemas

/** The first message of a new thread. `id` is the chat's, picked by the browser. */
export const startThreadInputSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  prompt: z.string().trim().min(1).max(10_000),
  provider: z.enum(MODEL_PROVIDERS),
});
export type StartThreadInput = z.infer<typeof startThreadInputSchema>;

/** A thread's id as a URL names it (`/api/threads/[id]/messages`). */
export const threadIdSchema = z.uuid();

/**
 * The POST body of /api/threads/[id]/messages: the thread's latest message, which the AI SDK chat
 * transport sends (`prepareSendMessagesRequest` in `ThreadChat`); the URL names the thread. The
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
