// What the threads module takes and gives: the thread, where it sits in the sidebar, and the input
// schemas of its actions and its chat route. Browser-safe: zod and types, and the pure rules the
// browser runs too, to show a change at once (docs/adr/0007). How a conversation grows and forks
// is server-side, in domain.ts.
import { z } from "zod";
import type { ModelProvider } from "@/modules/agent/contracts";

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
export type ThreadListItem = ThreadPlacement & {
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

// Rules

/**
 * Asking again: the thread records the provider it now talks to and, if it was parked, returns to
 * active. The browser asks only when no response is in flight.
 */
export function continueThread(thread: ThreadListItem, provider: ModelProvider): ThreadListItem {
  return { ...thread, ...ACTIVE, provider };
}

/** The thread with one more question, carrying `attachmentCount` attachments. */
export function countTurn(thread: ThreadListItem, attachmentCount: number): ThreadListItem {
  return {
    ...thread,
    turnCount: thread.turnCount + 1,
    attachmentCount: thread.attachmentCount + attachmentCount,
  };
}

// Input schemas

/**
 * The agent's model providers, repeated because contracts.ts takes only types from another
 * module; `satisfies` keeps every one of them the agent's.
 */
const MODEL_PROVIDERS = ["claude", "openai"] as const satisfies readonly ModelProvider[];

/** The first message of a new thread. `id` is the chat's, picked by the browser. */
export const startThreadInput = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  prompt: z.string().trim().min(1).max(10_000),
  provider: z.enum(MODEL_PROVIDERS),
});
export type StartThreadInput = z.infer<typeof startThreadInput>;

/**
 * The thread's part of the POST body of /api/threads/[id]/messages: its latest message, which the
 * AI SDK chat transport sends (`prepareSendMessagesRequest` in `useThreadChat`); the URL names the
 * thread and the agent's `chatOptionsInput` reads the rest of the body. The server holds the rest
 * of the conversation, so a browser cannot rewrite it. The message is validated with the
 * conversation against the agent's tools.
 */
export const answerThreadInput = z.object({
  message: z.looseObject({
    id: z.string().min(1).max(200),
    role: z.literal("user"),
  }),
});
export type AnswerThreadInput = z.infer<typeof answerThreadInput>;

/** A fork of `fromThreadId` through one of its responses. `id` is the fork's, picked by the browser. */
export const forkThreadInput = z.object({
  fromThreadId: z.uuid(),
  id: z.uuid(),
  throughMessageId: z.string().min(1).max(200),
});
export type ForkThreadInput = z.infer<typeof forkThreadInput>;

const isoTimestampSchema = z.iso.datetime({ offset: true });

/** Where a thread sat before a change, for the undo: active, settled, snoozed or woken. */
const threadPlacementSchema = z
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
export const placeThreadInput = z.object({
  threadId: z.uuid(),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("settle") }),
    z.object({ kind: z.literal("snooze"), until: isoTimestampSchema }),
    z.object({ kind: z.literal("restore") }),
    z.object({ kind: z.literal("acknowledgeWake") }),
    z.object({ kind: z.literal("return"), placement: threadPlacementSchema }),
  ]),
});
export type PlaceThreadInput = z.infer<typeof placeThreadInput>;
export type ThreadChange = PlaceThreadInput["change"];

// Placement: where a thread sits in the sidebar, active, settled, snoozed until a time, or woken.
// The browser applies these at once (`useThreads`, `useSnoozeWake`), the server with its own clock
// (`placeThread`).

export function shelfOf(thread: ThreadPlacement): ThreadShelf {
  if (thread.snoozedUntil) return "snoozed";
  return thread.settledAt ? "settled" : "active";
}

export function placementOf(thread: ThreadListItem): ThreadPlacement {
  return {
    settledAt: thread.settledAt,
    snoozedUntil: thread.snoozedUntil,
    wokeAt: thread.wokeAt,
  };
}

