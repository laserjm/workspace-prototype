"use server";
// The module's writes. `action` signs the caller in and validates the input; each handler then
// writes straight on Drizzle, naming the user's id in every query (ARCHITECTURE.md,
// "Data ownership"). Only the actions are exported: every export of this file can be called
// from the browser.
import { and, eq } from "drizzle-orm";
import { action } from "@/lib/actions/server";
import { db } from "@/lib/db/client";
import { violatedConstraint } from "@/lib/db/errors";
import { projectsTable } from "@/lib/db/schema";
import { conflict, type Conflict } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import {
  createProjectInputSchema,
  nameProject,
  type Project,
  type ProjectNameMissing,
} from "./contracts";

const columns = { id: projectsTable.id, name: projectsTable.name };

/** Adds a project by name. A name the user already uses answers with that project instead. */
export const createProjectAction = action(
  createProjectInputSchema,
  async (
    input,
    { user },
  ): Promise<Result<Project, ProjectNameMissing | Conflict>> => {
    const name = nameProject(input.name);
    if (!name.ok) return name;
    const userId = user.id;

    const [existing] = await db()
      .select(columns)
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.userId, userId),
          eq(projectsTable.name, name.value),
        ),
      );
    if (existing) return ok(existing);

    try {
      const [created] = await db()
        .insert(projectsTable)
        .values({ userId, name: name.value })
        .returning(columns);
      return ok(created!);
    } catch (error) {
      // Two requests added the same name at once: the unique index refused the second.
      const constraint = violatedConstraint(error);
      if (constraint) return err(conflict(constraint));
      throw error;
    }
  },
);
