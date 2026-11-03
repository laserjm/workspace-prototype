import { ChartNoAxesCombined, Infinity, Rocket } from "lucide-react";
import type { ProjectKind } from "./workspace-data";
import { claudePath, linuxPath, openAIPath } from "./provider-paths";

export function ProjectIcon({
  kind,
  className = "",
}: {
  kind: ProjectKind;
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

export function ProviderIcon({
  provider = "claude",
  className = "",
}: {
  provider?: "claude" | "openai";
  className?: string;
}) {
  if (provider === "openai")
    return (
      <svg
        aria-hidden
        viewBox="100 100 411 411"
        fill="currentColor"
        className={`provider-icon provider-openai ${className}`}
      >
        <path d={openAIPath} fillRule="evenodd" clipRule="evenodd" />
      </svg>
    );
  return (
    <svg
      aria-hidden
      viewBox="0 0 256 257"
      className={`provider-icon provider-claude ${className}`}
      fill="currentColor"
    >
      <path d={claudePath} />
    </svg>
  );
}

export function LinuxIcon() {
  return (
    <svg
      aria-hidden
      viewBox="-2 -2 28 28"
      fill="currentColor"
      className="provider-icon"
    >
      <path d={linuxPath} />
    </svg>
  );
}

export function VSCodeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="vscode-icon">
      <path
        fill="#007ACC"
        d="m17.8 1 5.2 2.5v17L17.8 23 7 13.5 2.9 17 1 15.9V8.1L2.9 7 7 10.5 17.8 1Zm0 5.7L10.4 12l7.4 5.3V6.7ZM3 9.5v5l2.8-2.5L3 9.5Z"
      />
    </svg>
  );
}
