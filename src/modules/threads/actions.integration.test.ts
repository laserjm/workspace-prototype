import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  assertIsolation,
  describeIntegration,
} from "@conventions/nextjs/testing";
import { createProjectAction } from "@/modules/projects/server";
import { composeStack } from "@/tests/support/compose-stack";
import { withUsers } from "@/tests/support/users";
import { callAs } from "@/tests/support/session";
import { aUser } from "@/tests/factories/user";
import {
  forkThreadAction,
  placeThreadAction,
  startThreadAction,
} from "./actions";
import { answerThread } from "./commands";
import type { WorkspaceUIMessage } from "@/modules/agent";
import type { StartThreadInput, ThreadChange } from "./contracts";
import { threadRepository } from "./infra/thread.repository";
import { listThreadMessages, listThreads } from "./queries";

// The actions read the session; callAs signs a test's user in.
vi.mock("@/lib/auth/session", () => import("@/tests/support/session"));

function aNewThread(
  overrides: Partial<StartThreadInput> = {},
): StartThreadInput {
  return {
    id: randomUUID(),
    projectId: null,
    prompt: "Summarize these tickets",
    provider: "claude",
    scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125"] },
    ...overrides,
  };
}

const conversation: WorkspaceUIMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Summarize these tickets" }],
    metadata: { createdAt: "2026-11-05T09:00:00.000Z" },
  },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "Two tickets are blocked." }],
    metadata: { modelId: "opus", completedAt: "2026-11-05T09:00:05.000Z" },
  },
  {
    id: "u2",
    role: "user",
    parts: [{ type: "text", text: "Which ones?" }],
  },
  {
    id: "a2",
    role: "assistant",
    parts: [{ type: "text", text: "PLAT-124 and PLAT-125." }],
  },
];

/**
 * A stored thread with a conversation. Replies are stored when the model's stream ends, which
 * these tests do not call; the repository stands in for that write.
 */
async function aConversationOf(user: ReturnType<typeof aUser>) {
  const thread = await callAs(user, startThreadAction, aNewThread());
  if (!thread.ok) throw new Error("the thread was not started");
  await threadRepository.saveMessages(
    user.id,
    thread.value.id,
    conversation,
  );
  return thread.value;
}

function aChatTurn() {
  return {
    modelId: "opus",
    message: {
      id: "u3",
      role: "user",
      parts: [{ type: "text", text: "And now?" }],
    },
  };
}

async function aProjectOf(user: ReturnType<typeof aUser>) {
  const project = await callAs(user, createProjectAction, {
    name: "workspace",
  });
  if (!project.ok) throw new Error("the project was not created");
  return project.value.id;
}

