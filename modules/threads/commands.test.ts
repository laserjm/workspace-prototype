// The threads module's writes against the test Postgres. answerThread runs the real agent on a
// mock language model, so no model is called and no network is reached.
import { randomUUID } from "node:crypto";
import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth";
import { ModelNotFound } from "@/modules/agent/errors";
import type { WorkspaceUIMessage } from "@/modules/agent/contracts";
import { disconnect } from "@/modules/integrations/commands";
import {
  aConversation,
  aNewThread,
  insertConnection,
  insertMessages,
  insertProject,
  insertThread,
  insertUser,
} from "@/test/factories";
import {
  answerThread,
  forkThread,
  placeThread,
  saveConversation,
  startThread,
} from "./commands";
import { placementOf, type ThreadChange, type ThreadPlacement } from "./contracts";
import {
  ForeignConnectionAttached,
  ProjectNotFound,
  ResponseNotFound,
  SnoozeTimeInPast,
  ThreadIdTaken,
  ThreadNotFound,
} from "./errors";
import { getThread, getThreadMessages, getThreads } from "./queries";

/** The stored conversation's message at `index`. */
function stored(index: number): WorkspaceUIMessage {
  const message = aConversation[index];
  if (!message) throw new Error(`aConversation has no message ${index}`);
  return message;
}

/** One of `owner`'s threads with `aConversation` stored. */
async function aConversationOf(owner: User, values: Parameters<typeof insertThread>[1] = {}) {
  const thread = await insertThread(owner, values);
  await insertMessages(owner, thread, aConversation);
  return thread;
}

const anHourAgo = () => new Date(Date.now() - 3_600_000).toISOString();
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe("startThread", () => {
  it("starts a thread without a project, titled by its first message", async () => {
    const ana = await insertUser();
    const input = aNewThread();
    const thread = await startThread(ana, input);
    expect(thread).toEqual(
      expect.objectContaining({
        id: input.id,
        projectId: null,
        title: "Summarize these tickets",
        provider: "claude",
      }),
    );
    expect(await getThreads(ana)).toEqual([thread]);
  });

  it("starts a thread in one of the requester's projects", async () => {
    const ana = await insertUser();
    const project = await insertProject(ana);
    const thread = await startThread(ana, aNewThread({ projectId: project.id }));
    expect(thread.projectId).toBe(project.id);
    expect((await getThread(ana, thread.id))?.projectId).toBe(project.id);
  });

  it("refuses another user's project as if it did not exist, and stores nothing", async () => {
    const ana = await insertUser();
    const project = await insertProject(await insertUser());
    const input = aNewThread({ projectId: project.id });
    await expect(startThread(ana, input)).rejects.toThrow(ProjectNotFound);
    expect(await getThreads(ana)).toEqual([]);
  });

  it("refuses a project id that is not a uuid as if it did not exist", async () => {
    const ana = await insertUser();
    await expect(startThread(ana, aNewThread({ projectId: "project-1" }))).rejects.toThrow(
      ProjectNotFound,
    );
    expect(await getThreads(ana)).toEqual([]);
  });

  it("refuses a resent first message: the id is taken", async () => {
    const ana = await insertUser();
    const input = aNewThread();
    const thread = await startThread(ana, input);
    await expect(startThread(ana, { ...input, prompt: "Again" })).rejects.toThrow(ThreadIdTaken);
    expect(await getThreads(ana)).toEqual([thread]);
  });

  it("refuses an id another user's thread has, and leaves theirs as it was", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const input = aNewThread();
    const thread = await startThread(ana, input);
    await expect(startThread(ben, { ...input, prompt: "Taken over" })).rejects.toThrow(
      ThreadIdTaken,
    );
    expect(await getThreads(ana)).toEqual([thread]);
    expect(await getThreads(ben)).toEqual([]);
  });
});

