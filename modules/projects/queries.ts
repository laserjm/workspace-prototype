import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { projectsTable } from "@/lib/db/schema";
import type { ProjectListItem } from "./contracts";

const columns = { id: projectsTable.id, name: projectsTable.name };

/** The requester's projects, oldest first. */
export async function getProjects(requester: User): Promise<ProjectListItem[]> {
  return db()
    .select(columns)
    .from(projectsTable)
    .where(eq(projectsTable.userId, requester.id))
    .orderBy(asc(projectsTable.createdAt), asc(projectsTable.name));
}

/** One of the requester's projects; null for a missing, foreign or malformed id. */
export async function getProject(
  requester: User,
  id: string,
): Promise<ProjectListItem | null> {
  const projectId = z.uuid().safeParse(id);
  if (!projectId.success) return null;
  const [row] = await db()
    .select(columns)
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.userId, requester.id),
        eq(projectsTable.id, projectId.data),
      ),
    );
  return row ?? null;
}

/** The requester's project with this name, if they have one. */
export async function getProjectByName(
  requester: User,
  name: string,
): Promise<ProjectListItem | null> {
  const [row] = await db()
    .select(columns)
    .from(projectsTable)
    .where(
      and(eq(projectsTable.userId, requester.id), eq(projectsTable.name, name)),
    );
  return row ?? null;
}
