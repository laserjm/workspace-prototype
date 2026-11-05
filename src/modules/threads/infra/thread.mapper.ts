import type { OwnerId } from "@conventions/nextjs/core";
import type { threadsTable } from "@/lib/db/schema";
import type { ModelProvider, Thread } from "../domain/thread";

type ThreadRow = typeof threadsTable.$inferSelect;
type NewThreadRow = typeof threadsTable.$inferInsert;

// Placement (settle, snooze, wake) and forks are not stored yet: a stored thread reads as active.
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
    createdAt: new Date(thread.createdAt),
  };
}
