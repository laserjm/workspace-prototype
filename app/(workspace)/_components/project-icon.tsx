import { ChartNoAxesCombined, Infinity, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

/** Selects a project's icon. Every project created in the app is a `workspace` project. */
export type ProjectKind = "rocket" | "chart" | "conventions" | "automation" | "workspace";

const icon = "size-4 shrink-0";
const letter =
  "inline-flex size-4 shrink-0 items-center justify-center rounded-sm font-mono text-3xs leading-none font-bold";

export function ProjectIcon({
  kind = "workspace",
  className,
}: {
  kind?: ProjectKind;
  className?: string;
}) {
  if (kind === "rocket")
    return (
      <Rocket
        aria-hidden
        strokeWidth={1.8}
        className={cn(icon, "text-fuchsia-500", className)}
      />
    );
  if (kind === "chart")
    return (
      <ChartNoAxesCombined
        aria-hidden
        strokeWidth={1.8}
        className={cn(icon, "text-emerald-600", className)}
      />
    );
  if (kind === "automation")
    return (
      <span
        aria-hidden
        className={cn(letter, "bg-foreground text-background", className)}
      >
        <Infinity size={13} />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cn(
        letter,
        kind === "workspace"
          ? "bg-green-100 text-4xs text-green-600 dark:bg-green-500/15 dark:text-green-300"
          : "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
        className,
      )}
    >
      {kind === "workspace" ? "WP" : "CS"}
    </span>
  );
}
