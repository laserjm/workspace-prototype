import { describe, expect, it } from "vitest";
import { aThread } from "@/tests/factories/thread";
import {
  acknowledgeWake,
  continueThread,
  createScope,
  forkThread,
  isWakeDue,
  placementOf,
  restore,
  settle,
  shelfOf,
  snooze,
  startThread,
  wake,
  withPlacement,
} from "./thread";

const now = new Date("2026-11-04T10:00:00.000Z");
const later = new Date("2026-11-04T11:00:00.000Z");
const earlier = new Date("2026-11-04T09:00:00.000Z");

describe("shelfOf", () => {
  it.each([
    { placement: {}, shelf: "active" },
    { placement: { wokeAt: now.toISOString() }, shelf: "active" },
    { placement: { settledAt: now.toISOString() }, shelf: "settled" },
    { placement: { snoozedUntil: later.toISOString() }, shelf: "snoozed" },
    {
      placement: {
        settledAt: now.toISOString(),
        snoozedUntil: later.toISOString(),
      },
      shelf: "snoozed",
    },
  ])("puts $placement on the $shelf shelf", ({ placement, shelf }) => {
    expect(shelfOf(placement)).toBe(shelf);
  });
});

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

describe("settle, snooze, restore and wake", () => {
  it("settles a snoozed thread and clears its snooze", () => {
    const settled = settle(aThread({ snoozedUntil: later.toISOString() }), now);
    expect(placementOf(settled)).toEqual({
      settledAt: now.toISOString(),
      snoozedUntil: undefined,
      wokeAt: undefined,
    });
  });

  it("snoozes a finished thread until a future time", () => {
    const result = snooze(
      aThread({ settledAt: earlier.toISOString() }),
      later,
      now,
      false,
    );
    expect(result.ok && placementOf(result.value)).toEqual({
      settledAt: undefined,
      snoozedUntil: later.toISOString(),
      wokeAt: undefined,
    });
  });

  it.each([
    { name: "now", until: now },
    { name: "a past time", until: earlier },
    { name: "an invalid date", until: new Date(Number.NaN) },
  ])("refuses to snooze until $name", ({ until }) => {
    expect(snooze(aThread(), until, now, false)).toEqual({
      ok: false,
      error: { _tag: "SnoozeTimeInPast" },
    });
  });

  it("refuses to snooze while a response is being prepared", () => {
    expect(snooze(aThread(), later, now, true)).toEqual({
      ok: false,
      error: { _tag: "ThreadStillWorking", threadId: "thread-1" },
    });
  });

  it("restores a parked thread to active", () => {
    expect(shelfOf(restore(aThread({ settledAt: now.toISOString() })))).toBe(
      "active",
    );
  });

  it.each([
    { snoozedUntil: earlier.toISOString(), due: true },
    { snoozedUntil: now.toISOString(), due: true },
    { snoozedUntil: later.toISOString(), due: false },
    { snoozedUntil: undefined, due: false },
  ])(
    "is due to wake: $due when snoozed until $snoozedUntil",
    ({ snoozedUntil, due }) => {
      expect(isWakeDue(aThread({ snoozedUntil }), now)).toBe(due);
    },
  );

  it("wakes a thread to active and marks it until it is opened", () => {
    const woken = wake(aThread({ snoozedUntil: earlier.toISOString() }), now);
    expect(shelfOf(woken)).toBe("active");
    expect(woken.wokeAt).toBe(now.toISOString());
    expect(acknowledgeWake(woken).wokeAt).toBeUndefined();
  });

  it("puts a thread back where it was", () => {
    const thread = aThread({ snoozedUntil: later.toISOString() });
    expect(
      placementOf(withPlacement(settle(thread, now), placementOf(thread))),
    ).toEqual(placementOf(thread));
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
