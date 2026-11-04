import { describe, expect, it } from "vitest";
import { aThread, aWorkingThread } from "@/tests/factories/thread";
import {
  acknowledgeWake,
  addFollowUp,
  completeResponse,
  createScope,
  forkThread,
  isAwaitingResponse,
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

describe("isAwaitingResponse", () => {
  it.each([
    { name: "a finished thread", thread: aThread(), working: false },
    {
      name: "a thread preparing its first response",
      thread: aWorkingThread(),
      working: true,
    },
    {
      name: "a thread without a source, which gets no response",
      thread: aWorkingThread({ scope: undefined }),
      working: false,
    },
    {
      name: "a thread preparing a follow-up",
      thread: aThread({
        followUps: [
          {
            text: "Risks?",
            attachments: [],
            responseTiming: { startedAt: now.toISOString(), completedAt: null },
          },
        ],
      }),
      working: true,
    },
  ])("is $working for $name", ({ thread, working }) => {
    expect(isAwaitingResponse(thread)).toBe(working);
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
    expect(snooze(aThread(), until, now)).toEqual({
      ok: false,
      error: { _tag: "SnoozeTimeInPast" },
    });
  });

  it("refuses to snooze while a response is being prepared", () => {
    expect(snooze(aWorkingThread(), later, now)).toEqual({
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
  it("titles the thread with its prompt and starts preparing a response", () => {
    const scope = { sourceId: "jira", recordIds: ["PLAT-124"] };
    const thread = startThread(
      {
        id: "new",
        project: "workspace-prototype",
        prompt: "Summarize",
        attachments: ["notes.txt"],
        provider: "openai",
        skillId: "summary",
        scope,
      },
      now,
    );
    expect(thread).toMatchObject({
      title: "Summarize",
      age: "now",
      responseTiming: { startedAt: now.toISOString(), completedAt: null },
      scope,
    });
    expect(thread.scope?.recordIds).not.toBe(scope.recordIds);
  });
});

describe("addFollowUp", () => {
  const followUp = {
    text: "Risks?",
    attachments: [],
    provider: "openai" as const,
  };

  it("returns a settled thread to active and starts the next response", () => {
    const result = addFollowUp(
      aThread({ settledAt: earlier.toISOString() }),
      followUp,
      now,
    );
    expect(result.ok && shelfOf(result.value)).toBe("active");
    expect(result.ok && result.value.followUps).toEqual([
      {
        text: "Risks?",
        attachments: [],
        responseTiming: { startedAt: now.toISOString(), completedAt: null },
        skillId: undefined,
      },
    ]);
    expect(result.ok && result.value.provider).toBe("openai");
  });

  it("refuses a follow-up while the last response is being prepared", () => {
    expect(addFollowUp(aWorkingThread(), followUp, now)).toEqual({
      ok: false,
      error: { _tag: "ThreadStillWorking", threadId: "thread-1" },
    });
  });
});

describe("completeResponse", () => {
  it("finishes the first response", () => {
    expect(
      completeResponse(aWorkingThread(), 0, now).responseTiming.completedAt,
    ).toBe(now.toISOString());
  });

  it("finishes a follow-up's response and leaves the others", () => {
    const pending = { startedAt: earlier.toISOString(), completedAt: null };
    const thread = aThread({
      followUps: [
        { text: "a", attachments: [], responseTiming: pending },
        { text: "b", attachments: [], responseTiming: pending },
      ],
    });
    const completed = completeResponse(thread, 2, now);
    expect(
      completed.followUps?.map((item) => item.responseTiming.completedAt),
    ).toEqual([null, now.toISOString()]);
  });
});

describe("forkThread", () => {
  const done = {
    startedAt: earlier.toISOString(),
    completedAt: now.toISOString(),
  };
  const thread = aThread({
    title: "Fork: Sprint 24 summary",
    settledAt: now.toISOString(),
    followUps: [
      { text: "a", attachments: [], responseTiming: done },
      {
        text: "b",
        attachments: [],
        responseTiming: { ...done, completedAt: null },
      },
    ],
  });

  it("copies the conversation through the chosen response, active and with its scope", () => {
    const result = forkThread(thread, 1, "fork-1");
    expect(result.ok && result.value).toMatchObject({
      id: "fork-1",
      title: "Fork: Sprint 24 summary",
      age: "now",
      settledAt: undefined,
      followUps: [{ text: "a" }],
      forkedFrom: {
        threadId: "thread-1",
        title: "Fork: Sprint 24 summary",
        responseIndex: 1,
      },
      scope: thread.scope,
    });
    expect(result.ok && result.value.scope?.recordIds).not.toBe(
      thread.scope?.recordIds,
    );
  });

  it.each([2, 5])(
    "refuses to fork from response %i, which has not finished",
    (index) => {
      expect(forkThread(thread, index, "fork-1")).toEqual({
        ok: false,
        error: { _tag: "ResponseNotFinished" },
      });
    },
  );
});
