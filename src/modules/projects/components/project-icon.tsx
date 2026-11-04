import { ChartNoAxesCombined, Infinity, Rocket } from "lucide-react";
import type { ProjectKind } from "../domain/project";

export function ProjectIcon({
  kind = "workspace",
  className = "",
}: {
  kind?: ProjectKind;
  className?: string;
}) {
  if (kind === "rocket")
    return (
      <Rocket
        aria-hidden
        className={`project-icon text-fuchsia-500 ${className}`}
      />
    );
  if (kind === "chart")
    return (
      <ChartNoAxesCombined
        aria-hidden
        className={`project-icon text-emerald-600 ${className}`}
      />
    );
  if (kind === "automation")
    return (
      <span
        aria-hidden
        className={`project-letter project-letter-automation ${className}`}
      >
        <Infinity size={13} />
      </span>
    );
  return (
    <span
      aria-hidden
      className={`project-letter ${kind === "workspace" ? "project-letter-workspace" : "project-letter-conventions"} ${className}`}
    >
      {kind === "workspace" ? "WP" : "CS"}
    </span>
  );
}
