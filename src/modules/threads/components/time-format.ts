// Duration rules adapted from T3 Code's shared/orchestrationTiming.ts (MIT).
export function formatResponseDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0ms";
  if (durationMs < 1_000) return `${Math.max(1, Math.round(durationMs))}ms`;
  if (durationMs < 10_000) return `${Math.round(durationMs / 100) / 10}s`;
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    seconds ? `${seconds}s` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatResponseTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

const ORDINAL_SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

// Match T3's full timestamp tooltip, while always using the requested HH:mm clock.
export function formatResponseTimeTooltip(timestamp: string): string {
  const date = new Date(timestamp);
  const day = date.getDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : (ORDINAL_SUFFIX[day % 10] ?? "th");
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    date,
  );
  return `${formatResponseTime(timestamp)}, ${day}${suffix} ${month} ${date.getFullYear()}`;
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

/** The value of a `datetime-local` input for `date`, in local time. */
export function toLocalDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
