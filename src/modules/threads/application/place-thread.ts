// Use case: a user settles, snoozes, restores or wakes one of their threads, or undoes that.
import {
  bug,
  defineUseCase,
  err,
  notFound,
  ok,
  type NotFound,
  type Result,
} from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import type { PlaceThreadInput, ThreadChange } from "../contracts";
import type { SnoozeTimeInPast } from "../domain/errors";
import {
  acknowledgeWake,
  restore,
  settle,
  snooze,
  wakeIfDue,
  withPlacement,
  type Thread,
} from "../domain/thread";
import type { Clock, ThreadRepository } from "./ports";

export type PlaceThreadDeps = {
  user: User;
  threads: ThreadRepository;
  clock: Clock;
};

function apply(
  thread: Thread,
  change: ThreadChange,
  now: Date,
): Result<Thread, SnoozeTimeInPast> {
  switch (change.kind) {
    case "settle":
      return ok(settle(thread, now));
    case "snooze": {
      // Whether a response is in flight only the browser knows; it refuses that case first.
      const snoozed = snooze(thread, new Date(change.until), now, false);
      if (snoozed.ok) return snoozed;
      if (snoozed.error._tag === "SnoozeTimeInPast") return err(snoozed.error);
      bug("a snooze with no response in flight was refused as working");
    }
    case "restore":
      return ok(restore(thread));
    case "acknowledgeWake":
      return ok(acknowledgeWake(thread));
    case "return":
      return ok(withPlacement(thread, change.placement));
  }
}

/** Applies the change to the thread as it reads now (a due snooze has woken) and stores it. */
export const placeThread = defineUseCase<
  PlaceThreadInput,
  Thread,
  NotFound | SnoozeTimeInPast,
  PlaceThreadDeps
>(async (input, { user, threads, clock }) => {
  const userId = user.id;
  const now = clock.now();
  // Another user's thread is answered like a missing one: its id reveals nothing.
  const thread = await threads.findById(userId, input.threadId);
  if (!thread) return err(notFound("Thread", input.threadId));
  const placed = apply(wakeIfDue(thread, now), input.change, now);
  if (!placed.ok) return placed;
  await threads.update(userId, placed.value);
  return ok(placed.value);
});
