// Use case: defineUseCase pins (input, deps) => Promise<Result> (NX-LAYER-07, NX-ERR-01).
import {
  bug,
  defineUseCase,
  err,
  notFound,
  type NotFound,
  type ValidationFailed,
} from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import type { Skill } from "@/modules/skills";
import type { Source } from "@/modules/sources";
import type { ChatTurnDto } from "../contracts";
import {
  withLatestMessage,
  type ConversationMessage,
} from "../domain/conversation";
import { continueThread } from "../domain/thread";
import type {
  AttachedRecords,
  GatewayModel,
  ResponseAgent,
  ThreadRepository,
} from "./ports";

export type AnswerThreadInput = ChatTurnDto & { signal?: AbortSignal };

export type AnswerThreadDeps = {
  user: User;
  threads: ThreadRepository;
  models: readonly GatewayModel[];
  skills: readonly Skill[];
  sources: readonly Source[];
  agent: ResponseAgent;
};

/**
 * Answers the latest message of one of the user's threads and stores the conversation once
 * the reply ends. Asking returns a parked thread to active and records the provider it now talks
 * to. The request names the model, skill and records by id; they are resolved here,
 * so the prompt only ever holds what the server offers. The conversation before the message is
 * the stored one, not the browser's.
 */
export const answerThread = defineUseCase<
  AnswerThreadInput,
  Response,
  NotFound | ValidationFailed,
  AnswerThreadDeps
>(async (input, { user, threads, models, skills, sources, agent }) => {
  const model = models.find((item) => item.id === input.modelId);
  if (!model) return err(notFound("Model", input.modelId));

  const skill = input.skillId
    ? skills.find((item) => item.id === input.skillId)
    : undefined;
  if (input.skillId && !skill) return err(notFound("Skill", input.skillId));

  let attached: AttachedRecords | undefined;
  if (input.scope) {
    const { sourceId, recordIds } = input.scope;
    const source = sources.find((item) => item.id === sourceId);
    if (!source) return err(notFound("Source", sourceId));
    const records = source.records.filter((record) =>
      recordIds.includes(record.id),
    );
    // A scope whose records are all gone adds no context, as if none was attached.
    if (records.length > 0)
      attached = { source, records, recordCount: recordIds.length };
  }

  // Another user's thread is answered like a missing one: its id reveals nothing.
  const userId = user.id;
  const thread = await threads.findById(userId, input.id);
  if (!thread) return err(notFound("Thread", input.id));
  // The browser refuses a send while a response is in flight; here nothing is in flight.
  const continued = continueThread(thread, model.provider, false);
  if (!continued.ok) bug("a thread with no response in flight was refused");
  await threads.update(userId, continued.value);
  const stored = await threads.listMessages(userId, thread.id);

  return agent.answer({
    model,
    skill,
    attached,
    messages: withLatestMessage<ConversationMessage>(stored, input.message),
    signal: input.signal,
    onEnd: (messages) => threads.saveMessages(userId, thread.id, messages),
  });
});
