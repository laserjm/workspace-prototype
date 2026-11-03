import type { Thread } from "./workspace-data";

export type ThreadShelf = "active" | "snoozed" | "settled";
export type ThreadPlacement = Pick<
  Thread,
  "settledAt" | "snoozedUntil" | "wokeAt"
>;

export function threadShelf(thread: Thread): ThreadShelf {
  if (thread.snoozedUntil) return "snoozed";
  return thread.settledAt ? "settled" : "active";
}

export function isThreadWorking(thread: Thread) {
  const timing =
    thread.followUps?.at(-1)?.responseTiming ?? thread.responseTiming;
  return Boolean(thread.scope && timing.completedAt === null);
}

export function formatWakeTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function snoozePresets(now: Date) {
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

export function toLocalDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
