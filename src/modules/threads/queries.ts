import "server-only";
// The module's reads, straight on Drizzle. Every query names the user's id
// (ARCHITECTURE.md, "Data ownership").
import { and, asc, desc, eq } from "drizzle-orm";
import type { User } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import type { WorkspaceUIMessage } from "@/modules/agent";
import { threadIdSchema, type Thread } from "./contracts";
import { wakeIfDue } from "./placement";
import { toMessage, toThread } from "./rows";

/** The signed-in user's threads, newest first, as they read now: a due snooze has woken. */
export async function listThreads(user: User): Promise<Thread[]> {
  const now = new Date();
  const rows = await db()
    .select()
    .from(threadsTable)
    .where(eq(threadsTable.userId, user.id))
    .orderBy(desc(threadsTable.createdAt));
  return rows.map((row) => wakeIfDue(toThread(row), now));
}

/**
 * One of the user's threads as stored, or null when they have none with this id. A due snooze
 * still reads as snoozed here; a write applies `wakeIfDue` with its own clock.
 */
export async function findThread(
  user: User,
  id: string,
): Promise<Thread | null> {
  const [row] = await db()
    .select()
    .from(threadsTable)
    .where(and(eq(threadsTable.userId, user.id), eq(threadsTable.id, id)));
  return row ? toThread(row) : null;
}

/**
 * The conversation of one of the signed-in user's threads, in order. Empty for a thread they do
 * not have, as for one without messages, and for an id that is not a thread's.
 */
export async function listThreadMessages(
  user: User,
  threadId: string,
): Promise<WorkspaceUIMessage[]> {
  if (!threadIdSchema.safeParse(threadId).success) return [];
  const rows = await db()
    .select()
    .from(threadMessagesTable)
    .where(
      and(
        eq(threadMessagesTable.userId, user.id),
        eq(threadMessagesTable.threadId, threadId),
      ),
    )
    .orderBy(asc(threadMessagesTable.position));
  return rows.map(toMessage);
}
