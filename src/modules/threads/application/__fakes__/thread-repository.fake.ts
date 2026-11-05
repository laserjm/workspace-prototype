import type { UserId } from "@/lib/auth/user";
import type { WorkspaceUIMessage } from "@/modules/agent";
import type { Thread } from "../../domain/thread";
import type { ThreadRepository } from "../ports";

/** Threads and conversations in memory, kept per owner like the real repository. */
export function inMemoryThreadRepository() {
  const threads = new Map<string, { userId: UserId; thread: Thread }>();
  const conversations = new Map<string, WorkspaceUIMessage[]>();
  const owned = (userId: UserId, id: string) =>
    threads.get(id)?.userId === userId;

  const repository: ThreadRepository = {
    async listByUser(userId) {
      return [...threads.values()]
        .filter((entry) => entry.userId === userId)
        .map((entry) => entry.thread)
        .reverse();
    },
    async findById(userId, id) {
      return owned(userId, id) ? threads.get(id)!.thread : null;
    },
    async save(userId, thread, messages = []) {
      threads.set(thread.id, { userId, thread });
      conversations.set(thread.id, [...messages]);
    },
    async update(userId, thread) {
      if (owned(userId, thread.id))
        threads.set(thread.id, { userId, thread });
    },
    async listMessages(userId, threadId) {
      return owned(userId, threadId)
        ? [...(conversations.get(threadId) ?? [])]
        : [];
    },
    async saveMessages(userId, threadId, messages) {
      if (!owned(userId, threadId)) throw new Error("not the owner's thread");
      conversations.set(threadId, [...messages]);
    },
  };
  const threadOf = (id: string) => threads.get(id)?.thread;
  return { repository, conversations, threadOf };
}
