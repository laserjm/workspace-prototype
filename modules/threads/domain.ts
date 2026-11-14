import "server-only";
// The threads module's rules on the server, pure: the thread a first message starts, a fork, and
// how a conversation grows and forks. The rules read only a message's id, role and attachments,
// so they hold for the chat's messages as they are stored. Where a thread sits is contracts.ts.
import type { ModelProvider } from "@/modules/agent/contracts";
import { ACTIVE, type ConversationCounts, type Thread } from "./contracts";

export type NewThread = {
  id: string;
  projectId: string | null;
  /** The first message; it titles the thread. */
  prompt: string;
  provider: ModelProvider;
};

/** The thread a first message starts, titled by it. */
export function newThread(input: NewThread, now: Date): Thread {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.prompt,
    branch: "main",
    createdAt: now.toISOString(),
    provider: input.provider,
    // The first message is sent once the thread is stored.
    turnCount: 0,
    attachmentCount: 0,
  };
}

/**
 * An independent copy of the thread through response `responseIndex`, in the same project. The
 * conversation through that response is copied with it (`forkPoint`); `counts` are
 * that copy's.
 */
export function forkOf(
  thread: Thread,
  through: { responseIndex: number; counts: ConversationCounts },
  id: string,
  now: Date,
): Thread {
  const { responseIndex, counts } = through;
  return {
    ...thread,
    ...ACTIVE,
    ...counts,
    id,
    title: `Fork: ${thread.title.replace(/^Fork: /, "")}`,
    createdAt: now.toISOString(),
    forkedFrom: { threadId: thread.id, title: thread.title, responseIndex },
  };
}

/** What the conversation rules need of a message; the chat's messages carry more. */
export type ConversationMessage = {
  id: string;
  role: "system" | "user" | "assistant";
};

/**
 * The conversation with `message` as its latest. A new message is appended. A message sent
 * again, as a regenerate does with the last question, takes its old place and drops what came
 * after it, the reply being regenerated included.
 */
export function withLatestMessage<M extends ConversationMessage>(
  messages: readonly M[],
  message: M,
): M[] {
  const index = messages.findIndex((item) => item.id === message.id);
  return [...(index === -1 ? messages : messages.slice(0, index)), message];
}

/**
 * Where a fork starts: the conversation through response `messageId` and which response that is
 * (0 for the first). Only a response can be forked from; anything else is null.
 */
export function forkPoint<M extends ConversationMessage>(
  messages: readonly M[],
  messageId: string,
): { messages: M[]; responseIndex: number } | null {
  const index = messages.findIndex((item) => item.id === messageId);
  if (index === -1 || messages[index]?.role !== "assistant") return null;
  const through = messages.slice(0, index + 1);
  return {
    messages: through,
    responseIndex: through.filter((item) => item.role === "assistant").length - 1,
  };
}

/** The questions in a conversation and the attachments they carry. */
export function conversationCounts(
  messages: readonly (ConversationMessage & {
    metadata?: { attachments?: readonly string[] };
  })[],
): ConversationCounts {
  const questions = messages.filter((message) => message.role === "user");
  return {
    turnCount: questions.length,
    attachmentCount: questions.reduce(
      (count, message) => count + (message.metadata?.attachments?.length ?? 0),
      0,
    ),
  };
}
