import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aThread } from "@/test/factories";
import {
  acknowledgeWake,
  answerThreadInput,
  continueThread,
  countTurn,
  customSnoozeTime,
  forkThreadInput,
  isWakeDue,
  placeThreadInput,
  placementOf,
  restore,
  settle,
  shelfOf,
  snooze,
  snoozePresets,
  snoozeRefusal,
  startThreadInput,
  wake,
  wakeIfDue,
  withPlacement,
  type CustomSnooze,
} from "./contracts";

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
      placement: { settledAt: now.toISOString(), snoozedUntil: later.toISOString() },
      shelf: "snoozed",
    },
  ])("puts $placement on the $shelf shelf", ({ placement, shelf }) => {
    expect(shelfOf(placement)).toBe(shelf);
  });
});

describe("settle", () => {
  it("settles a snoozed thread and clears its snooze", () => {
    const settled = settle(aThread({ snoozedUntil: later.toISOString() }), now);
    expect(placementOf(settled)).toEqual({
      settledAt: now.toISOString(),
      snoozedUntil: undefined,
      wokeAt: undefined,
    });
  });
});

describe("snoozeRefusal", () => {
  it("allows a future time while nothing is in flight", () => {
    expect(snoozeRefusal(later, now, false)).toBeUndefined();
  });

  it.each([
    { name: "now", until: now },
    { name: "a past time", until: earlier },
    { name: "an invalid date", until: new Date(Number.NaN) },
  ])("refuses to snooze until $name", ({ until }) => {
    expect(snoozeRefusal(until, now, false)).toBe("time-in-past");
  });

  it("refuses to snooze while a response is being prepared", () => {
    expect(snoozeRefusal(later, now, true)).toBe("still-working");
  });
});

describe("snooze", () => {
  it("snoozes a finished thread until a future time", () => {
    const snoozed = snooze(aThread({ settledAt: earlier.toISOString() }), later);
    expect(placementOf(snoozed)).toEqual({
      settledAt: undefined,
      snoozedUntil: later.toISOString(),
      wokeAt: undefined,
    });
  });
});

describe("restore", () => {
  it("restores a parked thread to active", () => {
    expect(shelfOf(restore(aThread({ settledAt: now.toISOString() })))).toBe("active");
  });
});

describe("isWakeDue", () => {
  it.each([
    { snoozedUntil: earlier.toISOString(), due: true },
    { snoozedUntil: now.toISOString(), due: true },
    { snoozedUntil: later.toISOString(), due: false },
    { snoozedUntil: undefined, due: false },
  ])("is due to wake: $due when snoozed until $snoozedUntil", ({ snoozedUntil, due }) => {
    expect(isWakeDue(aThread({ snoozedUntil }), now)).toBe(due);
  });
});

describe("wake and acknowledgeWake", () => {
  it("wakes a thread to active and marks it until it is opened", () => {
    const woken = wake(aThread({ snoozedUntil: earlier.toISOString() }), now);
    expect(shelfOf(woken)).toBe("active");
    expect(woken.wokeAt).toBe(now.toISOString());
    expect(acknowledgeWake(woken).wokeAt).toBeUndefined();
  });
});

describe("withPlacement", () => {
  it("puts a thread back where it was", () => {
    const thread = aThread({ snoozedUntil: later.toISOString() });
    expect(placementOf(withPlacement(settle(thread, now), placementOf(thread)))).toEqual(
      placementOf(thread),
    );
  });
});

describe("wakeIfDue", () => {
  it("reads a snooze whose time has come as woken at its deadline", () => {
    expect(wakeIfDue(aThread({ snoozedUntil: earlier.toISOString() }), now)).toMatchObject({
      snoozedUntil: undefined,
      wokeAt: earlier.toISOString(),
    });
  });

  it.each([
    { name: "a snooze still running", placement: { snoozedUntil: later.toISOString() } },
    { name: "a settled thread", placement: { settledAt: earlier.toISOString() } },
    { name: "an active thread", placement: {} },
  ])("leaves $name as it is", ({ placement }) => {
    const thread = aThread(placement);
    expect(wakeIfDue(thread, now)).toBe(thread);
  });
});

describe("snoozePresets", () => {
  // Wednesday 4 November 2026, 14:30 local time
  const now = new Date(2026, 10, 4, 14, 30);

  it("offers a minute, an hour, tomorrow at 09:00 and next Monday at 09:00", () => {
    expect(snoozePresets(now).map((preset) => [preset.id, preset.until])).toEqual([
      ["minute", new Date(2026, 10, 4, 14, 31)],
      ["hour", new Date(2026, 10, 4, 15, 30)],
      ["tomorrow", new Date(2026, 10, 5, 9, 0)],
      ["monday", new Date(2026, 10, 9, 9, 0)],
    ]);
  });

  it("chooses the Monday after next when today is Monday", () => {
    const monday = new Date(2026, 10, 9, 8, 0);
    expect(snoozePresets(monday).at(-1)?.until).toEqual(new Date(2026, 10, 16, 9, 0));
  });
});

