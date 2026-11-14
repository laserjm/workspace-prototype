import "server-only";
// The module's writes. Every write names the requester's id (Rule 2); the server applies a change
// with its own clock, so the browser cannot date one.
import { and, eq } from "drizzle-orm";
import type { User } from "@/lib/auth";
import { db, withTransaction } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import { runAgent, type AgentRun, type AgentServices } from "@/modules/agent/commands";
import type { ChatOptions, WorkspaceUIMessage } from "@/modules/agent/contracts";
import { getProject } from "@/modules/projects/queries";
import { getForeignConnectionIds } from "@/modules/records/queries";
import {
  acknowledgeWake,
  continueThread,
  restore,
  settle,
  snooze,
  snoozeRefusal,
  wakeIfDue,
  withPlacement,
  type AnswerThreadInput,
  type ForkThreadInput,
  type PlaceThreadInput,
  type StartThreadInput,
  type ThreadListItem,
  type ThreadChange,
} from "./contracts";
import {
  conversationCounts,
  forkOf,
  forkPoint,
  newThread,
  withLatestMessage,
  type ConversationMessage,
} from "./domain";
import {
  ForeignConnectionAttached,
  ProjectNotFound,
  ResponseNotFound,
  SnoozeTimeInPast,
  ThreadIdTaken,
  ThreadNotFound,
} from "./errors";
import { toMessageRows, toThreadChanges, toThreadRow } from "./mappers";
import { getThread, getThreadMessages } from "./queries";

/**
 * Stores the new thread the requester's first message starts, in one of their projects or in
 * none. The browser sends the message once this answers.
 */
export async function startThread(requester: User, input: StartThreadInput): Promise<ThreadListItem> {
  // Another user's project is answered like a missing one: its id reveals nothing.
  if (input.projectId && !(await getProject(requester, input.projectId)))
    throw new ProjectNotFound(input.projectId);
  const thread = newThread(input, new Date());
  try {
    await db().insert(threadsTable).values(toThreadRow(requester.id, thread));
  } catch (error) {
    // The id is taken: a resent first message, or another user's thread.
    if (isUniqueViolation(error)) throw new ThreadIdTaken(thread.id);
    throw error;
  }
  return thread;
}

/** Stores a fork of one of the requester's threads, with its conversation through the chosen response. */
export async function forkThread(requester: User, input: ForkThreadInput): Promise<ThreadListItem> {
  // Another user's thread is answered like a missing one: its id reveals nothing.
  const thread = await getThread(requester, input.fromThreadId);
  if (!thread) throw new ThreadNotFound(input.fromThreadId);
  const point = forkPoint(
    (await getThreadMessages(requester, thread.id)) ?? [],
    input.throughMessageId,
  );
  if (!point) throw new ResponseNotFound(input.throughMessageId);

  const fork = forkOf(
    thread,
    { responseIndex: point.responseIndex, counts: conversationCounts(point.messages) },
    input.id,
    new Date(),
  );
  try {
    await withTransaction(async (tx) => {
      await tx.insert(threadsTable).values(toThreadRow(requester.id, fork));
      await tx
        .insert(threadMessagesTable)
        .values(toMessageRows(requester.id, fork.id, point.messages));
    });
  } catch (error) {
    // The fork's id is taken: a resent fork, or another user's thread.
    if (isUniqueViolation(error)) throw new ThreadIdTaken(fork.id);
    throw error;
  }
  return fork;
}

/**
 * Settles, snoozes, restores or wakes one of the requester's threads, or undoes that. The change
 * applies to the thread as it reads now: a due snooze has woken.
 */
export async function placeThread(requester: User, input: PlaceThreadInput): Promise<ThreadListItem> {
  const now = new Date();
  // Another user's thread is answered like a missing one: its id reveals nothing.
  const thread = await getThread(requester, input.threadId);
  if (!thread) throw new ThreadNotFound(input.threadId);
  const placed = apply(wakeIfDue(thread, now), input.change, now);

  await db()
    .update(threadsTable)
    .set(toThreadChanges(placed))
    .where(and(eq(threadsTable.userId, requester.id), eq(threadsTable.id, thread.id)));
  return placed;
}

function apply(thread: ThreadListItem, change: ThreadChange, now: Date): ThreadListItem {
  switch (change.kind) {
    case "settle":
      return settle(thread, now);
    case "snooze": {
      const until = new Date(change.until);
      // Whether a response is in flight only the browser knows; it refuses that case first.
      if (snoozeRefusal(until, now, false)) throw new SnoozeTimeInPast(change.until);
      return snooze(thread, until);
    }
    case "restore":
      return restore(thread);
    case "acknowledgeWake":
      return acknowledgeWake(thread);
    case "return":
      return withPlacement(thread, change.placement);
  }
}

/** What one answer to a thread needs besides the requester: the browser's latest message and options. */
export type AnswerThreadRequest = AnswerThreadInput & {
  options: ChatOptions;
  signal?: AbortSignal;
};

/**
 * The next response of one of the requester's threads, streamed, and the conversation stored when
 * it ends. The agent gets the stored conversation with the browser's latest message, not the
 * browser's conversation. Once the agent accepts, a parked thread returns to active and records
 * the provider of the model that answers. Throws `ThreadNotFound` for another user's thread, a
 * missing one or an id that is not a uuid; `ForeignConnectionAttached` for a new question that
 * attaches a connection that is not the requester's; and the agent's errors.
 */
export async function answerThread(
  requester: User,
  threadId: string,
  { message, options, signal }: AnswerThreadRequest,
  services: AgentServices,
): Promise<AgentRun> {
  const thread = await getThread(requester, threadId);
  if (!thread) throw new ThreadNotFound(threadId);
  const stored = (await getThreadMessages(requester, thread.id)) ?? [];
  // A new question may attach only the requester's connections. One the thread already holds,
  // sent again by Try again, is answered: a connection removed since is skipped by the agent.
  const isNew = !stored.some((storedMessage) => storedMessage.id === message.id);
  const foreign = isNew ? await getForeignConnectionIds(requester, message) : [];
  if (foreign.length > 0) throw new ForeignConnectionAttached(foreign);
  const run = await runAgent(
    requester,
    {
      options,
      messages: withLatestMessage<ConversationMessage>(stored, message),
      signal,
      onEnd: (messages) => saveConversation(requester, thread.id, messages),
    },
    services,
  );

  // The browser refuses a send while a response is in flight; here nothing is in flight.
  await db()
    .update(threadsTable)
    .set(toThreadChanges(continueThread(thread, run.model.provider)))
    .where(and(eq(threadsTable.userId, requester.id), eq(threadsTable.id, thread.id)));
  return run;
}

/**
 * Replaces the stored conversation of one of the requester's threads, in one transaction: what a
 * reply ends with, regenerate included. The message reference refuses a thread the requester does
 * not have.
 */
export async function saveConversation(
  requester: User,
  threadId: string,
  messages: readonly WorkspaceUIMessage[],
): Promise<void> {
  await withTransaction(async (tx) => {
    await tx
      .delete(threadMessagesTable)
      .where(
        and(
          eq(threadMessagesTable.userId, requester.id),
          eq(threadMessagesTable.threadId, threadId),
        ),
      );
    if (messages.length > 0)
      await tx.insert(threadMessagesTable).values(toMessageRows(requester.id, threadId, messages));
  });
}
