import "server-only";
// The module's reads. Every query names the requester's id (Rule 2).
import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import type { WorkspaceUIMessage } from "@/modules/agent/contracts";
import { wakeIfDue, type Thread } from "./contracts";
import { toMessage, toThread } from "./mappers";

const questions = sql`${threadMessagesTable.userId} = ${threadsTable.userId}
  and ${threadMessagesTable.threadId} = ${threadsTable.id}
  and ${threadMessagesTable.role} = 'user'`;

/**
 * A thread's columns with what its stored conversation holds, counted in the same read: its
 * questions and their attachments (`conversationCounts` counts the same in the browser).
 */
const threadColumns = {
  ...getTableColumns(threadsTable),
  turnCount: sql<number>`(
    select count(*)::int from ${threadMessagesTable} where ${questions}
  )`.mapWith(Number),
  attachmentCount: sql<number>`(
    select coalesce(sum(
      case when jsonb_typeof(${threadMessagesTable.metadata} -> 'attachments') = 'array'
        then jsonb_array_length(${threadMessagesTable.metadata} -> 'attachments')
        else 0 end
    ), 0)::int
    from ${threadMessagesTable} where ${questions}
  )`.mapWith(Number),
};

/** The requester's threads, newest first, as they read now: a due snooze has woken. */
export async function getThreads(requester: User): Promise<Thread[]> {
  const now = new Date();
  const rows = await db()
    .select(threadColumns)
    .from(threadsTable)
    .where(eq(threadsTable.userId, requester.id))
    .orderBy(desc(threadsTable.createdAt));
  return rows.map((row) => wakeIfDue(toThread(row), now));
}

/**
 * One of the requester's threads as stored; null for a missing, foreign or malformed id. A due
 * snooze still reads as snoozed here; a write applies `wakeIfDue` with its own clock.
 */
export async function getThread(requester: User, id: string): Promise<Thread | null> {
  const threadId = z.uuid().safeParse(id);
  if (!threadId.success) return null;
  const [row] = await db()
    .select(threadColumns)
    .from(threadsTable)
    .where(and(eq(threadsTable.userId, requester.id), eq(threadsTable.id, threadId.data)));
  return row ? toThread(row) : null;
}

/**
 * The conversation of one of the requester's threads, in order. Empty for a thread they do not
 * have, as for one without messages, and for an id that is not a thread's.
 */
export async function getThreadMessages(
  requester: User,
  threadId: string,
): Promise<WorkspaceUIMessage[]> {
  if (!z.uuid().safeParse(threadId).success) return [];
  const rows = await db()
    .select()
    .from(threadMessagesTable)
    .where(
      and(
        eq(threadMessagesTable.userId, requester.id),
        eq(threadMessagesTable.threadId, threadId),
      ),
    )
    .orderBy(asc(threadMessagesTable.position));
  return rows.map(toMessage);
}
