import { err, ok, type Result } from "@conventions/nextjs/core";
import type { ProjectNameMissing } from "./errors";

/** Selects a project's icon. Every project created in the app is a `workspace` project. */
export type ProjectKind =
  "rocket" | "chart" | "conventions" | "automation" | "workspace";

/** A project a user owns. Threads refer to it by `id`. */
export type Project = { id: string; name: string };

export const PROJECT_NAME_MAX_LENGTH = 80;

/** A project's name as stored: trimmed and not blank. */
export function nameProject(name: string): Result<string, ProjectNameMissing> {
  const trimmed = name.trim();
  if (!trimmed) return err({ _tag: "ProjectNameMissing" });
  return ok(trimmed);
}

/** Up to two initials for a project badge: "enterprise-platform" → "EP". */
export function projectInitials(name: string) {
  return name
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
