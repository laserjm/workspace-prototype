// Use case: a user forks one of their threads through one of its responses into a new thread.
import {
  defineUseCase,
  err,
  notFound,
  ok,
  type NotFound,
} from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import type { ForkThreadInput } from "../contracts";
import { forkPoint } from "../domain/conversation";
import { forkThread as fork, type Thread } from "../domain/thread";
import type { Clock, ThreadRepository } from "./ports";

export type ForkThreadDeps = {
  user: User;
  threads: ThreadRepository;
  clock: Clock;
};

/** Stores the fork with a copy of the conversation through the chosen response. */
export const forkThread = defineUseCase<
  ForkThreadInput,
  Thread,
  NotFound,
  ForkThreadDeps
>(async (input, { user, threads, clock }) => {
  const userId = user.id;
  // Another user's thread is answered like a missing one: its id reveals nothing.
  const thread = await threads.findById(userId, input.fromThreadId);
  if (!thread) return err(notFound("Thread", input.fromThreadId));
  const point = forkPoint(
    await threads.listMessages(userId, thread.id),
    input.throughMessageId,
  );
  if (!point.ok) return point;
  const forked = fork(thread, point.value.responseIndex, input.id, clock.now());
  await threads.save(userId, forked, point.value.messages);
  return ok(forked);
});
