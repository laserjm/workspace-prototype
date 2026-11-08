import { describe, expect, it } from "vitest";
import type { WorkspaceUIMessage } from "@/modules/agent";
import { lastRequest } from "./last-request";

function message(
  id: string,
  role: "user" | "assistant",
  metadata?: WorkspaceUIMessage["metadata"],
): WorkspaceUIMessage {
  return { id, role, parts: [], ...(metadata ? { metadata } : {}) };
}

describe("lastRequest", () => {
  it("reads the model and skill of the latest question", () => {
    expect(
      lastRequest([
        message("u1", "user", { modelId: "opus", skillId: "summary" }),
        message("a1", "assistant", { modelId: "opus" }),
        message("u2", "user", { modelId: "sonnet", skillId: "risk-review" }),
      ]),
    ).toEqual({ modelId: "sonnet", skillId: "risk-review" });
  });

  it("falls back to the model of the reply to a question that names none", () => {
    expect(
      lastRequest([
        message("u1", "user"),
        message("a1", "assistant", { modelId: "opus", skillId: "summary" }),
      ]),
    ).toEqual({ modelId: "opus", skillId: undefined });
  });

  it("knows nothing of a conversation without questions", () => {
    expect(lastRequest([])).toEqual({});
  });
});
