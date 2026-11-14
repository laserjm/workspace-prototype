// What the projects module takes and gives: browser-safe, zod and types only.
import { z } from "zod";

/** A project the user owns. Threads refer to it by `id`. */
export type ProjectListItem = { id: string; name: string };

export const PROJECT_NAME_MAX_LENGTH = 80;

/** The add-project form: a name, trimmed, not blank. */
export const createProjectInput = z.object({
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;
