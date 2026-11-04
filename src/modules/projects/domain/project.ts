import { err, ok, type Result } from "@conventions/nextjs/core";
import type { ProjectNameMissing } from "./errors";

/** Selects a project's icon. Every project created in the app is a `workspace` project. */
export type ProjectKind =
  | "rocket"
  | "chart"
  | "conventions"
  | "automation"
  | "workspace";

/** Adds a project by name; a name already in the list is not added twice. */
export function addProject(
  projects: readonly string[],
  name: string,
): Result<{ projects: string[]; name: string }, ProjectNameMissing> {
  const trimmed = name.trim();
  if (!trimmed) return err({ _tag: "ProjectNameMissing" });
  return ok({
    projects: projects.includes(trimmed)
      ? [...projects]
      : [...projects, trimmed],
    name: trimmed,
  });
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
