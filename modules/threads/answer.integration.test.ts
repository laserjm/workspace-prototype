import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertIsolation,
  describeIntegration,
} from "@/test/support/integration";
import { db } from "@/lib/db/client";
import { connectionsTable } from "@/lib/db/schema";
import { err, ok } from "@/lib/result";
import type { WorkspaceUIMessage } from "@/modules/agent";
import {
  runAgent,
  type AgentModel,
  type AgentRequest,
} from "@/modules/agent/server";
import { callAs } from "@/test/support/session";
import { withUsers } from "@/test/support/users";
import { aConversation, aNewThread } from "@/test/factories/thread";
import { aUser } from "@/test/factories/user";
import { placeThreadAction, startThreadAction } from "./actions";
import { answerThread, saveConversation } from "./answer";
import type { StartThreadInput, ThreadPlacement } from "./contracts";
import { placementOf } from "./placement";
import { listThreadMessages, listThreads } from "./queries";

// The actions that arrange a thread read the session; callAs signs a test's user in.
vi.mock("@/lib/auth/session", () => import("@/test/support/session"));
// The agent is faked: it records what it was asked and answers with an empty 200 stream from
// `opus`, so no model is called. A test may make it refuse instead.
vi.mock("@/modules/agent/server", () => ({ runAgent: vi.fn() }));

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};

const requests: AgentRequest[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.mocked(runAgent).mockImplementation(async (request) => {
    requests.push(request);
    return ok({ model: opus, response: new Response(null, { status: 200 }) });
  });
});

const ask = (id: string, text = "And now?") => ({
  id,
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
});

/** The POST body the chat sends: the latest message and the options. */
const aChatTurn = (
  message: { id: string; role: "user"; parts: unknown[] } = ask("u3"),
) => ({ modelId: "opus", message });

/** A thread of `user`'s, stored with `messages` and put where `placement` says. */
async function aThreadOf(
  user: ReturnType<typeof aUser>,
  {
    messages = aConversation,
    placement,
    ...input
  }: Partial<StartThreadInput> & {
    messages?: WorkspaceUIMessage[];
    placement?: ThreadPlacement;
  } = {},
) {
  const thread = await callAs(user, startThreadAction, aNewThread(input));
  if (!thread.ok) throw new Error("the thread was not started");
  await saveConversation(user, thread.value.id, messages);
  if (placement)
    await callAs(user, placeThreadAction, {
      threadId: thread.value.id,
      change: { kind: "return", placement },
    });
  return thread.value;
}

async function listed(user: ReturnType<typeof aUser>, id: string) {
  return (await listThreads(user)).find((thread) => thread.id === id);
}

