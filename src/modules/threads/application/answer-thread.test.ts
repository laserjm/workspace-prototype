import { describe, expect, it } from "vitest";
import { err } from "@/lib/result";
import type { WorkspaceUIMessage } from "@/modules/agent";
import { aUser } from "@/tests/factories/user";
import { aThread } from "@/tests/factories/thread";
import type { Thread } from "../domain/thread";
import { fakeAgent } from "./__fakes__/agent.fake";
import { inMemoryThreadRepository } from "./__fakes__/thread-repository.fake";
import { answerThread, type AnswerThreadInput } from "./answer-thread";

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
  const { agent, requests } = fakeAgent();
  const { repository, conversations, threadOf } = inMemoryThreadRepository();
  await repository.save(
    ana.id,
    aThread({ id: threadId, ...thread }),
    stored,
  );
  const deps = { user: ana, threads: repository, agent };
  return { deps, requests, conversations, threadOf };
}

const request: AnswerThreadInput = {
  threadId,
  message: ask("u1"),
  modelId: "opus",
};

describe("answerThread", () => {
  it("asks the agent with the browser's options and the conversation", async () => {
    const { deps, requests } = await setup();
    const scope = { sourceId: "jira", recordIds: ["PLAT-124"] };
    const result = await answerThread(
      { ...request, skillId: "risk-review", scope },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      {
        options: { modelId: "opus", skillId: "risk-review", scope },
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
    "returns a $name thread to active, talking to the answering model's provider",
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

  it("passes on the agent's refusal and leaves the thread where it was", async () => {
    const placement = { settledAt: "2026-11-04T09:00:00.000Z" };
    const { deps, threadOf } = await setup([], placement);
    const refusal = err({
      _tag: "NotFound" as const,
      entity: "Model",
      id: "gpt-0",
    });
    const result = await answerThread(request, {
      ...deps,
      agent: async () => refusal,
    });
    expect(result).toEqual(refusal);
    expect(threadOf(threadId)).toMatchObject(placement);
  });
});
