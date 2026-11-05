// Repository: defineRepository against the port; owner id first and in every query (NX-AUTH-03);
// a violated constraint becomes a ConstraintViolation (NX-DB-05).
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ConstraintViolation,
  defineRepository,
  type OwnerId,
} from "@conventions/nextjs/core";
import { violatedConstraint } from "@conventions/nextjs/drizzle";
import { db, withTransaction } from "@/lib/db/client";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import type { ThreadRepository } from "../application/ports";
import type { Thread } from "../domain/thread";
import {
  toMessage,
  toMessageRows,
  toThread,
  toThreadChanges,
  toThreadRow,
} from "./thread.mapper";

/** Runs a write; a violated constraint becomes a `ConstraintViolation`. */
async function writing<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const constraint = violatedConstraint(error);
    if (constraint) throw new ConstraintViolation(constraint, "threads");
    throw error;
  }
}

export const threadRepository = defineRepository<ThreadRepository>({
  async listByOwner(ownerId: OwnerId): Promise<Thread[]> {
    const rows = await db()
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.ownerId, ownerId))
      .orderBy(desc(threadsTable.createdAt));
    return rows.map(toThread);
  },

  async findById(ownerId: OwnerId, id: string): Promise<Thread | null> {
    const [row] = await db()
      .select()
      .from(threadsTable)
      .where(and(eq(threadsTable.ownerId, ownerId), eq(threadsTable.id, id)));
    return row ? toThread(row) : null;
  },

  async save(ownerId: OwnerId, thread: Thread, messages = []): Promise<void> {
    await writing(() =>
      withTransaction("interactive", async (tx) => {
        await tx.insert(threadsTable).values(toThreadRow(ownerId, thread));
        if (messages.length > 0)
          await tx
            .insert(threadMessagesTable)
            .values(toMessageRows(ownerId, thread.id, messages));
      }),
    );
  },

  async update(ownerId: OwnerId, thread: Thread): Promise<void> {
    await writing(() =>
      db()
        .update(threadsTable)
        .set(toThreadChanges(thread))
        .where(
          and(
            eq(threadsTable.ownerId, ownerId),
            eq(threadsTable.id, thread.id),
          ),
        ),
    );
  },

  async listMessages(ownerId: OwnerId, threadId: string) {
    const rows = await db()
      .select()
      .from(threadMessagesTable)
      .where(
        and(
          eq(threadMessagesTable.ownerId, ownerId),
          eq(threadMessagesTable.threadId, threadId),
        ),
      )
      .orderBy(asc(threadMessagesTable.position));
    return rows.map(toMessage);
  },

  async saveMessages(ownerId: OwnerId, threadId: string, messages) {
    await writing(() =>
      withTransaction("interactive", async (tx) => {
        await tx
          .delete(threadMessagesTable)
          .where(
            and(
              eq(threadMessagesTable.ownerId, ownerId),
              eq(threadMessagesTable.threadId, threadId),
            ),
          );
        if (messages.length > 0)
          await tx
            .insert(threadMessagesTable)
            .values(toMessageRows(ownerId, threadId, messages));
      }),
    );
  },
});
