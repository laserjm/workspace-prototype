import "server-only";
// The module's use cases wired to what they run on, each taking the signed-in
// user first.
import {
  conflict,
  ConstraintViolation,
  err,
} from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import { runAgent } from "@/modules/agent/server";
import { findProject } from "@/modules/projects/server";
import { answerThread as answer } from "./application/answer-thread";
import { forkThread as fork } from "./application/fork-thread";
import { placeThread as place } from "./application/place-thread";
import { startThread as start } from "./application/start-thread";
import {
  chatTurnDtoSchema,
  threadIdSchema,
  type ForkThreadInput,
  type PlaceThreadInput,
  type StartThreadInput,
} from "./contracts";
import { threadRepository } from "./infra/thread.repository";

/** Stores the new thread the user's first message starts. */
export async function startThread(
  user: User,
  input: StartThreadInput,
) {
  try {
    return await start(input, {
      user,
      threads: threadRepository,
      projects: {
        exists: async (projectId) =>
          (await findProject(user, projectId)) !== null,
      },
      clock,
    });
  } catch (error) {
    // The id is taken: a resent first message, or another user's thread.
    if (error instanceof ConstraintViolation)
      return err(conflict(error.constraint));
    throw error;
  }
}

const clock = { now: () => new Date() };

/** Stores a fork of one of the user's threads through one of its responses. */
export async function forkThread(
  user: User,
  input: ForkThreadInput,
) {
  try {
    return await fork(input, {
      user,
      threads: threadRepository,
      clock,
    });
  } catch (error) {
    // The fork's id is taken: a resent fork, or another user's thread.
    if (error instanceof ConstraintViolation)
      return err(conflict(error.constraint));
    throw error;
  }
}

/** Settles, snoozes, restores or wakes one of the user's threads, or undoes that. */
export async function placeThread(
  user: User,
  input: PlaceThreadInput,
) {
  return place(input, { user, threads: threadRepository, clock });
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function threadNotFound() {
  return Response.json({ error: "Thread not found." }, { status: 404 });
}

/**
 * POST /api/threads/[id]/messages: validates the id and body at the edge, then streams the next
 * response of one of the user's threads and stores the conversation when it ends. Another user's
 * thread is a 404, like a missing one or an id that is not a uuid.
 */
export async function answerThread(
  user: User,
  threadId: string,
  body: unknown,
  signal?: AbortSignal,
) {
  if (!threadIdSchema.safeParse(threadId).success) return threadNotFound();
  const request = chatTurnDtoSchema.safeParse(body);
  if (!request.success) return badRequest("Invalid chat request.");
  const result = await answer(
    { ...request.data, threadId, signal },
    { user, threads: threadRepository, agent: runAgent },
  );
  if (result.ok) return result.value;
  switch (result.error._tag) {
    case "NotFound":
      return result.error.entity === "Thread"
        ? threadNotFound()
        : badRequest("Invalid chat request.");
    case "ValidationFailed":
      return badRequest("Invalid chat messages.");
  }
}
