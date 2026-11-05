// Repository: defineRepository against the port; owner id first and in every query (NX-AUTH-03);
// a violated constraint becomes a ConstraintViolation (NX-DB-05).
import { desc, eq } from "drizzle-orm";
import {
  ConstraintViolation,
  defineRepository,
  type OwnerId,
} from "@conventions/nextjs/core";
import { violatedConstraint } from "@conventions/nextjs/drizzle";
import { db } from "@/lib/db/client";
import { threadsTable } from "@/lib/db/schema";
import type { ThreadRepository } from "../application/ports";
import type { Thread } from "../domain/thread";
import { toThread, toThreadRow } from "./thread.mapper";

export const threadRepository = defineRepository<ThreadRepository>({
  async listByOwner(ownerId: OwnerId): Promise<Thread[]> {
    const rows = await db()
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.ownerId, ownerId))
      .orderBy(desc(threadsTable.createdAt));
    return rows.map(toThread);
  },

  async save(ownerId: OwnerId, thread: Thread): Promise<void> {
    try {
      await db().insert(threadsTable).values(toThreadRow(ownerId, thread));
    } catch (error) {
      const constraint = violatedConstraint(error);
      if (constraint) throw new ConstraintViolation(constraint, "threads");
      throw error;
    }
  },
});
