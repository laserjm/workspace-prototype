import "server-only";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { projectsTable } from "@/lib/db/schema";
import type { CreateProjectInput, ProjectListItem } from "./contracts";
import { getProjectByName } from "./queries";

/**
 * Adds a project by name. A name the requester already uses answers with that project instead,
 * also when a second request added it at the same time.
 */
export async function createProject(
  requester: User,
  input: CreateProjectInput,
): Promise<ProjectListItem> {
  const existing = await getProjectByName(requester, input.name);
  if (existing) return existing;
  try {
    const [created] = await db()
      .insert(projectsTable)
      .values({ userId: requester.id, name: input.name })
      .returning({ id: projectsTable.id, name: projectsTable.name });
    if (!created) throw new Error("The insert returned no project");
    return created;
  } catch (error) {
    // The unique index refused a second insert of the same name: answer with the first.
    if (!isUniqueViolation(error)) throw error;
    const added = await getProjectByName(requester, input.name);
    if (!added) throw error;
    return added;
  }
}
