import { describe, expect, it } from "vitest";
import { aThread } from "@/test/factories";
import {
  conversationCounts,
  forkOf,
  forkPoint,
  newThread,
  withLatestMessage,
  type ConversationMessage,
} from "./domain";

const now = new Date("2026-11-04T10:00:00.000Z");

const ask1: ConversationMessage = { id: "u1", role: "user" };
const reply1: ConversationMessage = { id: "a1", role: "assistant" };
const ask2: ConversationMessage = { id: "u2", role: "user" };
const reply2: ConversationMessage = { id: "a2", role: "assistant" };

describe("newThread", () => {
  it("titles the thread with its first message", () => {
    const thread = newThread(
      { id: "new", projectId: null, prompt: "Summarize", provider: "openai" },
      now,
    );
    expect(thread).toEqual({
      id: "new",
      projectId: null,
      title: "Summarize",
      branch: "main",
      createdAt: now.toISOString(),
      provider: "openai",
      turnCount: 0,
      attachmentCount: 0,
    });
  });
});

describe("forkOf", () => {
  it("copies the thread as active, keeps its project, and names its origin", () => {
    const thread = aThread({
      title: "Fork: Sprint 24 summary",
      settledAt: now.toISOString(),
      turnCount: 5,
      attachmentCount: 2,
    });
    const fork = forkOf(
      thread,
      { responseIndex: 2, counts: { turnCount: 3, attachmentCount: 1 } },
      "fork-1",
      now,
    );
    expect(fork).toMatchObject({
      id: "fork-1",
      turnCount: 3,
      attachmentCount: 1,
      title: "Fork: Sprint 24 summary",
      createdAt: now.toISOString(),
      settledAt: undefined,
      projectId: thread.projectId,
      forkedFrom: {
        threadId: "thread-1",
        title: "Fork: Sprint 24 summary",
        responseIndex: 2,
      },
    });
  });
});

describe("withLatestMessage", () => {
  it.each([
    { name: "starts an empty conversation", stored: [], message: ask1, ids: ["u1"] },
    {
      name: "appends a new question",
      stored: [ask1, reply1],
      message: ask2,
      ids: ["u1", "a1", "u2"],
    },
    {
      name: "drops the reply a regenerate replaces",
      stored: [ask1, reply1, ask2, reply2],
      message: ask2,
      ids: ["u1", "a1", "u2"],
    },
    {
      name: "drops everything after an earlier question sent again",
      stored: [ask1, reply1, ask2, reply2],
      message: ask1,
      ids: ["u1"],
    },
  ])("$name", ({ stored, message, ids }) => {
    expect(withLatestMessage(stored, message).map((item) => item.id)).toEqual(ids);
  });

  it("keeps the message as sent, not the stored copy", () => {
    const edited = { ...ask2, text: "edited" };
    expect(withLatestMessage([ask1, reply1, ask2], edited).at(-1)).toBe(edited);
  });
});

describe("forkPoint", () => {
  const conversation = [ask1, reply1, ask2, reply2];

  it.each([
    { messageId: "a1", ids: ["u1", "a1"], responseIndex: 0 },
    { messageId: "a2", ids: ["u1", "a1", "u2", "a2"], responseIndex: 1 },
  ])("forks through response $responseIndex", ({ messageId, ids, responseIndex }) => {
    const point = forkPoint(conversation, messageId);
    expect(point?.messages.map((item) => item.id)).toEqual(ids);
    expect(point?.responseIndex).toBe(responseIndex);
  });

  it.each([
    { name: "a question", messageId: "u2" },
    { name: "a message that is not in the thread", messageId: "gone" },
  ])("has no fork point at $name", ({ messageId }) => {
    expect(forkPoint(conversation, messageId)).toBeNull();
  });
});

describe("conversationCounts", () => {
  it("counts the questions and their attachments, not the replies", () => {
    expect(
      conversationCounts([
        { ...ask1, metadata: { attachments: ["plan.pdf", "notes.md"] } },
        reply1,
        ask2,
        { ...reply2, metadata: { attachments: ["ignored.txt"] } },
      ]),
    ).toEqual({ turnCount: 2, attachmentCount: 2 });
  });

  it("counts nothing in an empty conversation", () => {
    expect(conversationCounts([])).toEqual({ turnCount: 0, attachmentCount: 0 });
  });
});
