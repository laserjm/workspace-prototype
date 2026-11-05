// Repository: defineRepository against the port; owner id first and in every query (NX-AUTH-03);
// a violated constraint becomes a ConstraintViolation (NX-DB-05).
import { and, asc, eq } from "drizzle-orm";
import {
  ConstraintViolation,
  defineRepository,
  type OwnerId,
} from "@conventions/nextjs/core";
import { violatedConstraint } from "@conventions/nextjs/drizzle";
import { db } from "@/lib/db/client";
import { projectsTable } from "@/lib/db/schema";
import type { ProjectRepository } from "../application/ports";
import type { Project } from "../domain/project";

const columns = { id: projectsTable.id, name: projectsTable.name };

export const projectRepository = defineRepository<ProjectRepository>({
  async listByOwner(ownerId: OwnerId): Promise<Project[]> {
    return db()
      .select(columns)
      .from(projectsTable)
      .where(eq(projectsTable.ownerId, ownerId))
      .orderBy(asc(projectsTable.createdAt), asc(projectsTable.name));
  },

  async findById(ownerId: OwnerId, id: string): Promise<Project | null> {
    const [row] = await db()
      .select(columns)
      .from(projectsTable)
      .where(and(eq(projectsTable.ownerId, ownerId), eq(projectsTable.id, id)));
    return row ?? null;
  },

  async findByName(ownerId: OwnerId, name: string): Promise<Project | null> {
    const [row] = await db()
      .select(columns)
      .from(projectsTable)
      .where(
        and(eq(projectsTable.ownerId, ownerId), eq(projectsTable.name, name)),
      );
    return row ?? null;
  },

  async save(ownerId: OwnerId, name: string): Promise<Project> {
    try {
      const [row] = await db()
        .insert(projectsTable)
        .values({ ownerId, name })
        .returning(columns);
      return row!;
    } catch (error) {
      const constraint = violatedConstraint(error);
      if (constraint) throw new ConstraintViolation(constraint, "projects");
      throw error;
    }
  },
});
