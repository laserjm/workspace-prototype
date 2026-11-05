import { err, ok, type Result } from "@conventions/nextjs/core";
import type {
  ScopeHasNoRecords,
  SnoozeTimeInPast,
  ThreadStillWorking,
} from "./errors";

export type ModelProvider = "claude" | "openai";

/** When a response started and, once it has, when it finished. */
export type ResponseTiming = { startedAt: string; completedAt: string | null };

/** The source records a thread may use, by id. The sources module owns what they are. */
export type ThreadScope = { sourceId: string; recordIds: string[] };

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
  scope?: ThreadScope;
};

const ACTIVE: { [K in keyof Required<ThreadPlacement>]: undefined } = {
  settledAt: undefined,
  snoozedUntil: undefined,
  wokeAt: undefined,
};

export function createScope(
  sourceId: string,
  recordIds: readonly string[],
): Result<ThreadScope, ScopeHasNoRecords> {
  if (recordIds.length === 0) return err({ _tag: "ScopeHasNoRecords" });
  return ok({ sourceId, recordIds: [...recordIds] });
}

export function shelfOf(thread: ThreadPlacement): ThreadShelf {
  if (thread.snoozedUntil) return "snoozed";
  return thread.settledAt ? "settled" : "active";
}

export function placementOf(thread: Thread): ThreadPlacement {
  return {
    settledAt: thread.settledAt,
    snoozedUntil: thread.snoozedUntil,
    wokeAt: thread.wokeAt,
  };
}

/** Puts a thread back where it was, e.g. to undo a settle or snooze. */
export function withPlacement(
  thread: Thread,
  placement: ThreadPlacement,
): Thread {
  return { ...thread, ...ACTIVE, ...placement };
}

export function settle(thread: Thread, now: Date): Thread {
  return { ...thread, ...ACTIVE, settledAt: now.toISOString() };
}

/** `working`: a response to this thread is in flight; the chat knows, not the thread. */
export function snooze(
  thread: Thread,
  until: Date,
  now: Date,
  working: boolean,
): Result<Thread, SnoozeTimeInPast | ThreadStillWorking> {
  if (!Number.isFinite(until.getTime()) || until.getTime() <= now.getTime())
    return err({ _tag: "SnoozeTimeInPast" });
  if (working) return err({ _tag: "ThreadStillWorking", threadId: thread.id });
  return ok({ ...thread, ...ACTIVE, snoozedUntil: until.toISOString() });
}

/** Un-settles or wakes a thread by hand. */
export function restore(thread: Thread): Thread {
  return { ...thread, ...ACTIVE };
}

export function isWakeDue(thread: Thread, now: Date) {
  return Boolean(
    thread.snoozedUntil && Date.parse(thread.snoozedUntil) <= now.getTime(),
  );
}

/** A snoozed thread whose time has come returns to active, marked as woken. */
export function wake(thread: Thread, now: Date): Thread {
  return { ...thread, ...ACTIVE, wokeAt: now.toISOString() };
}

/**
 * A thread as it reads at `now`: a snooze whose time has come reads as woken at its deadline.
 * Nothing needs to run at the deadline; the browser wakes an open page's threads live.
 */
export function wakeIfDue(thread: Thread, now: Date): Thread {
  return isWakeDue(thread, now)
    ? wake(thread, new Date(thread.snoozedUntil!))
    : thread;
}

/** Opening a woken thread clears its "Woke" mark. */
export function acknowledgeWake(thread: Thread): Thread {
  return thread.wokeAt ? { ...thread, wokeAt: undefined } : thread;
}

export type NewThread = {
  id: string;
  projectId: string | null;
  /** The first message; it titles the thread. */
  prompt: string;
  provider: ModelProvider;
  scope?: ThreadScope;
};

export function startThread(input: NewThread, now: Date): Thread {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.prompt,
    branch: "main",
    createdAt: now.toISOString(),
    provider: input.provider,
    scope: input.scope
      ? { ...input.scope, recordIds: [...input.scope.recordIds] }
      : undefined,
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

/**
 * An independent copy of the thread through response `responseIndex`, with the same project and
 * scope. The chat copies its messages separately.
 */
export function forkThread(
  thread: Thread,
  responseIndex: number,
  id: string,
  now: Date,
): Thread {
  return {
    ...thread,
    ...ACTIVE,
    id,
    title: `Fork: ${thread.title.replace(/^Fork: /, "")}`,
    createdAt: now.toISOString(),
    scope: thread.scope
      ? { ...thread.scope, recordIds: [...thread.scope.recordIds] }
      : undefined,
    forkedFrom: { threadId: thread.id, title: thread.title, responseIndex },
  };
}
