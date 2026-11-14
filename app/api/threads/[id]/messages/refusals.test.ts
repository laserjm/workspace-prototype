// The status and copy each error answers with on the thread messages route. No Next: the mapping
// is a plain function beside the route.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignedOut } from "@/lib/auth";
import * as threads from "@/modules/threads";
import { agentRefusal, threadRefusal, thrownResponse } from "./refusals";

async function answer(error: unknown) {
  const response = thrownResponse(error);
  return { status: response.status, body: await response.json() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("thrownResponse", () => {
  it.each([
    [new SignedOut(), 401, "Sign in to continue."],
    [new threads.ThreadNotFound("t1"), 404, "Thread not found."],
    [new threads.ForeignConnectionAttached(["c1"]), 400, "Invalid chat request."],
    [new threads.MessagesRejected("bad part"), 400, "Invalid chat messages."],
    [new threads.ModelNotFound("m1"), 400, "Invalid chat request."],
    [new threads.SkillNotFound("s1"), 400, "Invalid chat request."],
  ])("answers %s with %i", async (error, status, copy) => {
    expect(await answer(error)).toEqual({ status, body: { error: copy } });
  });

  it.each([
    new threads.ProjectNotFound("p1"),
    new threads.ThreadIdTaken("t1"),
    new threads.ResponseNotFound("m1"),
    new threads.SnoozeTimeInPast("2026-01-01T00:00:00Z"),
    new Error("boom"),
  ])("logs %s as a bug, which nothing this route calls throws, and answers 500", async (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await answer(error)).toEqual({
      status: 500,
      body: { error: "Something went wrong on the server. Try again in a moment." },
    });
    expect(log).toHaveBeenCalledWith("[api/threads/messages]", error);
  });

  it("never lets the answer be cached", () => {
    expect(thrownResponse(new threads.ThreadNotFound("t1")).headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
  });
});

describe("threadRefusal and agentRefusal", () => {
  it("rethrow what is not their module's", () => {
    const other = new Error("boom");
    expect(() => threadRefusal(other)).toThrow(other);
    expect(() => threadRefusal(new threads.ModelNotFound("m1"))).toThrow(threads.ModelNotFound);
    expect(() => agentRefusal(other)).toThrow(other);
    expect(() => agentRefusal(new threads.ThreadNotFound("t1"))).toThrow(threads.ThreadNotFound);
  });
});
