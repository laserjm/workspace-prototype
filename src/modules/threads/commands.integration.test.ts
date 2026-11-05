import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { OwnerId } from "@conventions/nextjs/core";
import {
  assertIsolation,
  describeIntegration,
} from "@conventions/nextjs/testing";
import { createProject } from "@/modules/projects/server";
import { composeStack } from "@/tests/support/compose-stack";
import { withOwners } from "@/tests/support/owners";
import { aRequester } from "@/tests/factories/requester";
import { answerThread, forkThread, startThread } from "./commands";
import type { StartThreadInput, WorkspaceUIMessage } from "./contracts";
import { threadRepository } from "./infra/thread.repository";
import { listThreadMessages, listThreads } from "./queries";

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
async function aConversationOf(requester: ReturnType<typeof aRequester>) {
  const thread = await startThread(requester, aNewThread());
  if (!thread.ok) throw new Error("the thread was not started");
  await threadRepository.saveMessages(
    requester.ownerId,
    thread.value.id,
    conversation,
  );
  return thread.value;
}

function aChatTurn(threadId: string) {
  return {
    id: threadId,
    modelId: "opus",
    message: {
      id: "u3",
      role: "user",
      parts: [{ type: "text", text: "And now?" }],
    },
  };
}

async function aProjectOf(requester: ReturnType<typeof aRequester>) {
  const project = await createProject(requester, { name: "workspace" });
  if (!project.ok) throw new Error("the project was not created");
  return project.value.id;
}

// Command-level: the commands and queries against the compose Postgres, with a requester built
// here instead of a session. Stands in for the use case's unit test and the repository's
// integration test (NX-TEST-01, NX-TEST-02; ARCHITECTURE.md "Command tests").
describeIntegration(
  "threads commands",
  () => {
    const ana = aRequester("test-threads-ana");
    const ben = aRequester("test-threads-ben");
    withOwners(ana.userId, ben.userId);

    it("starts a thread without a project, titled by its first message", async () => {
      const input = aNewThread();
      const result = await startThread(ana, input);
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

    it("starts a thread in one of the user's projects", async () => {
      const projectId = await aProjectOf(ana);
      const result = await startThread(ana, aNewThread({ projectId }));
      expect(result.ok && result.value.projectId).toBe(projectId);
    });

    it("refuses another user's project as if it did not exist", async () => {
      const projectId = await aProjectOf(ben);
      const input = aNewThread({ projectId });
      expect(await startThread(ana, input)).toEqual({
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
      await threadRepository.saveMessages(ana.ownerId, thread.id, regenerated);
      expect(await listThreadMessages(ana, thread.id)).toEqual(regenerated);
    });

    it("answers a missing thread with a 404 before asking the model", async () => {
      const response = await answerThread(ana, aChatTurn(randomUUID()));
      expect(response.status).toBe(404);
    });

    it("refuses a chat turn whose thread id is not a uuid", async () => {
      const response = await answerThread(ana, aChatTurn("thread-1"));
      expect(response.status).toBe(400);
    });

    it("forks through a response with a copy of the conversation up to it", async () => {
      const thread = await aConversationOf(ana);
      const id = randomUUID();
      const result = await forkThread(ana, {
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
          await forkThread(ana, {
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
        await forkThread(ana, {
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

    // Ben sending a thread id Ana already uses is refused; her thread stays as it was.
    const isolated = aNewThread();
    assertIsolation({
      name: "startThread, listThreads",
      ownerA: OwnerId(ana.userId),
      ownerB: OwnerId(ben.userId),
      arrange: (owner) => startThread(aRequester(owner), isolated),
      read: async (owner) =>
        (await listThreads(aRequester(owner))).filter(
          (thread) => thread.id === isolated.id,
        ),
      change: (owner) =>
        startThread(aRequester(owner), { ...isolated, prompt: "Taken over" }),
    });

    // Ben cannot read Ana's conversation, and a chat turn on her thread is a 404 that stores
    // nothing.
    let conversationThreadId = "";
    assertIsolation({
      name: "answerThread, forkThread, listThreadMessages",
      ownerA: OwnerId(ana.userId),
      ownerB: OwnerId(ben.userId),
      arrange: async (owner) => {
        conversationThreadId = (await aConversationOf(aRequester(owner))).id;
      },
      read: (owner) =>
        listThreadMessages(aRequester(owner), conversationThreadId),
      change: async (owner) => {
        await answerThread(aRequester(owner), aChatTurn(conversationThreadId));
        await forkThread(aRequester(owner), {
          fromThreadId: conversationThreadId,
          id: randomUUID(),
          throughMessageId: "a1",
        });
      },
    });
  },
  { when: composeStack },
);
