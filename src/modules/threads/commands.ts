import "server-only";
// The module's use cases wired to what they run on (NX-LAYER-11), each taking the Requester its
// caller signed in as first.
import {
  conflict,
  ConstraintViolation,
  err,
  type OwnerRequester,
} from "@conventions/nextjs/core";
import { findProject } from "@/modules/projects/server";
import { listSkills } from "@/modules/skills/server";
import { listSources } from "@/modules/sources/server";
import { answerThread as answer } from "./application/answer-thread";
import { forkThread as fork } from "./application/fork-thread";
import { startThread as start } from "./application/start-thread";
import {
  chatTurnDtoSchema,
  type ForkThreadInput,
  type StartThreadInput,
} from "./contracts";
import { aiGatewayModelCatalog } from "./infra/ai-gateway.model-catalog";
import { aiGatewayResponseAgent } from "./infra/ai-gateway.response-agent";
import { threadRepository } from "./infra/thread.repository";

/** Stores the new thread the user's first message starts. */
export async function startThread(
  requester: OwnerRequester,
  input: StartThreadInput,
) {
  try {
    return await start(input, {
      requester,
      threads: threadRepository,
      projects: {
        exists: async (projectId) =>
          (await findProject(requester, projectId)) !== null,
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
  requester: OwnerRequester,
  input: ForkThreadInput,
) {
  try {
    return await fork(input, {
      requester,
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

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

/**
 * POST /api/chat: validates the body at the edge, then streams the next response of one of the
 * requester's threads and stores the conversation when it ends. Another user's thread is a 404,
 * like a missing one.
 */
export async function answerThread(
  requester: OwnerRequester,
  body: unknown,
  signal?: AbortSignal,
) {
  const request = chatTurnDtoSchema.safeParse(body);
  if (!request.success) return badRequest("Invalid chat request.");
  const [skills, sources] = await Promise.all([listSkills(), listSources()]);
  const result = await answer(
    { ...request.data, signal },
    {
      requester,
      threads: threadRepository,
      models: aiGatewayModelCatalog,
      skills,
      sources,
      agent: aiGatewayResponseAgent,
    },
  );
  if (result.ok) return result.value;
  switch (result.error._tag) {
    case "NotFound":
      return result.error.entity === "Thread"
        ? Response.json({ error: "Thread not found." }, { status: 404 })
        : badRequest("Invalid chat request.");
    case "ValidationFailed":
      return badRequest("Invalid chat messages.");
  }
}
