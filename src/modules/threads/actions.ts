"use server";
// The module's writes. `action` signs the caller in and validates the input; each handler then
// writes straight on Drizzle, naming the user's id in every query (ARCHITECTURE.md,
// "Data ownership"). Only the actions are exported: every export of this file can be called
// from the browser. The server applies a change with its own clock, so the browser cannot date
// one.
import { and, eq } from "drizzle-orm";
import { action } from "@/lib/actions/server";
import { db, withTransaction } from "@/lib/db/client";
import { violatedConstraint } from "@/lib/db/errors";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import {
  bug,
  conflict,
  notFound,
  type Conflict,
  type NotFound,
} from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { findProject } from "@/modules/projects/server";
import {
  createScope,
  forkThread,
  forkThreadInputSchema,
  placeThreadInputSchema,
  startThread,
  startThreadInputSchema,
  type ScopeHasNoRecords,
  type SnoozeTimeInPast,
  type Thread,
  type ThreadChange,
} from "./contracts";
import { forkPoint } from "./conversation";
import {
  acknowledgeWake,
  restore,
  settle,
  snooze,
  wakeIfDue,
  withPlacement,
} from "./placement";
import { findThread, listThreadMessages } from "./queries";
import { toMessageRows, toThreadChanges, toThreadRow } from "./rows";

/**
 * Stores the new thread the user's first message starts, in one of their projects or in none.
 * The browser sends the message once this answers.
 */
export const startThreadAction = action(
  startThreadInputSchema,
  async (
    input,
    { user },
  ): Promise<Result<Thread, NotFound | ScopeHasNoRecords | Conflict>> => {
    // Another user's project is answered like a missing one: its id reveals nothing.
    if (input.projectId && !(await findProject(user, input.projectId)))
      return err(notFound("Project", input.projectId));
    const scope = input.scope
      ? createScope(input.scope.sourceId, input.scope.recordIds)
      : undefined;
    if (scope && !scope.ok) return scope;

    const thread = startThread({ ...input, scope: scope?.value }, new Date());
    try {
      await db().insert(threadsTable).values(toThreadRow(user.id, thread));
    } catch (error) {
      // The id is taken: a resent first message, or another user's thread.
      const constraint = violatedConstraint(error);
      if (constraint) return err(conflict(constraint));
      throw error;
    }
    return ok(thread);
  },
);

/** Stores a fork of one of the user's threads, with its conversation through the chosen response. */
export const forkThreadAction = action(
  forkThreadInputSchema,
  async (input, { user }): Promise<Result<Thread, NotFound | Conflict>> => {
    // Another user's thread is answered like a missing one: its id reveals nothing.
    const thread = await findThread(user, input.fromThreadId);
    if (!thread) return err(notFound("Thread", input.fromThreadId));
    const point = forkPoint(
      await listThreadMessages(user, thread.id),
      input.throughMessageId,
    );
    if (!point.ok) return point;

    const fork = forkThread(
      thread,
      point.value.responseIndex,
      input.id,
      new Date(),
    );
    try {
      await withTransaction("interactive", async (tx) => {
        await tx.insert(threadsTable).values(toThreadRow(user.id, fork));
        await tx
          .insert(threadMessagesTable)
          .values(toMessageRows(user.id, fork.id, point.value.messages));
      });
    } catch (error) {
      // The fork's id is taken: a resent fork, or another user's thread.
      const constraint = violatedConstraint(error);
      if (constraint) return err(conflict(constraint));
      throw error;
    }
    return ok(fork);
  },
);

/**
 * Settles, snoozes, restores or wakes one of the user's threads, or undoes that. The change
 * applies to the thread as it reads now: a due snooze has woken.
 */
export const placeThreadAction = action(
  placeThreadInputSchema,
  async (
    input,
    { user },
  ): Promise<Result<Thread, NotFound | SnoozeTimeInPast>> => {
    const now = new Date();
    // Another user's thread is answered like a missing one: its id reveals nothing.
    const thread = await findThread(user, input.threadId);
    if (!thread) return err(notFound("Thread", input.threadId));
    const placed = apply(wakeIfDue(thread, now), input.change, now);
    if (!placed.ok) return placed;

    await db()
      .update(threadsTable)
      .set(toThreadChanges(placed.value))
      .where(
        and(eq(threadsTable.userId, user.id), eq(threadsTable.id, thread.id)),
      );
    return ok(placed.value);
  },
);

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
