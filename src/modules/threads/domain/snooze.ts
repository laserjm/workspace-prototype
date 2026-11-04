import { err, ok, type Result } from "@conventions/nextjs/core";
import type { SnoozeTimeInPast, SnoozeTimeUnreadable } from "./errors";

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
