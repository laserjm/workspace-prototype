import "server-only";
// The module's reads, straight on Drizzle. Every query names the requester's owner id
// (ARCHITECTURE.md, "Data ownership").
import { and, asc, eq } from "drizzle-orm";
import type { OwnerRequester } from "@conventions/nextjs/core";
import { db } from "@/lib/db/client";
import { projectsTable } from "@/lib/db/schema";
import type { Project } from "./contracts";

const columns = { id: projectsTable.id, name: projectsTable.name };

/** The signed-in user's projects, oldest first. */
export async function listProjects(
  requester: OwnerRequester,
): Promise<Project[]> {
  return db()
    .select(columns)
    .from(projectsTable)
    .where(eq(projectsTable.ownerId, requester.ownerId))
    .orderBy(asc(projectsTable.createdAt), asc(projectsTable.name));
}

/** One of the user's projects, or null when they have none with this id. */
export async function findProject(
  requester: OwnerRequester,
  id: string,
): Promise<Project | null> {
  const [row] = await db()
    .select(columns)
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.ownerId, requester.ownerId),
        eq(projectsTable.id, id),
      ),
    );
  return row ?? null;
}