// The actions as the browser calls them (sign-in, validation, the write) and the queries,
// against the compose Postgres with users built here (ARCHITECTURE.md, "Command tests").
describeIntegration(
  "threads actions",
  () => {
    const ana = aUser("test-threads-ana");
    const ben = aUser("test-threads-ben");
    withUsers(ana.id, ben.id);

    it("starts a thread without a project, titled by its first message", async () => {
      const input = aNewThread();
      const result = await callAs(ana, startThreadAction, input);
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: input.id,
          projectId: null,
          title: "Summarize these tickets",
          provider: "claude",
          scope: input.scope,
        }),
      });
      expect(await listThreads(ana)).toContainEqual(result.ok && result.value);
    });

    it("refuses a visitor and stores nothing", async () => {
      const input = aNewThread();
      expect(await callAs(null, startThreadAction, input)).toEqual({
        ok: false,
        error: { _tag: "SignedOut" },
      });
      const stored = (await listThreads(ana)).map((thread) => thread.id);
      expect(stored).not.toContain(input.id);
    });

    it("starts a thread in one of the user's projects", async () => {
      const projectId = await aProjectOf(ana);
      const result = await callAs(
        ana,
        startThreadAction,
        aNewThread({ projectId }),
      );
      expect(result.ok && result.value.projectId).toBe(projectId);
    });

    it("refuses another user's project as if it did not exist", async () => {
      const projectId = await aProjectOf(ben);
      const input = aNewThread({ projectId });
      expect(await callAs(ana, startThreadAction, input)).toEqual({
        ok: false,
        error: { _tag: "NotFound", entity: "Project", id: projectId },
      });
      const stored = (await listThreads(ana)).map((thread) => thread.id);
      expect(stored).not.toContain(input.id);
    });

    it("keeps a thread's conversation in order, metadata included", async () => {
      const thread = await aConversationOf(ana);
      expect(await listThreadMessages(ana, thread.id)).toEqual(conversation);
    });

    it("replaces the stored conversation when a reply ends", async () => {
      const thread = await aConversationOf(ana);
      const regenerated = [
        ...conversation.slice(0, 3),
        { ...conversation[3]!, id: "a2b" },
      ];
      await threadRepository.saveMessages(ana.id, thread.id, regenerated);
      expect(await listThreadMessages(ana, thread.id)).toEqual(regenerated);
    });

    it("answers a missing thread with a 404 before asking the model", async () => {
      const response = await answerThread(ana, randomUUID(), aChatTurn());
      expect(response.status).toBe(404);
    });

    it("answers a thread id that is not a uuid like a missing thread", async () => {
      const response = await answerThread(ana, "thread-1", aChatTurn());
      expect(response.status).toBe(404);
    });

    it("forks through a response with a copy of the conversation up to it", async () => {
      const thread = await aConversationOf(ana);
      const id = randomUUID();
      const result = await callAs(ana, forkThreadAction, {
        fromThreadId: thread.id,
        id,
        throughMessageId: "a1",
      });
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id,
          title: "Fork: Summarize these tickets",
          scope: thread.scope,
          forkedFrom: {
            threadId: thread.id,
            title: thread.title,
            responseIndex: 0,
          },
        }),
      });
      expect(await listThreads(ana)).toContainEqual(result.ok && result.value);
      expect(await listThreadMessages(ana, id)).toEqual(
        conversation.slice(0, 2),
      );
      expect(await listThreadMessages(ana, thread.id)).toEqual(conversation);
    });

    it("refuses to fork from a question or a response that is not stored", async () => {
      const thread = await aConversationOf(ana);
      for (const throughMessageId of ["u2", "a9"])
        expect(
          await callAs(ana, forkThreadAction, {
            fromThreadId: thread.id,
            id: randomUUID(),
            throughMessageId,
          }),
        ).toEqual({
          ok: false,
          error: { _tag: "NotFound", entity: "Response", id: throughMessageId },
        });
    });

    it("refuses to fork another user's thread as if it did not exist", async () => {
      const thread = await aConversationOf(ben);
      const id = randomUUID();
      expect(
        await callAs(ana, forkThreadAction, {
          fromThreadId: thread.id,
          id,
          throughMessageId: "a1",
        }),
      ).toEqual({
        ok: false,
        error: { _tag: "NotFound", entity: "Thread", id: thread.id },
      });
      expect(await listThreadMessages(ana, id)).toEqual([]);
    });

    async function aStartedThreadOf(user: ReturnType<typeof aUser>) {
      const thread = await callAs(user, startThreadAction, aNewThread());
      if (!thread.ok) throw new Error("the thread was not started");
      return thread.value;
    }

    async function listed(
      user: ReturnType<typeof aUser>,
      id: string,
    ) {
      return (await listThreads(user)).find((thread) => thread.id === id);
    }

    const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
    const anHourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

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
        change: () => ({
          kind: "return",
          placement: { settledAt: "2026-11-04T09:00:00.000Z" },
        }),
        placement: { settledAt: "2026-11-04T09:00:00.000Z" },
      },
    ])("$name a thread and keeps it there", async ({ change, placement }) => {
      const thread = await aStartedThreadOf(ana);
      const result = await callAs(ana, placeThreadAction, {
        threadId: thread.id,
        change: change(),
      });
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining(placement),
      });
      expect(await listed(ana, thread.id)).toEqual(result.ok && result.value);
    });

    it("restores a settled thread to active", async () => {
      const thread = await aStartedThreadOf(ana);
      await callAs(ana, placeThreadAction, {
        threadId: thread.id,
        change: { kind: "settle" },
      });
      await callAs(ana, placeThreadAction, {
        threadId: thread.id,
        change: { kind: "restore" },
      });
      expect(await listed(ana, thread.id)).toEqual(thread);
    });

    it("reads a snooze whose time has come as woken, until the thread is opened", async () => {
      const thread = await aStartedThreadOf(ana);
      await callAs(ana, placeThreadAction, {
        threadId: thread.id,
        change: { kind: "return", placement: { snoozedUntil: anHourAgo() } },
      });
      expect(await listed(ana, thread.id)).toMatchObject({
        snoozedUntil: undefined,
        wokeAt: expect.any(String),
      });
      await callAs(ana, placeThreadAction, {
        threadId: thread.id,
        change: { kind: "acknowledgeWake" },
      });
      expect(await listed(ana, thread.id)).toEqual(thread);
    });

    it("refuses a snooze that ends in the past and keeps the thread as it was", async () => {
      const thread = await aStartedThreadOf(ana);
      expect(
        await callAs(ana, placeThreadAction, {
          threadId: thread.id,
          change: { kind: "snooze", until: anHourAgo() },
        }),
      ).toEqual({ ok: false, error: { _tag: "SnoozeTimeInPast" } });
      expect(await listed(ana, thread.id)).toEqual(thread);
    });

    // Ben cannot settle or snooze Ana's thread; it is a NotFound and her thread stays active.
    let placedThreadId = "";
    assertIsolation({
      name: "placeThreadAction, listThreads",
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: async (owner) => {
        placedThreadId = (await aStartedThreadOf(aUser(owner))).id;
      },
      read: (owner) => listed(aUser(owner), placedThreadId),
      change: async (owner) => {
        const ben = aUser(owner);
        await callAs(ben, placeThreadAction, {
          threadId: placedThreadId,
          change: { kind: "settle" },
        });
        await callAs(ben, placeThreadAction, {
          threadId: placedThreadId,
          change: { kind: "snooze", until: inAnHour() },
        });
      },
    });

    // Ben sending a thread id Ana already uses is refused; her thread stays as it was.
    const isolated = aNewThread();
    assertIsolation({
      name: "startThreadAction, listThreads",
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: (owner) => callAs(aUser(owner), startThreadAction, isolated),
      read: async (owner) =>
        (await listThreads(aUser(owner))).filter(
          (thread) => thread.id === isolated.id,
        ),
      change: (owner) =>
        callAs(aUser(owner), startThreadAction, {
          ...isolated,
          prompt: "Taken over",
        }),
    });

    // Ben cannot read Ana's conversation, and a chat turn on her thread is a 404 that stores
    // nothing.
    let conversationThreadId = "";
    assertIsolation({
      name: "answerThread, forkThread, listThreadMessages",
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: async (owner) => {
        conversationThreadId = (await aConversationOf(aUser(owner))).id;
      },
      read: (owner) =>
        listThreadMessages(aUser(owner), conversationThreadId),
      change: async (owner) => {
        await answerThread(
          aUser(owner),
          conversationThreadId,
          aChatTurn(),
        );
        await callAs(aUser(owner), forkThreadAction, {
          fromThreadId: conversationThreadId,
          id: randomUUID(),
          throughMessageId: "a1",
        });
      },
    });
  },
  { when: composeStack },
);
