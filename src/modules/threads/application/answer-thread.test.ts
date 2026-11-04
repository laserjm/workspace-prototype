import { describe, expect, it } from "vitest";
import { aSkill } from "@/tests/factories/skill";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import { inMemoryResponseAgent } from "./__fakes__/response-agent.fake";
import { answerThread, type AnswerThreadInput } from "./answer-thread";
import type { GatewayModel } from "./ports";

const opus: GatewayModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};
const riskReview = aSkill({ id: "risk-review", name: "Risk review" });
const jira = aSource({
  id: "jira",
  records: [
    aSourceRecord({ id: "PLAT-124" }),
    aSourceRecord({ id: "PLAT-125" }),
    aSourceRecord({ id: "PLAT-126" }),
  ],
});

function setup() {
  const { agent, requests } = inMemoryResponseAgent();
  const deps = { models: [opus], skills: [riskReview], sources: [jira], agent };
  return { deps, requests };
}

const request: AnswerThreadInput = {
  id: "thread-1",
  messages: [{ id: "m1", role: "user", parts: [] }],
  modelId: "opus",
};

describe("answerThread", () => {
  it("answers with the chosen model and no context when nothing is attached", async () => {
    const { deps, requests } = setup();
    const result = await answerThread(request, deps);
    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      {
        model: opus,
        skill: undefined,
        attached: undefined,
        messages: request.messages,
        signal: undefined,
      },
    ]);
  });

  it("resolves the skill and only the records the thread named, in the source's order", async () => {
    const { deps, requests } = setup();
    await answerThread(
      {
        ...request,
        skillId: "risk-review",
        scope: { sourceId: "jira", recordIds: ["PLAT-126", "PLAT-124"] },
      },
      deps,
    );
    expect(requests[0]?.skill).toBe(riskReview);
    expect(requests[0]?.attached?.records.map((record) => record.id)).toEqual([
      "PLAT-124",
      "PLAT-126",
    ]);
    expect(requests[0]?.attached?.recordCount).toBe(2);
  });

  it("attaches nothing when none of the named records exist", async () => {
    const { deps, requests } = setup();
    await answerThread(
      { ...request, scope: { sourceId: "jira", recordIds: ["GONE-1"] } },
      deps,
    );
    expect(requests[0]?.attached).toBeUndefined();
  });

  it.each([
    {
      name: "model",
      change: { modelId: "gpt-0" },
      entity: "Model",
      id: "gpt-0",
    },
    {
      name: "skill",
      change: { skillId: "poetry" },
      entity: "Skill",
      id: "poetry",
    },
    {
      name: "source",
      change: { scope: { sourceId: "sharepoint", recordIds: ["X-1"] } },
      entity: "Source",
      id: "sharepoint",
    },
  ])(
    "refuses an unknown $name without calling the agent",
    async ({ change, entity, id }) => {
      const { deps, requests } = setup();
      expect(await answerThread({ ...request, ...change }, deps)).toEqual({
        ok: false,
        error: { _tag: "NotFound", entity, id },
      });
      expect(requests).toEqual([]);
    },
  );
});
