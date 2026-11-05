import { describe, expect, it } from "vitest";
import { aUser } from "@/tests/factories/user";
import { aSkill } from "@/tests/factories/skill";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import { aThread } from "@/tests/factories/thread";
import type { WorkspaceUIMessage } from "../contracts";
import type { Thread } from "../domain/thread";
import { inMemoryResponseAgent } from "./__fakes__/response-agent.fake";
import { inMemoryThreadRepository } from "./__fakes__/thread-repository.fake";
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

const ana = aUser("ana");
const threadId = "6f1c1c1e-2d6b-4f43-9a51-2a0d9a3c1e01";

const ask = (id: string, text = "Summarize") => ({
  id,
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
});
const reply = (id: string): WorkspaceUIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: "Done." }],
});

async function setup(
  stored: WorkspaceUIMessage[] = [],
  thread: Partial<Thread> = {},
) {
  const { agent, requests } = inMemoryResponseAgent();
  const { repository, conversations, threadOf } = inMemoryThreadRepository();
  await repository.save(
    ana.id,
    aThread({ id: threadId, ...thread }),
    stored,
  );
  const deps = {
    user: ana,
    threads: repository,
    models: [opus],
    skills: [riskReview],
    sources: [jira],
    agent,
  };
  return { deps, requests, conversations, threadOf };
}

const request: AnswerThreadInput = {
  id: threadId,
  message: ask("u1"),
  modelId: "opus",
};

describe("answerThread", () => {
  it("answers with the chosen model and no context when nothing is attached", async () => {
    const { deps, requests } = await setup();
    const result = await answerThread(request, deps);
    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      {
        model: opus,
        skill: undefined,
        attached: undefined,
        messages: [request.message],
        signal: undefined,
        onEnd: expect.any(Function),
      },
    ]);
  });

  it.each([
    {
      name: "the stored conversation followed by a new question",
      stored: [ask("u1"), reply("a1")],
      message: ask("u2"),
      ids: ["u1", "a1", "u2"],
    },
    {
      name: "the question again without the reply a regenerate replaces",
      stored: [ask("u1"), reply("a1")],
      message: ask("u1"),
      ids: ["u1"],
    },
  ])("asks with $name", async ({ stored, message, ids }) => {
    const { deps, requests } = await setup(stored);
    await answerThread({ ...request, message }, deps);
    expect(
      (requests[0]?.messages as WorkspaceUIMessage[]).map((item) => item.id),
    ).toEqual(ids);
  });

  it("stores the conversation the reply ends", async () => {
    const { deps, requests, conversations } = await setup();
    await answerThread(request, deps);
    const conversation = [ask("u1"), reply("a1")];
    await requests[0]!.onEnd(conversation);
    expect(conversations.get(threadId)).toEqual(conversation);
  });

  it.each([
    { name: "settled", placement: { settledAt: "2026-11-04T09:00:00.000Z" } },
    {
      name: "snoozed",
      placement: { snoozedUntil: "2026-11-09T09:00:00.000Z" },
    },
    { name: "woken", placement: { wokeAt: "2026-11-04T09:00:00.000Z" } },
  ])(
    "returns a $name thread to active, talking to the model's provider",
    async ({ placement }) => {
      const { deps, threadOf } = await setup([], {
        ...placement,
        provider: "openai",
      });
      await answerThread(request, deps);
      expect(threadOf(threadId)).toMatchObject({
        settledAt: undefined,
        snoozedUntil: undefined,
        wokeAt: undefined,
        provider: "claude",
      });
    },
  );

  it("refuses another user's thread as if it did not exist", async () => {
    const { deps, requests } = await setup();
    expect(
      await answerThread(request, { ...deps, user: aUser("ben") }),
    ).toEqual({
      ok: false,
      error: { _tag: "NotFound", entity: "Thread", id: threadId },
    });
    expect(requests).toEqual([]);
  });

  it("resolves the skill and only the records the thread named, in the source's order", async () => {
    const { deps, requests } = await setup();
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
    const { deps, requests } = await setup();
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
      const { deps, requests } = await setup();
      expect(await answerThread({ ...request, ...change }, deps)).toEqual({
        ok: false,
        error: { _tag: "NotFound", entity, id },
      });
      expect(requests).toEqual([]);
    },
  );
});
