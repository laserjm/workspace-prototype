// Where a thread sits in the sidebar: active, settled, snoozed until a time, or woken. The
// browser applies these at once (`useThreads`, `useSnoozeWake`), the server with its own clock
// (`placeThreadAction`).
import { err, ok, type Result } from "@/lib/result";
import {
  ACTIVE,
  type SnoozeTimeInPast,
  type SnoozeTimeUnreadable,
  type Thread,
  type ThreadPlacement,
  type ThreadShelf,
  type ThreadStillWorking,
} from "./contracts";

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

export function customSnoozeTime(
  request: CustomSnooze,
  now: Date,
): Result<Date, SnoozeTimeInPast | SnoozeTimeUnreadable> {
  const until =
    request.mode === "date"
      ? new Date(request.localDateTime).getTime()
      : request.minutes.trim()
        ? now.getTime() + Number(request.minutes) * 60_000
        : Number.NaN;
  if (!Number.isFinite(until)) return err({ _tag: "SnoozeTimeUnreadable" });
  if (until <= now.getTime()) return err({ _tag: "SnoozeTimeInPast" });
  return ok(new Date(until));
}
