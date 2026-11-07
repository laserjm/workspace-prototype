// Repository: defineRepository against the port; the user id first and in every query;
// a violated constraint becomes a ConstraintViolation.
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ConstraintViolation,
  defineRepository,
} from "@conventions/nextjs/core";
import type { UserId } from "@/lib/auth/user";
import { violatedConstraint } from "@conventions/nextjs/drizzle";
import { db, withTransaction } from "@/lib/db/client";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import type { ThreadRepository } from "../application/ports";
import type { Thread } from "../contracts";
import {
  toMessage,
  toMessageRows,
  toThread,
  toThreadChanges,
  toThreadRow,
} from "../rows";

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
  async listByUser(userId: UserId): Promise<Thread[]> {
    const rows = await db()
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.userId, userId))
      .orderBy(desc(threadsTable.createdAt));
    return rows.map(toThread);
  },

  async findById(userId: UserId, id: string): Promise<Thread | null> {
    const [row] = await db()
      .select()
      .from(threadsTable)
      .where(and(eq(threadsTable.userId, userId), eq(threadsTable.id, id)));
    return row ? toThread(row) : null;
  },

  async save(userId: UserId, thread: Thread, messages = []): Promise<void> {
    await writing(() =>
      withTransaction("interactive", async (tx) => {
        await tx.insert(threadsTable).values(toThreadRow(userId, thread));
        if (messages.length > 0)
          await tx
            .insert(threadMessagesTable)
            .values(toMessageRows(userId, thread.id, messages));
      }),
    );
  },

  async update(userId: UserId, thread: Thread): Promise<void> {
    await writing(() =>
      db()
        .update(threadsTable)
        .set(toThreadChanges(thread))
        .where(
          and(
            eq(threadsTable.userId, userId),
            eq(threadsTable.id, thread.id),
          ),
        ),
    );
  },

  async listMessages(userId: UserId, threadId: string) {
    const rows = await db()
      .select()
      .from(threadMessagesTable)
      .where(
        and(
          eq(threadMessagesTable.userId, userId),
          eq(threadMessagesTable.threadId, threadId),
        ),
      )
      .orderBy(asc(threadMessagesTable.position));
    return rows.map(toMessage);
  },

  async saveMessages(userId: UserId, threadId: string, messages) {
    await writing(() =>
      withTransaction("interactive", async (tx) => {
        await tx
          .delete(threadMessagesTable)
          .where(
            and(
              eq(threadMessagesTable.userId, userId),
              eq(threadMessagesTable.threadId, threadId),
            ),
          );
        if (messages.length > 0)
          await tx
            .insert(threadMessagesTable)
            .values(toMessageRows(userId, threadId, messages));
      }),
    );
  },
});
