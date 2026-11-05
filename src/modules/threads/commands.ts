import "server-only";
// The module's use cases wired to what they run on (NX-LAYER-11), each taking the Requester its
// caller signed in as first.
import type { OwnerRequester } from "@conventions/nextjs/core";
import { listSkills } from "@/modules/skills/server";
import { listSources } from "@/modules/sources/server";
import { answerThread as answer } from "./application/answer-thread";
import { chatTurnDtoSchema } from "./contracts";
import { aiGatewayModelCatalog } from "./infra/ai-gateway.model-catalog";
import { aiGatewayResponseAgent } from "./infra/ai-gateway.response-agent";

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

/**
 * POST /api/chat: validates the body at the edge, then streams the thread's next response.
 * Threads are not stored yet, so nothing here is owned and the requester decides nothing; it
 * reaches the use case with the first owned thread.
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
      models: aiGatewayModelCatalog,
      skills,
      sources,
      agent: aiGatewayResponseAgent,
    },
  );
  if (result.ok) return result.value;
  switch (result.error._tag) {
    case "NotFound":
      return badRequest("Invalid chat request.");
    case "ValidationFailed":
      return badRequest("Invalid chat messages.");
  }
}
