// Use case: a user forks one of their threads through one of its responses into a new thread.
import {
  defineUseCase,
  err,
  notFound,
  ok,
  type NotFound,
  type OwnerRequester,
} from "@conventions/nextjs/core";
import type { ForkThreadInput } from "../contracts";
import { forkPoint } from "../domain/conversation";
import { forkThread as fork, type Thread } from "../domain/thread";
import type { Clock, ThreadRepository } from "./ports";

export type ForkThreadDeps = {
  requester: OwnerRequester;
  threads: ThreadRepository;
  clock: Clock;
};

/** Stores the fork with a copy of the conversation through the chosen response. */
export const forkThread = defineUseCase<
  ForkThreadInput,
  Thread,
  NotFound,
  ForkThreadDeps
>(async (input, { requester, threads, clock }) => {
  const { ownerId } = requester;
  // Another user's thread is answered like a missing one: its id reveals nothing.
  const thread = await threads.findById(ownerId, input.fromThreadId);
  if (!thread) return err(notFound("Thread", input.fromThreadId));
  const point = forkPoint(
    await threads.listMessages(ownerId, thread.id),
    input.throughMessageId,
  );
  if (!point.ok) return point;
  const forked = fork(thread, point.value.responseIndex, input.id, clock.now());
  await threads.save(ownerId, forked, point.value.messages);
  return ok(forked);
});