describe("forkThread", () => {
  it("forks through a response with a copy of the conversation up to it", async () => {
    const ana = await insertUser();
    const thread = await aConversationOf(ana);
    const id = randomUUID();
    const fork = await forkThread(ana, { fromThreadId: thread.id, id, throughMessageId: "a1" });
    expect(fork).toEqual(
      expect.objectContaining({
        id,
        title: "Fork: Sprint 24 summary",
        forkedFrom: { threadId: thread.id, title: thread.title, responseIndex: 0 },
        turnCount: 1,
        attachmentCount: 0,
      }),
    );
    expect(await getThreads(ana)).toContainEqual(fork);
    expect(await getThreadMessages(ana, id)).toEqual(aConversation.slice(0, 2));
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
  });

  it("copies the questions' attached items verbatim, a removed connection's too", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    // Not one of the requester's connections any more: removed since the question attached it.
    const attached: WorkspaceUIMessage = {
      ...stored(0),
      parts: [
        ...stored(0).parts,
        {
          type: "data-attached-items",
          data: {
            connections: [
              {
                connectionId: randomUUID(),
                provider: "github",
                label: "@ana",
                items: [
                  {
                    type: "pull_request",
                    key: "acme/web#91",
                    snapshot: { label: "web#91", title: "Fix the login", state: "merged" },
                  },
                ],
              },
              { connectionId: randomUUID(), provider: "github", label: "@acme", items: [] },
            ],
          },
        },
      ],
    };
    const conversation = [attached, ...aConversation.slice(1)];
    await insertMessages(ana, thread, conversation);

    const id = randomUUID();
    await forkThread(ana, { fromThreadId: thread.id, id, throughMessageId: "a2" });
    expect(await getThreadMessages(ana, id)).toEqual(conversation);
  });

  it.each([
    { name: "a question", throughMessageId: "u2" },
    { name: "a response that is not stored", throughMessageId: "a9" },
  ])("refuses to fork from $name, and stores nothing", async ({ throughMessageId }) => {
    const ana = await insertUser();
    const thread = await aConversationOf(ana);
    const id = randomUUID();
    await expect(
      forkThread(ana, { fromThreadId: thread.id, id, throughMessageId }),
    ).rejects.toThrow(ResponseNotFound);
    expect(await getThread(ana, id)).toBeNull();
  });

  it("refuses to fork another user's thread as if it did not exist, and stores nothing", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await aConversationOf(ana);
    const id = randomUUID();
    await expect(
      forkThread(ben, { fromThreadId: thread.id, id, throughMessageId: "a1" }),
    ).rejects.toThrow(ThreadNotFound);
    expect(await getThreads(ben)).toEqual([]);
    expect(await getThreadMessages(ben, id)).toEqual([]);
    expect(await getThreads(ana)).toHaveLength(1);
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
  });

  it("refuses a thread id that is not a uuid as if it did not exist", async () => {
    const ana = await insertUser();
    await expect(
      forkThread(ana, { fromThreadId: "thread-1", id: randomUUID(), throughMessageId: "a1" }),
    ).rejects.toThrow(ThreadNotFound);
  });

  it("refuses a fork id another user's thread has, and leaves theirs as it was", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await aConversationOf(ana);
    const bens = await aConversationOf(ben);
    const before = await getThreads(ben);
    await expect(
      forkThread(ana, { fromThreadId: thread.id, id: bens.id, throughMessageId: "a1" }),
    ).rejects.toThrow(ThreadIdTaken);
    expect(await getThreads(ben)).toEqual(before);
    expect(await getThreadMessages(ben, bens.id)).toEqual(aConversation);
    expect(await getThreads(ana)).toHaveLength(1);
  });
});

