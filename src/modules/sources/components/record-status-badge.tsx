import { cn } from "@/lib/utils";
import type { RecordStatus } from "../domain/source";

const TONES: Record<RecordStatus, string> = {
  "To do":
    "bg-slate-100 text-slate-500 dark:bg-slate-400/10 dark:text-slate-300",
  "In progress":
    "bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300",
  "In review":
    "bg-violet-50 text-violet-500 dark:bg-violet-400/10 dark:text-violet-300",
  Done: "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300",
};

export function RecordStatusBadge({
  status,
  className,
}: {
  status: RecordStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-xs px-1.25 py-0.5 text-4xs leading-normal font-medium whitespace-nowrap",
        TONES[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
