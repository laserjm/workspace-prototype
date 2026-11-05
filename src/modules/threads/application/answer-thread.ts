import { bug } from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import { notFound, type NotFound, type ValidationFailed } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import type { ChatTurnDto } from "../contracts";
import {
  withLatestMessage,
  type ConversationMessage,
} from "../domain/conversation";
import { continueThread } from "../domain/thread";
import type { AnswerAgent, ThreadRepository } from "./ports";

export type AnswerThreadInput = ChatTurnDto & {
  threadId: string;
  signal?: AbortSignal;
};

export type AnswerThreadDeps = {
  user: User;
  threads: ThreadRepository;
  agent: AnswerAgent;
};

/**
 * Answers the latest message of one of the user's threads and stores the conversation once
 * the reply ends. The conversation before the message is the stored one, not the browser's.
 * Asking returns a parked thread to active and records the provider of the model that answers.
 */
export async function answerThread(
  { threadId, message, signal, ...options }: AnswerThreadInput,
  { user, threads, agent }: AnswerThreadDeps,
): Promise<Result<Response, NotFound | ValidationFailed>> {
  // Another user's thread is answered like a missing one: its id reveals nothing.
  const thread = await threads.findById(user.id, threadId);
  if (!thread) return err(notFound("Thread", threadId));

  const stored = await threads.listMessages(user.id, thread.id);
  const run = await agent({
    options,
    messages: withLatestMessage<ConversationMessage>(stored, message),
    signal,
    onEnd: (messages) => threads.saveMessages(user.id, thread.id, messages),
  });
  if (!run.ok) return run;

  // The browser refuses a send while a response is in flight; here nothing is in flight.
  const continued = continueThread(thread, run.value.model.provider, false);
  if (!continued.ok) bug("a thread with no response in flight was refused");
  await threads.update(user.id, continued.value);
  return ok(run.value.response);
}
