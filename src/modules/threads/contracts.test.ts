import { describe, expect, it } from "vitest";
import { aThread } from "@/tests/factories/thread";
import {
  continueThread,
  createScope,
  forkThread,
  startThread,
} from "./contracts";
import { shelfOf } from "./placement";

const now = new Date("2026-11-04T10:00:00.000Z");
const earlier = new Date("2026-11-04T09:00:00.000Z");

describe("createScope", () => {
  it("keeps the records it was given", () => {
    expect(createScope("jira", ["PLAT-124"])).toEqual({
      ok: true,
      value: { sourceId: "jira", recordIds: ["PLAT-124"] },
    });
  });

  it("refuses a scope without records", () => {
    expect(createScope("jira", [])).toEqual({
      ok: false,
      error: { _tag: "ScopeHasNoRecords" },
    });
  });
});


describe("startThread", () => {
  it("titles the thread with its first message and copies the scope", () => {
    const scope = { sourceId: "jira", recordIds: ["PLAT-124"] };
    const thread = startThread(
      {
        id: "new",
        projectId: null,
        prompt: "Summarize",
        provider: "openai",
        scope,
      },
      now,
    );
    expect(thread).toEqual({
      id: "new",
      projectId: null,
      title: "Summarize",
      branch: "main",
      createdAt: now.toISOString(),
      provider: "openai",
      scope,
    });
    expect(thread.scope?.recordIds).not.toBe(scope.recordIds);
  });
});


describe("continueThread", () => {
  it("returns a settled thread to active and records the provider", () => {
    const result = continueThread(
      aThread({ settledAt: earlier.toISOString(), provider: "claude" }),
      "openai",
      false,
    );
    expect(result.ok && shelfOf(result.value)).toBe("active");
    expect(result.ok && result.value.provider).toBe("openai");
  });

  it("refuses while the last response is in flight", () => {
    expect(continueThread(aThread(), "claude", true)).toEqual({
      ok: false,
      error: { _tag: "ThreadStillWorking", threadId: "thread-1" },
    });
  });
});


describe("forkThread", () => {
  it("copies the thread as active, keeps its project and scope, and names its origin", () => {
    const thread = aThread({
      title: "Fork: Sprint 24 summary",
      settledAt: now.toISOString(),
    });
    const fork = forkThread(thread, 2, "fork-1", now);
    expect(fork).toMatchObject({
      id: "fork-1",
      title: "Fork: Sprint 24 summary",
      createdAt: now.toISOString(),
      settledAt: undefined,
      projectId: thread.projectId,
      scope: thread.scope,
      forkedFrom: {
        threadId: "thread-1",
        title: "Fork: Sprint 24 summary",
        responseIndex: 2,
      },
    });
    expect(fork.scope?.recordIds).not.toBe(thread.scope?.recordIds);
  });
});
