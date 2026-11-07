import type { NotFound, ValidationFailed } from "@/lib/errors";
import type { Result } from "@/lib/result";
import type { UserId } from "@/lib/auth/user";
import type { WorkspaceUIMessage } from "@/modules/agent";
import type { AgentRequest, AgentRun } from "@/modules/agent/server";
import type { Thread } from "../contracts";

/** Answers a conversation: `runAgent` from the agent module, a fake in tests. */
export type AnswerAgent = (
  request: AgentRequest,
) => Promise<Result<AgentRun, NotFound | ValidationFailed>>;

/** The signed-in user's threads. Owned methods take the UserId first. */
export type ThreadRepository = {
  /** Newest first. */
  listByUser(userId: UserId): Promise<Thread[]>;
  findById(userId: UserId, id: string): Promise<Thread | null>;
  /**
   * Adds a thread with the conversation it starts with (a fork's copy), in one transaction.
   * Throws a `ConstraintViolation` when its id is taken.
   */
  save(
    userId: UserId,
    thread: Thread,
    messages?: readonly WorkspaceUIMessage[],
  ): Promise<void>;
  /** Stores what changes as a thread is used: its placement and the provider it talks to. */
  update(userId: UserId, thread: Thread): Promise<void>;
  /** The thread's conversation in order; empty for a thread the owner does not have. */
  listMessages(
    userId: UserId,
    threadId: string,
  ): Promise<WorkspaceUIMessage[]>;
  /**
   * Replaces the thread's conversation, in one transaction. Throws a `ConstraintViolation` for a
   * thread the owner does not have.
   */
  saveMessages(
    userId: UserId,
    threadId: string,
    messages: readonly WorkspaceUIMessage[],
  ): Promise<void>;
};