// The chat route's answer against the compose Postgres, with the agent faked
// (ARCHITECTURE.md, "Integration tests").
describeIntegration(
  "threads answer",
  () => {
    const ana = aUser("test-threads-answer-ana");
    const ben = aUser("test-threads-answer-ben");
    withUsers(ana.id, ben.id);

    it("asks the agent for the user, with the browser's options and the stored conversation", async () => {
      const thread = await aThreadOf(ana);
      const response = await answerThread(ana, thread.id, {
        ...aChatTurn(),
        skillId: "risk-review",
      });
      expect(response.status).toBe(200);
      expect(requests).toEqual([
        {
          user: ana,
          options: { modelId: "opus", skillId: "risk-review" },
          messages: [...aConversation, ask("u3")],
          signal: undefined,
          onEnd: expect.any(Function),
        },
      ]);
    });

    it.each([
      {
        name: "a new question after the stored conversation",
        message: ask("u3"),
        ids: ["u1", "a1", "u2", "a2", "u3"],
      },
      {
        name: "a question sent again without what came after it, as a regenerate does",
        message: ask("u2", "Which ones?"),
        ids: ["u1", "a1", "u2"],
      },
    ])("asks with $name", async ({ message, ids }) => {
      const thread = await aThreadOf(ana);
      await answerThread(ana, thread.id, aChatTurn(message));
      expect(
        (requests[0]?.messages as WorkspaceUIMessage[]).map((item) => item.id),
      ).toEqual(ids);
    });

    it("stores the conversation the reply ends with in place of the old one", async () => {
      const thread = await aThreadOf(ana);
      await answerThread(ana, thread.id, aChatTurn(ask("u2", "Which ones?")));
      const regenerated = [
        ...aConversation.slice(0, 3),
        { ...aConversation[3]!, id: "a2b" },
      ];
      await requests[0]!.onEnd(regenerated);
      expect(await listThreadMessages(ana, thread.id)).toEqual(regenerated);
    });

    it.each<{ name: string; placement: ThreadPlacement }>([
      { name: "settled", placement: { settledAt: "2026-11-04T09:00:00.000Z" } },
      {
        name: "snoozed",
        placement: { snoozedUntil: "2099-11-09T09:00:00.000Z" },
      },
      { name: "woken", placement: { wokeAt: "2026-11-04T09:00:00.000Z" } },
    ])(
      "returns a $name thread to active, talking to the answering model's provider",
      async ({ placement }) => {
        const thread = await aThreadOf(ana, { provider: "openai", placement });
        await answerThread(ana, thread.id, aChatTurn());
        const answered = await listed(ana, thread.id);
        expect(answered && placementOf(answered)).toEqual({
          settledAt: undefined,
          snoozedUntil: undefined,
          wokeAt: undefined,
        });
        expect(answered?.provider).toBe("claude");
      },
    );

    it("passes on the agent's refusal as a 400 and leaves the thread where it was", async () => {
      const placement = { settledAt: "2026-11-04T09:00:00.000Z" };
      const thread = await aThreadOf(ana, { placement });
      vi.mocked(runAgent).mockResolvedValueOnce(
        err({ _tag: "NotFound", entity: "Model", id: "gpt-0" }),
      );
      const response = await answerThread(ana, thread.id, aChatTurn());
      expect(response.status).toBe(400);
      expect(await listed(ana, thread.id)).toMatchObject(placement);
    });

    it.each([
      { name: "a missing thread", threadId: randomUUID() },
      { name: "a thread id that is not a uuid", threadId: "thread-1" },
    ])(
      "answers $name with a 404 before asking the agent",
      async ({ threadId }) => {
        const response = await answerThread(ana, threadId, aChatTurn());
        expect(response.status).toBe(404);
        expect(requests).toEqual([]);
      },
    );

    it("answers a body that is not a chat turn with a 400", async () => {
      const thread = await aThreadOf(ana);
      const response = await answerThread(ana, thread.id, { modelId: "opus" });
      expect(response.status).toBe(400);
      expect(requests).toEqual([]);
    });

    describe("a question's attached connections", () => {
      // Not one of Ana's connections: another user's, or one that was removed.
      const foreign = {
        connectionId: randomUUID(),
        provider: "github",
        label: "@someone",
      };
      const attaching = (
        message: ReturnType<typeof ask>,
        connection: { connectionId: string; provider: string; label: string } = foreign,
      ) => ({
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

      it("refuse a new question that attaches a connection that is not the user's", async () => {
        const thread = await aThreadOf(ana);
        const response = await answerThread(ana, thread.id, aChatTurn(attaching(ask("u3"))));
        expect(response.status).toBe(400);
        expect(requests).toEqual([]);
        expect(await listThreadMessages(ana, thread.id)).toEqual(aConversation);
      });

      it("answer a stored question sent again, as Try again does, and keep its data part", async () => {
        const question = attaching(ask("u2", "Which ones?"));
        const stored = [...aConversation.slice(0, 2), question, aConversation[3]!];
        const thread = await aThreadOf(ana, { messages: stored });
        const response = await answerThread(ana, thread.id, aChatTurn(question));
        expect(response.status).toBe(200);
        expect(requests[0]?.messages).toEqual(stored.slice(0, 3));

        const reply = { ...aConversation[3]!, id: "a2b" };
        await requests[0]!.onEnd([...stored.slice(0, 3), reply]);
        expect(await listThreadMessages(ana, thread.id)).toEqual([
          ...stored.slice(0, 3),
          reply,
        ]);
      });

      it("answer Try again on a question whose connection was removed since, and still refuse it on a new one", async () => {
        // One of Ana's connections, stored and later removed as `integrations` does. Its actions
        // are not part of its public API, so the test writes the row the way they would.
        const [own] = await db()
          .insert(connectionsTable)
          .values({
            userId: ana.id,
            providerId: "github",
            baseUrl: "https://api.github.com",
            accountRef: "1001",
            accountLabel: "@ana",
            authKind: "token",
            lastVerifiedAt: new Date(),
          })
          .returning({ id: connectionsTable.id });
        const connection = { connectionId: own!.id, provider: "github", label: "@ana" };
        const thread = await aThreadOf(ana, { messages: aConversation.slice(0, 2) });
        const question = attaching(ask("u2", "Which ones?"), connection);
        expect((await answerThread(ana, thread.id, aChatTurn(question))).status).toBe(200);
        // The answer failed: the thread holds the question and no reply.
        await requests[0]!.onEnd([...aConversation.slice(0, 2), question]);

        // Removed, as Settings → Data sources does.
        await db().delete(connectionsTable).where(eq(connectionsTable.id, own!.id));
        const retried = await answerThread(ana, thread.id, aChatTurn(question));
        expect(retried.status).toBe(200);
        expect(requests[1]?.messages).toEqual([...aConversation.slice(0, 2), question]);

        const asked = await answerThread(ana, thread.id, aChatTurn(attaching(ask("u3"), connection)));
        expect(asked.status).toBe(400);
        expect(requests).toHaveLength(2);
      });
    });

    // The thread scope is gone (#62): what a question is about travels on its message.
    it("stores threads without a scope", async () => {
      const columns = await db().execute<{ column_name: string }>(
        sql`select column_name from information_schema.columns where table_name = 'threads'`,
      );
      const names = [...columns].map((column) => column.column_name);
      expect(names).toContain("title");
      expect(names).not.toContain("source_id");
      expect(names).not.toContain("record_ids");
    });

    // Ben cannot read Ana's conversation, and a chat turn on her thread is a 404 that asks the
    // agent nothing and stores nothing.
    let threadId = "";
    assertIsolation({
      name: "answerThread, listThreadMessages",
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: async (owner) => {
        threadId = (await aThreadOf(aUser(owner))).id;
      },
      read: (owner) => listThreadMessages(aUser(owner), threadId),
      change: async (owner) => {
        const response = await answerThread(
          aUser(owner),
          threadId,
          aChatTurn(),
        );
        expect(response.status).toBe(404);
      },
    });
  },
);
