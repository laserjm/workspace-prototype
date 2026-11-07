import "server-only";
// POST /api/threads/[id]/messages: the next response of one of the user's threads, streamed, and
// the conversation stored when it ends. Not an action: it answers with a stream, and the route
// signs the caller in.
import { and, eq } from "drizzle-orm";
import type { User } from "@/lib/auth/user";
import { db, withTransaction } from "@/lib/db/client";
import { threadMessagesTable, threadsTable } from "@/lib/db/schema";
import { bug } from "@/lib/errors";
import type { WorkspaceUIMessage } from "@/modules/agent";
import { runAgent } from "@/modules/agent/server";
import {
  chatTurnDtoSchema,
  continueThread,
  threadIdSchema,
} from "./contracts";
import { withLatestMessage, type ConversationMessage } from "./conversation";
import { findThread, listThreadMessages } from "./queries";
import { toMessageRows, toThreadChanges } from "./rows";

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function threadNotFound() {
  return Response.json({ error: "Thread not found." }, { status: 404 });
}

/**
 * Validates the id and body at the edge, then hands the agent the stored conversation with the
 * browser's latest message, not the browser's conversation. Once the agent accepts, a parked
 * thread returns to active and records the provider of the model that answers. Another user's
 * thread is a 404, like a missing one or an id that is not a uuid.
 */
export async function answerThread(
  user: User,
  threadId: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  if (!threadIdSchema.safeParse(threadId).success) return threadNotFound();
  const request = chatTurnDtoSchema.safeParse(body);
  if (!request.success) return badRequest("Invalid chat request.");
  const { message, ...options } = request.data;

  const thread = await findThread(user, threadId);
  if (!thread) return threadNotFound();
  const stored = await listThreadMessages(user, thread.id);
  const run = await runAgent({
    user,
    options,
    messages: withLatestMessage<ConversationMessage>(stored, message),
    signal,
    onEnd: (messages) => saveConversation(user, thread.id, messages),
  });
  // A model, skill or record the agent does not know, or messages it does not accept.
  if (!run.ok)
    return badRequest(
      run.error._tag === "ValidationFailed"
        ? "Invalid chat messages."
        : "Invalid chat request.",
    );

  // The browser refuses a send while a response is in flight; here nothing is in flight.
  const continued = continueThread(thread, run.value.model.provider, false);
  if (!continued.ok) bug("a thread with no response in flight was refused");
  await db()
    .update(threadsTable)
    .set(toThreadChanges(continued.value))
    .where(
      and(eq(threadsTable.userId, user.id), eq(threadsTable.id, thread.id)),
    );
  return run.value.response;
}

/**
 * Replaces the stored conversation of one of the user's threads, in one transaction: what a
 * reply ends with, regenerate included. The message reference refuses a thread the user does
 * not have.
 */
export async function saveConversation(
  user: User,
  threadId: string,
  messages: readonly WorkspaceUIMessage[],
): Promise<void> {
  await withTransaction("interactive", async (tx) => {
    await tx
      .delete(threadMessagesTable)
      .where(
        and(
          eq(threadMessagesTable.userId, user.id),
          eq(threadMessagesTable.threadId, threadId),
        ),
      );
    if (messages.length > 0)
      await tx
        .insert(threadMessagesTable)
        .values(toMessageRows(user.id, threadId, messages));
  });
}
