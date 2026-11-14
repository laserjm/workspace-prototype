import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

/** Selects a project's icon. Every project created in the app is a `workspace` project. */
export type ProjectKind =
  "rocket" | "chart" | "conventions" | "automation" | "workspace";

/** A project a user owns. Threads refer to it by `id`. */
export type Project = { id: string; name: string };

export type ProjectNameMissing = { _tag: "ProjectNameMissing" };

export const PROJECT_NAME_MAX_LENGTH = 80;

/** The add-project form. The action trims the name and refuses a blank one. */
export const createProjectInputSchema = z.object({
  name: z.string().max(PROJECT_NAME_MAX_LENGTH),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

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