describe("customSnoozeTime", () => {
  const now = new Date(2026, 10, 4, 14, 30);

  it.each<{ request: CustomSnooze; until: Date }>([
    { request: { mode: "duration", minutes: "30" }, until: new Date(2026, 10, 4, 15, 0) },
    {
      request: { mode: "date", localDateTime: "2026-11-05T09:15" },
      until: new Date(2026, 10, 5, 9, 15),
    },
  ])("reads $request", ({ request, until }) => {
    expect(customSnoozeTime(request, now)).toEqual(until);
  });

  it.each<{ request: CustomSnooze }>([
    { request: { mode: "duration", minutes: "0" } },
    { request: { mode: "duration", minutes: "-5" } },
    { request: { mode: "date", localDateTime: "2026-11-04T14:00" } },
  ])("reads $request as a time snoozeRefusal refuses as past", ({ request }) => {
    const until = customSnoozeTime(request, now);
    expect(until).toBeInstanceOf(Date);
    expect(until && snoozeRefusal(until, now, false)).toBe("time-in-past");
  });

  it.each<{ request: CustomSnooze }>([
    { request: { mode: "duration", minutes: "" } },
    { request: { mode: "duration", minutes: "soon" } },
    { request: { mode: "date", localDateTime: "" } },
  ])("cannot read $request", ({ request }) => {
    expect(customSnoozeTime(request, now)).toBeUndefined();
  });
});

describe("continueThread", () => {
  it("returns a settled thread to active and records the provider", () => {
    const thread = continueThread(
      aThread({ settledAt: earlier.toISOString(), provider: "claude" }),
      "openai",
    );
    expect(shelfOf(thread)).toBe("active");
    expect(thread.provider).toBe("openai");
  });
});

describe("countTurn", () => {
  it("adds a question and its attachments", () => {
    const thread = countTurn(aThread({ turnCount: 2, attachmentCount: 1 }), 3);
    expect(thread).toMatchObject({ turnCount: 3, attachmentCount: 4 });
  });
});

// The input schemas the adapters parse with: an id that is not a uuid never reaches a use case.

describe("startThreadInput", () => {
  it("takes a first message under a fresh uuid, in a project or none", () => {
    const input = { id: randomUUID(), projectId: null, prompt: " Hi ", provider: "claude" };
    expect(startThreadInput.parse(input)).toEqual({ ...input, prompt: "Hi" });
  });

  it.each([
    { name: "a thread id that is not a uuid", change: { id: "thread-1" } },
    { name: "a project id that is not a uuid", change: { projectId: "project-1" } },
    { name: "an empty prompt", change: { prompt: "  " } },
    { name: "a provider the agent does not have", change: { provider: "gemini" } },
  ])("refuses $name", ({ change }) => {
    const input = { id: randomUUID(), projectId: null, prompt: "Hi", provider: "claude" };
    expect(startThreadInput.safeParse({ ...input, ...change }).success).toBe(false);
  });
});

describe("forkThreadInput", () => {
  it("refuses a thread id that is not a uuid", () => {
    expect(
      forkThreadInput.safeParse({ fromThreadId: "thread-1", id: randomUUID(), throughMessageId: "a1" })
        .success,
    ).toBe(false);
  });
});

describe("placeThreadInput", () => {
  it("takes a snooze until a timestamp with its offset", () => {
    const input = {
      threadId: randomUUID(),
      change: { kind: "snooze", until: "2099-01-05T09:00:00.000Z" },
    };
    expect(placeThreadInput.parse(input)).toEqual(input);
  });

  it.each([
    { name: "a thread id that is not a uuid", input: { threadId: "thread-1", change: { kind: "settle" } } },
    { name: "a change it does not know", input: { threadId: randomUUID(), change: { kind: "archive" } } },
    {
      name: "a snooze until a time that is not a timestamp",
      input: { threadId: randomUUID(), change: { kind: "snooze", until: "tomorrow" } },
    },
    {
      name: "a return to two placements at once",
      input: {
        threadId: randomUUID(),
        change: {
          kind: "return",
          placement: { settledAt: now.toISOString(), snoozedUntil: later.toISOString() },
        },
      },
    },
  ])("refuses $name", ({ input }) => {
    expect(placeThreadInput.safeParse(input).success).toBe(false);
  });
});

describe("answerThreadInput", () => {
  it("takes the chat's latest message, keeping its parts", () => {
    const message = { id: "u3", role: "user", parts: [{ type: "text", text: "And now?" }] };
    expect(answerThreadInput.parse({ modelId: "opus", message })).toEqual({ message });
  });

  it.each([
    { name: "a body that is not a chat turn", body: { modelId: "opus" } },
    {
      name: "a message that is not the user's",
      body: { message: { id: "a3", role: "assistant", parts: [] } },
    },
  ])("refuses $name", ({ body }) => {
    expect(answerThreadInput.safeParse(body).success).toBe(false);
  });
});
