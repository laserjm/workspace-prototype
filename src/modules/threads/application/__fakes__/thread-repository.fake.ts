import type { OwnerId } from "@conventions/nextjs/core";
import type { WorkspaceUIMessage } from "../../contracts";
import type { Thread } from "../../domain/thread";
import type { ThreadRepository } from "../ports";

/** Threads and conversations in memory, kept per owner like the real repository. */
export function inMemoryThreadRepository() {
  const threads = new Map<string, { ownerId: OwnerId; thread: Thread }>();
  const conversations = new Map<string, WorkspaceUIMessage[]>();
  const owned = (ownerId: OwnerId, id: string) =>
    threads.get(id)?.ownerId === ownerId;

  const repository: ThreadRepository = {
    async listByOwner(ownerId) {
      return [...threads.values()]
        .filter((entry) => entry.ownerId === ownerId)
        .map((entry) => entry.thread)
        .reverse();
    },
    async findById(ownerId, id) {
      return owned(ownerId, id) ? threads.get(id)!.thread : null;
    },
    async save(ownerId, thread, messages = []) {
      threads.set(thread.id, { ownerId, thread });
      conversations.set(thread.id, [...messages]);
    },
    async update(ownerId, thread) {
      if (owned(ownerId, thread.id))
        threads.set(thread.id, { ownerId, thread });
    },
    async listMessages(ownerId, threadId) {
      return owned(ownerId, threadId)
        ? [...(conversations.get(threadId) ?? [])]
        : [];
    },
    async saveMessages(ownerId, threadId, messages) {
      if (!owned(ownerId, threadId)) throw new Error("not the owner's thread");
      conversations.set(threadId, [...messages]);
    },
  };
  const threadOf = (id: string) => threads.get(id)?.thread;
  return { repository, conversations, threadOf };
}
