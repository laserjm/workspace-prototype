import { describe, expect, it } from "vitest";
import { isSampleAnswerable, sampleResponseKind } from "./sample-response";

describe("sampleResponseKind", () => {
  it.each([
    { prompt: "anything", skillId: "summary", kind: "summary" },
    { prompt: "anything", skillId: "risk-review", kind: "risks" },
    {
      prompt: "What are the risks?",
      skillId: "action-plan",
      kind: "next-steps",
    },
    { prompt: "What are the risks?", skillId: undefined, kind: "risks" },
    { prompt: "What blocks the release?", skillId: undefined, kind: "risks" },
    {
      prompt: "What are the next steps?",
      skillId: undefined,
      kind: "next-steps",
    },
    { prompt: "Any follow-ups?", skillId: undefined, kind: "next-steps" },
    { prompt: "Tell me a joke", skillId: undefined, kind: "summary" },
    { prompt: "What are the risks?", skillId: "custom-skill", kind: "risks" },
  ])(
    "answers '$prompt' with skill $skillId as $kind",
    ({ prompt, skillId, kind }) => {
      expect(sampleResponseKind(prompt, skillId)).toBe(kind);
    },
  );
});

describe("isSampleAnswerable", () => {
  it.each([
    {
      prompt: "Create a summary of these 5 tickets.",
      skillId: undefined,
      answerable: true,
    },
    { prompt: "Give me an overview", skillId: undefined, answerable: true },
    { prompt: "Tell me a joke", skillId: undefined, answerable: false },
    { prompt: "Tell me a joke", skillId: "summary", answerable: true },
  ])(
    "answers '$prompt' with skill $skillId: $answerable",
    ({ prompt, skillId, answerable }) => {
      expect(isSampleAnswerable(prompt, skillId)).toBe(answerable);
    },
  );
});
