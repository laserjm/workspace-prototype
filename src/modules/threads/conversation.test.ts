import { describe, expect, it } from "vitest";
import {
  forkPoint,
  withLatestMessage,
  type ConversationMessage,
} from "./conversation";

const ask1: ConversationMessage = { id: "u1", role: "user" };
const reply1: ConversationMessage = { id: "a1", role: "assistant" };
const ask2: ConversationMessage = { id: "u2", role: "user" };
const reply2: ConversationMessage = { id: "a2", role: "assistant" };

describe("withLatestMessage", () => {
  it.each([
    {
      name: "starts an empty conversation",
      stored: [],
      message: ask1,
      ids: ["u1"],
    },
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
    expect(withLatestMessage(stored, message).map((item) => item.id)).toEqual(
      ids,
    );
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
  ])(
    "forks through response $responseIndex",
    ({ messageId, ids, responseIndex }) => {
      const point = forkPoint(conversation, messageId);
      expect(point.ok && point.value.messages.map((item) => item.id)).toEqual(
        ids,
      );
      expect(point.ok && point.value.responseIndex).toBe(responseIndex);
    },
  );

  it.each([
    { name: "a question", messageId: "u2" },
    { name: "a message that is not in the thread", messageId: "gone" },
  ])("refuses to fork from $name", ({ messageId }) => {
    expect(forkPoint(conversation, messageId)).toEqual({
      ok: false,
      error: { _tag: "NotFound", entity: "Response", id: messageId },
    });
  });
});