describe("placeThread", () => {
  it.each<{ name: string; change: () => ThreadChange; placement: object }>([
    {
      name: "settles",
      change: () => ({ kind: "settle" }),
      placement: { settledAt: expect.any(String) },
    },
    {
      name: "snoozes",
      change: () => ({ kind: "snooze", until: "2099-01-05T09:00:00.000Z" }),
      placement: { snoozedUntil: "2099-01-05T09:00:00.000Z" },
    },
    {
      name: "puts back where it was (an undo)",
      change: () => ({ kind: "return", placement: { settledAt: "2026-11-04T09:00:00.000Z" } }),
      placement: { settledAt: "2026-11-04T09:00:00.000Z" },
    },
  ])("$name a thread and keeps it there", async ({ change, placement }) => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    const placed = await placeThread(ana, { threadId: thread.id, change: change() });
    expect(placed).toEqual(expect.objectContaining(placement));
    expect(await getThread(ana, thread.id)).toEqual(placed);
  });

  it("restores a settled thread to active", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    const active = await getThread(ana, thread.id);
    await placeThread(ana, { threadId: thread.id, change: { kind: "settle" } });
    await placeThread(ana, { threadId: thread.id, change: { kind: "restore" } });
    expect(await getThread(ana, thread.id)).toEqual(active);
  });

  it("reads a snooze whose time has come as woken, until the thread is opened", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    const active = await getThread(ana, thread.id);
    await placeThread(ana, {
      threadId: thread.id,
      change: { kind: "return", placement: { snoozedUntil: anHourAgo() } },
    });
    expect(await getThreads(ana)).toEqual([
      expect.objectContaining({ snoozedUntil: undefined, wokeAt: expect.any(String) }),
    ]);
    await placeThread(ana, { threadId: thread.id, change: { kind: "acknowledgeWake" } });
    expect(await getThread(ana, thread.id)).toEqual(active);
  });

  it("refuses a snooze that ends in the past and keeps the thread as it was", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    const before = await getThread(ana, thread.id);
    await expect(
      placeThread(ana, { threadId: thread.id, change: { kind: "snooze", until: anHourAgo() } }),
    ).rejects.toThrow(SnoozeTimeInPast);
    expect(await getThread(ana, thread.id)).toEqual(before);
  });

  it("refuses another user's thread as if it did not exist, and leaves it where it was", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await insertThread(ana);
    const before = await getThread(ana, thread.id);
    await expect(
      placeThread(ben, { threadId: thread.id, change: { kind: "settle" } }),
    ).rejects.toThrow(ThreadNotFound);
    await expect(
      placeThread(ben, { threadId: thread.id, change: { kind: "snooze", until: inAnHour() } }),
    ).rejects.toThrow(ThreadNotFound);
    expect(await getThread(ana, thread.id)).toEqual(before);
  });

  it("refuses a thread id that is not a uuid as if it did not exist", async () => {
    const ana = await insertUser();
    await expect(
      placeThread(ana, { threadId: "thread-1", change: { kind: "settle" } }),
    ).rejects.toThrow(ThreadNotFound);
  });
});

