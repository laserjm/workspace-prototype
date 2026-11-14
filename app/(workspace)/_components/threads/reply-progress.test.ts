import { describe, expect, it } from "vitest";
import type { WorkspaceUIMessage } from "@/modules/agent/contracts";
import { awaitsNextStep } from "./reply-progress";

type Part = WorkspaceUIMessage["parts"][number];

const reply = (...parts: Part[]): WorkspaceUIMessage => ({ id: "a1", role: "assistant", parts });
const text = (value: string, state: "streaming" | "done" = "streaming"): Part => ({
  type: "text",
  text: value,
  state,
});
const read = (
  state: "input-streaming" | "input-available" | "output-available" | "output-error",
): Part => {
  const call = {
    type: "tool-read_record",
    toolCallId: "call-1",
    input: { connectionId: "c1", type: "issue", key: "acme/web#42" },
  } as const;
  switch (state) {
    case "output-available":
      return { ...call, state, output: { error: { kind: "not_found" } } };
    case "output-error":
      return { ...call, state, errorText: "Failed" };
    default:
      return { ...call, state };
  }
};
const stepStart: Part = { type: "step-start" };

describe("awaitsNextStep", () => {
  it("waits before anything arrives", () => {
    expect(awaitsNextStep(undefined)).toBe(true);
    expect(awaitsNextStep(reply())).toBe(true);
    expect(awaitsNextStep(reply(stepStart))).toBe(true);
  });

  it("does not wait while text arrives, which shows its own progress", () => {
    expect(awaitsNextStep(reply(stepStart, text("Two are in review")))).toBe(false);
    expect(awaitsNextStep(reply(stepStart, text("Two are in review.", "done")))).toBe(false);
  });

  it("does not wait while a tool runs, whose card says so", () => {
    expect(awaitsNextStep(reply(stepStart, read("input-streaming")))).toBe(false);
    expect(awaitsNextStep(reply(stepStart, read("input-available")))).toBe(false);
  });

  // The gap that showed nothing but the timer: the tool answered and the model reads its result.
  it("waits once a tool has answered or failed, until the next step shows something", () => {
    expect(awaitsNextStep(reply(stepStart, read("output-available")))).toBe(true);
    expect(awaitsNextStep(reply(stepStart, read("output-error")))).toBe(true);
    expect(awaitsNextStep(reply(stepStart, read("output-available"), stepStart))).toBe(true);
  });

  it("waits while the model reasons or has only sent empty text, which show nothing", () => {
    expect(awaitsNextStep(reply(stepStart, { type: "reasoning", text: "…", state: "streaming" }))).toBe(true);
    expect(awaitsNextStep(reply(stepStart, text("  ")))).toBe(true);
  });
});
