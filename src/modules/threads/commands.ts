import "server-only";
// The module's use cases wired to what they run on, each taking the signed-in
// user first.
import type { User } from "@/lib/auth/user";
import { runAgent } from "@/modules/agent/server";
import { answerThread as answer } from "./application/answer-thread";
import { chatTurnDtoSchema, threadIdSchema } from "./contracts";
import { threadRepository } from "./infra/thread.repository";

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
