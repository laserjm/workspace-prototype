import type { OwnerId } from "@conventions/nextjs/core";
import type { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import type { WorkspaceUIMessage } from "../contracts";
import type { ModelProvider, Thread } from "../domain/thread";

type ThreadRow = typeof threadsTable.$inferSelect;
type NewThreadRow = typeof threadsTable.$inferInsert;
type MessageRow = typeof threadMessagesTable.$inferSelect;
type NewMessageRow = typeof threadMessagesTable.$inferInsert;

// Placement (settle, snooze, wake) is not stored yet: a stored thread reads as active.
export function toThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    branch: "main",
    createdAt: row.createdAt.toISOString(),
    provider: row.provider as ModelProvider,
    scope:
      row.sourceId && row.recordIds
        ? { sourceId: row.sourceId, recordIds: row.recordIds }
        : undefined,
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
  };
}

export function toThreadRow(ownerId: OwnerId, thread: Thread): NewThreadRow {
  return {
    id: thread.id,
    ownerId,
    projectId: thread.projectId,
    title: thread.title,
    provider: thread.provider,
    sourceId: thread.scope?.sourceId ?? null,
    recordIds: thread.scope?.recordIds ?? null,
    forkedFromThreadId: thread.forkedFrom?.threadId ?? null,
    forkedFromTitle: thread.forkedFrom?.title ?? null,
    forkedFromResponseIndex: thread.forkedFrom?.responseIndex ?? null,
    createdAt: new Date(thread.createdAt),
  };
}

// The rows hold what the agent validated before it streamed (ai-gateway.response-agent.ts).
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
  ownerId: OwnerId,
  threadId: string,
  messages: readonly WorkspaceUIMessage[],
): NewMessageRow[] {
  return messages.map((message, position) => ({
    threadId,
    ownerId,
    id: message.id,
    position,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata ?? null,
  }));
}