/** Puts a thread back where it was, e.g. to undo a settle or snooze. */
export function withPlacement(
  thread: ThreadListItem,
  placement: ThreadPlacement,
): ThreadListItem {
  return { ...thread, ...ACTIVE, ...placement };
}

export function settle(thread: ThreadListItem, now: Date): ThreadListItem {
  return { ...thread, ...ACTIVE, settledAt: now.toISOString() };
}

/**
 * Why a thread cannot be snoozed until `until`: the time has passed, or a response to it is in
 * flight (`working`; the chat knows, not the thread). Nothing when it can.
 */
export function snoozeRefusal(
  until: Date,
  now: Date,
  working: boolean,
): "time-in-past" | "still-working" | undefined {
  if (!Number.isFinite(until.getTime()) || until.getTime() <= now.getTime())
    return "time-in-past";
  if (working) return "still-working";
  return undefined;
}

/** The thread snoozed until `until`; check `snoozeRefusal` first. */
export function snooze(thread: ThreadListItem, until: Date): ThreadListItem {
  return { ...thread, ...ACTIVE, snoozedUntil: until.toISOString() };
}

/** Un-settles or wakes a thread by hand. */
export function restore(thread: ThreadListItem): ThreadListItem {
  return { ...thread, ...ACTIVE };
}

export function isWakeDue(thread: ThreadListItem, now: Date) {
  return Boolean(
    thread.snoozedUntil && Date.parse(thread.snoozedUntil) <= now.getTime(),
  );
}

/** A snoozed thread whose time has come returns to active, marked as woken. */
export function wake(thread: ThreadListItem, now: Date): ThreadListItem {
  return { ...thread, ...ACTIVE, wokeAt: now.toISOString() };
}

/**
 * A thread as it reads at `now`: a snooze whose time has come reads as woken at its deadline.
 * Nothing needs to run at the deadline; the browser wakes an open page's threads live.
 */
export function wakeIfDue(thread: ThreadListItem, now: Date): ThreadListItem {
  return thread.snoozedUntil && isWakeDue(thread, now)
    ? wake(thread, new Date(thread.snoozedUntil))
    : thread;
}

/** Opening a woken thread clears its "Woke" mark. */
export function acknowledgeWake(thread: ThreadListItem): ThreadListItem {
  return thread.wokeAt ? { ...thread, wokeAt: undefined } : thread;
}

// Snooze times

export type SnoozePreset = {
  id: "minute" | "hour" | "tomorrow" | "monday";
  label: string;
  until: Date;
};

/** In 1 minute, in 1 hour, tomorrow at 09:00, next Monday at 09:00, in local time. */
export function snoozePresets(now: Date): SnoozePreset[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextMonday = new Date(now);
  nextMonday.setDate(
    nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7),
  );
  nextMonday.setHours(9, 0, 0, 0);
  return [
    {
      id: "minute",
      label: "In 1 minute",
      until: new Date(now.getTime() + 60_000),
    },
    {
      id: "hour",
      label: "In 1 hour",
      until: new Date(now.getTime() + 3_600_000),
    },
    { id: "tomorrow", label: "Tomorrow", until: tomorrow },
    { id: "monday", label: "Next week", until: nextMonday },
  ];
}

/** A custom snooze as typed: a local date-time (`2026-11-04T09:30`) or a number of minutes. */
export type CustomSnooze =
  | { mode: "date"; localDateTime: string }
  | { mode: "duration"; minutes: string };

/** The time a custom snooze names; nothing when it cannot be read. Check `snoozeRefusal` next. */
export function customSnoozeTime(request: CustomSnooze, now: Date): Date | undefined {
  const until =
    request.mode === "date"
      ? new Date(request.localDateTime).getTime()
      : request.minutes.trim()
        ? now.getTime() + Number(request.minutes) * 60_000
        : Number.NaN;
  return Number.isFinite(until) ? new Date(until) : undefined;
}