describe("answerThread", () => {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  /** A model that replies once with a short text. */
  const replying = () =>
    new MockLanguageModelV4({
      doStream: [
        {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({ type: "text-start", id: "t1" });
              controller.enqueue({ type: "text-delta", id: "t1", delta: "Two are in review." });
              controller.enqueue({ type: "text-end", id: "t1" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage,
              });
              controller.close();
            },
          }),
        },
      ],
    });
  const services = (model: LanguageModel) => ({
    languageModel: () => model,
    describeError: () => "The model failed.",
  });

  const ask = (id: string, text = "And now?") => ({
    id,
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
  });

  /** Asks `message` on `threadId` with `options`, answered by `model`. */
  const answer = (
    requester: User,
    threadId: string,
    message: { id: string; role: "user"; parts: unknown[] } = ask("u3"),
    { model = replying(), skillId }: { model?: MockLanguageModelV4; skillId?: string } = {},
    modelId = "opus",
  ) => answerThread(requester, threadId, { message, options: { modelId, skillId } }, services(model));

  /** The conversation the model was given, as role and text, without the system prompt. */
  function asked(model: MockLanguageModelV4) {
    return (model.doStreamCalls[0]?.prompt ?? []).flatMap((message) =>
      message.role === "system"
        ? []
        : message.content.flatMap((part) =>
            part.type === "text" ? [`${message.role}: ${part.text}`] : [],
          ),
    );
  }
  const systemOf = (model: MockLanguageModelV4) =>
    (model.doStreamCalls[0]?.prompt ?? []).flatMap((message) =>
      message.role === "system" ? [message.content] : [],
    ).join("\n");

  /** Reads the reply to its end and waits until the conversation it ends with is stored. */
  async function settled(requester: User, threadId: string, response: Response, length: number) {
    await response.text();
    await vi.waitFor(async () =>
      expect(await getThreadMessages(requester, threadId)).toHaveLength(length),
    );
    return getThreadMessages(requester, threadId);
  }

  it("asks the agent with the browser's options and the stored conversation", async () => {
    const ana = await insertUser();
    const thread = await aConversationOf(ana);
    const model = replying();
    const run = await answer(ana, thread.id, ask("u3"), { model, skillId: "risk-review" });
    expect(run.model.id).toBe("opus");
    expect(run.response.status).toBe(200);
    expect(systemOf(model)).toContain("# Skill: Risk review");
    expect(asked(model)).toEqual([
      "user: Summarize these tickets",
      "assistant: Two tickets are blocked.",
      "user: Which ones?",
      "assistant: PLAT-124 and PLAT-125.",
      "user: And now?",
    ]);
  });

  it.each([
    {
      name: "a new question after the stored conversation",
      message: ask("u3"),
      conversation: [
        "user: Summarize these tickets",
        "assistant: Two tickets are blocked.",
        "user: Which ones?",
        "assistant: PLAT-124 and PLAT-125.",
        "user: And now?",
      ],
    },
    {
      name: "a question sent again without what came after it, as a regenerate does",
      message: ask("u2", "Which ones?"),
      conversation: [
        "user: Summarize these tickets",
        "assistant: Two tickets are blocked.",
        "user: Which ones?",
      ],
    },
  ])("asks with $name", async ({ message, conversation }) => {
    const ana = await insertUser();
    const thread = await aConversationOf(ana);
    const model = replying();
    await answer(ana, thread.id, message, { model });
    expect(asked(model)).toEqual(conversation);
  });

  it("stores the conversation the reply ends with in place of the old one", async () => {
    const ana = await insertUser();
    const thread = await aConversationOf(ana);
    const run = await answer(ana, thread.id, ask("u2", "Which ones?"));
    const conversation = await settled(ana, thread.id, run.response, 4);
    expect(conversation.slice(0, 3)).toEqual(aConversation.slice(0, 3));
    expect(conversation[3]).toMatchObject({
      id: expect.stringMatching(/^msg-/),
      role: "assistant",
      parts: expect.arrayContaining([expect.objectContaining({ text: "Two are in review." })]),
      metadata: { modelId: "opus", completedAt: expect.any(String) },
    });
  });

  it.each<{ name: string; placement: Parameters<typeof insertThread>[1] }>([
    { name: "settled", placement: { settledAt: new Date("2026-11-04T09:00:00.000Z") } },
    { name: "snoozed", placement: { snoozedUntil: new Date("2099-11-09T09:00:00.000Z") } },
    { name: "woken", placement: { wokeAt: new Date("2026-11-04T09:00:00.000Z") } },
  ])(
    "returns a $name thread to active, talking to the answering model's provider",
    async ({ placement }) => {
      const ana = await insertUser();
      const thread = await aConversationOf(ana, { provider: "openai", ...placement });
      await answer(ana, thread.id);
      const answered = await getThread(ana, thread.id);
      expect(answered && placementOf(answered)).toEqual({
        settledAt: undefined,
        snoozedUntil: undefined,
        wokeAt: undefined,
      });
      expect(answered?.provider).toBe("claude");
    },
  );

  it("passes on the agent's refusal and leaves the thread where it was", async () => {
    const ana = await insertUser();
    const placement: ThreadPlacement = { settledAt: "2026-11-04T09:00:00.000Z" };
    const thread = await aConversationOf(ana, { settledAt: new Date("2026-11-04T09:00:00.000Z") });
    const model = replying();
    await expect(answer(ana, thread.id, ask("u3"), { model }, "gpt-0")).rejects.toThrow(
      ModelNotFound,
    );
    expect(model.doStreamCalls).toEqual([]);
    expect(await getThread(ana, thread.id)).toMatchObject(placement);
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
  });

  it.each([
    { name: "a missing thread", threadId: randomUUID() },
    { name: "a thread id that is not a uuid", threadId: "thread-1" },
  ])("refuses $name before asking the agent", async ({ threadId }) => {
    const ana = await insertUser();
    const model = replying();
    await expect(answer(ana, threadId, ask("u3"), { model })).rejects.toThrow(ThreadNotFound);
    expect(model.doStreamCalls).toEqual([]);
  });

  it("refuses another user's thread as if it did not exist: asks nothing and stores nothing", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await aConversationOf(ana, { settledAt: new Date("2026-11-04T09:00:00.000Z") });
    const before = await getThread(ana, thread.id);
    const model = replying();
    await expect(answer(ben, thread.id, ask("u3"), { model })).rejects.toThrow(ThreadNotFound);
    expect(model.doStreamCalls).toEqual([]);
    expect(await getThreadMessages(ben, thread.id)).toEqual([]);
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
    expect(await getThread(ana, thread.id)).toEqual(before);
  });

  describe("a question's attached connections", () => {
    const attaching = (
      message: ReturnType<typeof ask>,
      connection: { connectionId: string; provider: string; label: string },
    ): WorkspaceUIMessage & { role: "user" } => ({
      ...message,
      parts: [
        ...message.parts,
        {
          type: "data-attached-items" as const,
          data: {
            connections: [
              {
                ...connection,
                items: [
                  {
                    type: "issue",
                    key: "someone/private#1",
                    snapshot: { label: "private#1", title: "Secret", state: "open" },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    const asAttached = (connectionId: string, label = "@someone") => ({
      connectionId,
      provider: "github",
      label,
    });

    it.each([
      { name: "another user's", foreign: async () => (await insertConnection(await insertUser())).id },
      { name: "a removed one", foreign: async () => randomUUID() },
    ])("refuse a new question that attaches a connection not the requester's: $name", async ({ foreign }) => {
      const ana = await insertUser();
      const thread = await aConversationOf(ana);
      const model = replying();
      await expect(
        answer(ana, thread.id, attaching(ask("u3"), asAttached(await foreign())), { model }),
      ).rejects.toThrow(ForeignConnectionAttached);
      expect(model.doStreamCalls).toEqual([]);
      expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
    });

    it("answer a stored question sent again, as Try again does, and keep its data part", async () => {
      const ana = await insertUser();
      const question = attaching(ask("u2", "Which ones?"), asAttached(randomUUID()));
      const thread = await insertThread(ana);
      await insertMessages(ana, thread, [stored(0), stored(1), question, stored(3)]);
      const model = replying();
      const run = await answer(ana, thread.id, question, { model });
      expect(asked(model)).toEqual([
        "user: Summarize these tickets",
        "assistant: Two tickets are blocked.",
        "user: Which ones?",
        expect.stringContaining("<attached_items>"),
      ]);

      const conversation = await settled(ana, thread.id, run.response, 4);
      expect(conversation.slice(0, 3)).toEqual([stored(0), stored(1), question]);
      expect(conversation[3]?.id).not.toBe(stored(3).id);
    });

    it("answer Try again on a question whose connection was removed since, and still refuse it on a new one", async () => {
      const ana = await insertUser();
      const own = await insertConnection(ana);
      const connection = asAttached(own.id, "@laserjm");
      const thread = await insertThread(ana);
      await insertMessages(ana, thread, aConversation.slice(0, 2));
      const question = attaching(ask("u2", "Which ones?"), connection);
      const first = await answer(ana, thread.id, question);
      await settled(ana, thread.id, first.response, 4);

      // Removed, as Settings → Data sources does.
      await disconnect(ana, own.id);
      const retry = replying();
      const retried = await answer(ana, thread.id, question, { model: retry });
      expect(retried.response.status).toBe(200);
      expect(asked(retry)).toEqual([
        "user: Summarize these tickets",
        "assistant: Two tickets are blocked.",
        "user: Which ones?",
        expect.stringContaining(`connectionId ${own.id}`),
      ]);
      expect(systemOf(retry)).toContain("## Connections you may use\n\nNone.");

      const later = replying();
      await expect(
        answer(ana, thread.id, attaching(ask("u3"), connection), { model: later }),
      ).rejects.toThrow(ForeignConnectionAttached);
      expect(later.doStreamCalls).toEqual([]);
    });
  });
});

describe("saveConversation", () => {
  it("keeps a thread's conversation in order, metadata included", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    await saveConversation(ana, thread.id, aConversation);
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
  });

  it("replaces the stored conversation, as a regenerate ends", async () => {
    const ana = await insertUser();
    const thread = await aConversationOf(ana);
    const regenerated = [...aConversation.slice(0, 3), { ...stored(3), id: "a2b" }];
    await saveConversation(ana, thread.id, regenerated);
    expect(await getThreadMessages(ana, thread.id)).toEqual(regenerated);
  });

  it("refuses another user's thread and changes nothing", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await aConversationOf(ana);
    await expect(saveConversation(ben, thread.id, aConversation.slice(0, 2))).rejects.toThrow();
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
    expect(await getThreadMessages(ben, thread.id)).toEqual([]);
  });

  it("refuses a thread id that is not a uuid", async () => {
    const ana = await insertUser();
    await expect(saveConversation(ana, "thread-1", aConversation)).rejects.toThrow();
  });
});
