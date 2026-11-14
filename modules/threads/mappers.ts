import "server-only";
// A thread and its messages as the database stores them, and back. A thread's placement is three
// nullable columns, at most one set (`threads_one_placement`).
import type { UserId } from "@/lib/auth";
import type { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import type { ModelProvider, WorkspaceUIMessage } from "@/modules/agent/contracts";
import type { ConversationCounts, ThreadListItem, ThreadPlacement } from "./contracts";

type ThreadRow = typeof threadsTable.$inferSelect;
type NewThreadRow = typeof threadsTable.$inferInsert;
type MessageRow = typeof threadMessagesTable.$inferSelect;
type NewMessageRow = typeof threadMessagesTable.$inferInsert;

/**
 * The thread as stored, with the counts its messages give (`threadColumns`, `queries.ts`); a due
 * snooze still reads as snoozed here (`wakeIfDue`).
 */
export function toThread(row: ThreadRow & ConversationCounts): ThreadListItem {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    branch: "main",
    createdAt: row.createdAt.toISOString(),
    provider: row.provider as ModelProvider,
    forkedFrom:
      row.forkedFromThreadId &&
      row.forkedFromTitle !== null &&
      row.forkedFromResponseIndex !== null
        ? {
            threadId: row.forkedFromThreadId,
            title: row.forkedFromTitle,
            responseIndex: row.forkedFromResponseIndex,
          }
        : undefined,
    turnCount: row.turnCount,
    attachmentCount: row.attachmentCount,
    ...placementOfRow(row),
  };
}

function placementOfRow(row: ThreadRow): ThreadPlacement {
  if (row.settledAt) return { settledAt: row.settledAt.toISOString() };
  if (row.snoozedUntil) return { snoozedUntil: row.snoozedUntil.toISOString() };
  if (row.wokeAt) return { wokeAt: row.wokeAt.toISOString() };
  return {};
}

/** The columns that change as a thread is used. */
export function toThreadChanges(thread: ThreadListItem) {
  return {
    provider: thread.provider,
    settledAt: thread.settledAt ? new Date(thread.settledAt) : null,
    snoozedUntil: thread.snoozedUntil ? new Date(thread.snoozedUntil) : null,
    wokeAt: thread.wokeAt ? new Date(thread.wokeAt) : null,
  } satisfies Partial<NewThreadRow>;
}

export function toThreadRow(userId: UserId, thread: ThreadListItem): NewThreadRow {
  return {
    id: thread.id,
    userId,
    projectId: thread.projectId,
    title: thread.title,
    forkedFromThreadId: thread.forkedFrom?.threadId ?? null,
    forkedFromTitle: thread.forkedFrom?.title ?? null,
    forkedFromResponseIndex: thread.forkedFrom?.responseIndex ?? null,
    ...toThreadChanges(thread),
    createdAt: new Date(thread.createdAt),
  };
}

// The rows hold what the agent validated before it streamed (runAgent, modules/agent/run.ts).
export function toMessage(row: MessageRow): WorkspaceUIMessage {
  return {
    id: row.id,
    role: row.role as WorkspaceUIMessage["role"],
    parts: row.parts as WorkspaceUIMessage["parts"],
    ...(row.metadata
      ? { metadata: row.metadata as WorkspaceUIMessage["metadata"] }
      : {}),
  };
}

export function toMessageRows(
  userId: UserId,
  threadId: string,
  messages: readonly WorkspaceUIMessage[],
): NewMessageRow[] {
  return messages.map((message, position) => ({
    threadId,
    userId,
    id: message.id,
    position,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata ?? null,
  }));
}
