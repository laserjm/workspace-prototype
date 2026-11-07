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
import { aConversation, aNewThread } from "@/tests/factories/thread";
import { aUser } from "@/tests/factories/user";
import {
  forkThreadAction,
  placeThreadAction,
  startThreadAction,
} from "./actions";
import { saveConversation } from "./answer";
import type { ThreadChange } from "./contracts";
import { listThreadMessages, listThreads } from "./queries";

// The actions read the session; callAs signs a test's user in.
vi.mock("@/lib/auth/session", () => import("@/tests/support/session"));

/**
 * A stored thread with a conversation. Replies are stored when the model's stream ends, which
 * these tests do not run; `saveConversation` stands in for it.
 */
async function aConversationOf(user: ReturnType<typeof aUser>) {
  const thread = await callAs(user, startThreadAction, aNewThread());
  if (!thread.ok) throw new Error("the thread was not started");
  await saveConversation(user, thread.value.id, aConversation);
  return thread.value;
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
      expect(await listThreadMessages(ana, thread.id)).toEqual(aConversation);
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
        aConversation.slice(0, 2),
      );
      expect(await listThreadMessages(ana, thread.id)).toEqual(aConversation);
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

    // Ben cannot read or fork Ana's conversation; the fork stores nothing.
    let conversationThreadId = "";
    assertIsolation({
      name: "forkThreadAction, listThreadMessages",
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: async (owner) => {
        conversationThreadId = (await aConversationOf(aUser(owner))).id;
      },
      read: (owner) =>
        listThreadMessages(aUser(owner), conversationThreadId),
      change: async (owner) => {
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
