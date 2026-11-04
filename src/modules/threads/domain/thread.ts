import { err, ok, type Result } from "@conventions/nextjs/core";
import type {
  ResponseNotFinished,
  ScopeHasNoRecords,
  SnoozeTimeInPast,
  ThreadStillWorking,
} from "./errors";

export type ModelProvider = "claude" | "openai";

/** When a response started and, once it has, when it finished. */
export type ResponseTiming = { startedAt: string; completedAt: string | null };

/** The source records a thread may use, by id. The sources module owns what they are. */
export type ThreadScope = { sourceId: string; recordIds: string[] };

export type FollowUp = {
  text: string;
  attachments: string[];
  skillId?: string;
  responseTiming: ResponseTiming;
};

/** Where a thread sits in the sidebar. No field set: active. */
export type ThreadPlacement = {
  settledAt?: string;
  snoozedUntil?: string;
  wokeAt?: string;
};

export type ThreadShelf = "active" | "snoozed" | "settled";

export type Thread = ThreadPlacement & {
  id: string;
  project: string;
  title: string;
  branch: string;
  age: string;
  provider?: ModelProvider;
  prompt?: string;
  attachments?: string[];
  skillId?: string;
  /** The first response; follow-ups carry their own. */
  responseTiming: ResponseTiming;
  followUps?: FollowUp[];
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

/** The timing of response `index`: 0 is the first response, 1 the first follow-up's. */
export function responseTimingAt(thread: Thread, index: number) {
  return index === 0
    ? thread.responseTiming
    : thread.followUps?.[index - 1]?.responseTiming;
}

export function latestResponseTiming(thread: Thread) {
  return thread.followUps?.at(-1)?.responseTiming ?? thread.responseTiming;
}

/** A thread with a source gets responses; it is working until the latest one finishes. */
export function isAwaitingResponse(thread: Thread) {
  return Boolean(
    thread.scope && latestResponseTiming(thread).completedAt === null,
  );
}

export function settle(thread: Thread, now: Date): Thread {
  return { ...thread, ...ACTIVE, settledAt: now.toISOString() };
}

export function snooze(
  thread: Thread,
  until: Date,
  now: Date,
): Result<Thread, SnoozeTimeInPast | ThreadStillWorking> {
  if (!Number.isFinite(until.getTime()) || until.getTime() <= now.getTime())
    return err({ _tag: "SnoozeTimeInPast" });
  if (isAwaitingResponse(thread))
    return err({ _tag: "ThreadStillWorking", threadId: thread.id });
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

/** Opening a woken thread clears its "Woke" mark. */
export function acknowledgeWake(thread: Thread): Thread {
  return thread.wokeAt ? { ...thread, wokeAt: undefined } : thread;
}

export type NewThread = {
  id: string;
  project: string;
  prompt: string;
  attachments: string[];
  provider: ModelProvider;
  skillId?: string;
  scope?: ThreadScope;
};

export function startThread(input: NewThread, now: Date): Thread {
  return {
    id: input.id,
    project: input.project,
    title: input.prompt,
    branch: "main",
    age: "now",
    prompt: input.prompt,
    attachments: input.attachments,
    provider: input.provider,
    responseTiming: { startedAt: now.toISOString(), completedAt: null },
    skillId: input.skillId,
    scope: input.scope
      ? { ...input.scope, recordIds: [...input.scope.recordIds] }
      : undefined,
  };
}

export type NewFollowUp = {
  text: string;
  attachments: string[];
  provider: ModelProvider;
  skillId?: string;
};

/** Asking again returns a parked thread to active. */
export function addFollowUp(
  thread: Thread,
  input: NewFollowUp,
  now: Date,
): Result<Thread, ThreadStillWorking> {
  if (isAwaitingResponse(thread))
    return err({ _tag: "ThreadStillWorking", threadId: thread.id });
  return ok({
    ...thread,
    ...ACTIVE,
    provider: input.provider,
    followUps: [
      ...(thread.followUps ?? []),
      {
        text: input.text,
        attachments: input.attachments,
        responseTiming: { startedAt: now.toISOString(), completedAt: null },
        skillId: input.skillId,
      },
    ],
  });
}

export function completeResponse(
  thread: Thread,
  index: number,
  now: Date,
): Thread {
  const completedAt = now.toISOString();
  if (index === 0)
    return {
      ...thread,
      responseTiming: { ...thread.responseTiming, completedAt },
    };
  return {
    ...thread,
    followUps: thread.followUps?.map((followUp, followUpIndex) =>
      followUpIndex === index - 1
        ? {
            ...followUp,
            responseTiming: { ...followUp.responseTiming, completedAt },
          }
        : followUp,
    ),
  };
}

/** An independent copy of the conversation through response `responseIndex`, same scope. */
export function forkThread(
  thread: Thread,
  responseIndex: number,
  id: string,
): Result<Thread, ResponseNotFinished> {
  if (!responseTimingAt(thread, responseIndex)?.completedAt)
    return err({ _tag: "ResponseNotFinished" });
  return ok({
    ...thread,
    ...ACTIVE,
    id,
    title: `Fork: ${thread.title.replace(/^Fork: /, "")}`,
    age: "now",
    scope: thread.scope
      ? { ...thread.scope, recordIds: [...thread.scope.recordIds] }
      : undefined,
    followUps: thread.followUps?.slice(0, responseIndex),
    forkedFrom: { threadId: thread.id, title: thread.title, responseIndex },
  });
}
