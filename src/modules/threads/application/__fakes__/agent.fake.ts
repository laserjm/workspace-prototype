import { ok } from "@/lib/result";
import type { AgentModel, AgentRequest } from "@/modules/agent/server";
import type { AnswerAgent } from "../ports";

export const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};

/** Records what it was asked and answers with an empty 200 stream from `model`. */
export function fakeAgent(model: AgentModel = opus) {
  const requests: AgentRequest[] = [];
  const agent: AnswerAgent = async (request) => {
    requests.push(request);
    return ok({ model, response: new Response(null, { status: 200 }) });
  };
  return { agent, requests };
}
