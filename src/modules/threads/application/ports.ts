import type {
  Result,
  ValidationFailed,
} from "@conventions/nextjs/core";
import type { UserId } from "@/lib/auth/user";
import type { Skill } from "@/modules/skills";
import type { Source, SourceRecord } from "@/modules/sources";
import type { WorkspaceUIMessage } from "../contracts";
import type { ModelChoice } from "../domain/model-choice";
import type { Thread } from "../domain/thread";

/** A model the workspace offers, with the id the gateway knows it by. Server-side only. */
export type GatewayModel = ModelChoice & { gateway: string };

/** The records a thread attached, resolved on the server from their ids. */
export type AttachedRecords = {
  source: Source;
  records: SourceRecord[];
  /** How many records the thread named; the label says "5 tickets" even if one is gone. */
  recordCount: number;
};

export type ResponseRequest = {
  model: GatewayModel;
  skill?: Skill;
  attached?: AttachedRecords;
  /** The stored conversation with the message just sent; the agent validates it. */
  messages: unknown[];
  signal?: AbortSignal;
  /**
   * Called once the reply ends, finished, stopped or failed, with the conversation including
   * it. The reply is complete even if the browser went away.
   */
  onEnd(messages: WorkspaceUIMessage[]): Promise<void>;
};

/** Streams the assistant's reply to a thread's conversation. */
export type ResponseAgent = {
  answer(request: ResponseRequest): Promise<Result<Response, ValidationFailed>>;
};

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

/** The user's projects, as the projects module answers for them. */
export type ProjectDirectory = {
  exists(projectId: string): Promise<boolean>;
};

export type Clock = { now(): Date };
