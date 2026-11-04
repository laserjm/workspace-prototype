import "server-only";
// The module's use cases wired to what they run on (NX-LAYER-11). There is no sign-in yet, so
// no Requester; it becomes the first argument with the auth ruleset (see ARCHITECTURE.md).
import { listSkills } from "@/modules/skills/server";
import { listSources } from "@/modules/sources/server";
import { answerThread as answer } from "./application/answer-thread";
import { chatTurnDtoSchema } from "./contracts";
import { aiGatewayModelCatalog } from "./infra/ai-gateway.model-catalog";
import { aiGatewayResponseAgent } from "./infra/ai-gateway.response-agent";

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

/** POST /api/chat: validates the body at the edge, then streams the thread's next response. */
export async function answerThread(body: unknown, signal?: AbortSignal) {
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
