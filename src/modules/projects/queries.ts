import "server-only";
// The module's reads, straight on Drizzle. Every query names the user's id
// (ARCHITECTURE.md, "Data ownership").
import { and, asc, eq } from "drizzle-orm";
import type { User } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { projectsTable } from "@/lib/db/schema";
import type { Project } from "./contracts";

const columns = { id: projectsTable.id, name: projectsTable.name };

/** The signed-in user's projects, oldest first. */
export async function listProjects(
  user: User,
): Promise<Project[]> {
  return db()
    .select(columns)
    .from(projectsTable)
    .where(eq(projectsTable.userId, user.id))
    .orderBy(asc(projectsTable.createdAt), asc(projectsTable.name));
}

/** One of the user's projects, or null when they have none with this id. */
export async function findProject(
  user: User,
  id: string,
): Promise<Project | null> {
  const [row] = await db()
    .select(columns)
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.userId, user.id),
        eq(projectsTable.id, id),
      ),
    );
  return row ?? null;
}
