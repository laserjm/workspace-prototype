import { describe, expect, it } from "vitest";
import { aThread } from "@/tests/factories/thread";
import {
  acknowledgeWake,
  customSnoozeTime,
  isWakeDue,
  placementOf,
  restore,
  settle,
  shelfOf,
  snooze,
  snoozePresets,
  wake,
  wakeIfDue,
  withPlacement,
} from "./placement";

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


describe("wakeIfDue", () => {
  it("reads a snooze whose time has come as woken at its deadline", () => {
    expect(
      wakeIfDue(aThread({ snoozedUntil: earlier.toISOString() }), now),
    ).toMatchObject({ snoozedUntil: undefined, wokeAt: earlier.toISOString() });
  });

  it.each([
    {
      name: "a snooze still running",
      placement: { snoozedUntil: later.toISOString() },
    },
    {
      name: "a settled thread",
      placement: { settledAt: earlier.toISOString() },
    },
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
    expect(
      snoozePresets(now).map((preset) => [preset.id, preset.until]),
    ).toEqual([
      ["minute", new Date(2026, 10, 4, 14, 31)],
      ["hour", new Date(2026, 10, 4, 15, 30)],
      ["tomorrow", new Date(2026, 10, 5, 9, 0)],
      ["monday", new Date(2026, 10, 9, 9, 0)],
    ]);
  });

  it("chooses the Monday after next when today is Monday", () => {
    const monday = new Date(2026, 10, 9, 8, 0);
    expect(snoozePresets(monday).at(-1)?.until).toEqual(
      new Date(2026, 10, 16, 9, 0),
    );
  });
});

describe("customSnoozeTime", () => {
  const now = new Date(2026, 10, 4, 14, 30);

  it.each([
    {
      request: { mode: "duration", minutes: "30" },
      until: new Date(2026, 10, 4, 15, 0),
    },
    {
      request: { mode: "date", localDateTime: "2026-11-05T09:15" },
      until: new Date(2026, 10, 5, 9, 15),
    },
  ] as const)("reads $request", ({ request, until }) => {
    expect(customSnoozeTime(request, now)).toEqual({ ok: true, value: until });
  });

  it.each([
    { request: { mode: "duration", minutes: "0" }, tag: "SnoozeTimeInPast" },
    { request: { mode: "duration", minutes: "-5" }, tag: "SnoozeTimeInPast" },
    {
      request: { mode: "date", localDateTime: "2026-11-04T14:00" },
      tag: "SnoozeTimeInPast",
    },
    { request: { mode: "duration", minutes: "" }, tag: "SnoozeTimeUnreadable" },
    {
      request: { mode: "duration", minutes: "soon" },
      tag: "SnoozeTimeUnreadable",
    },
    {
      request: { mode: "date", localDateTime: "" },
      tag: "SnoozeTimeUnreadable",
    },
  ] as const)("refuses $request with $tag", ({ request, tag }) => {
    expect(customSnoozeTime(request, now)).toEqual({
      ok: false,
      error: { _tag: tag },
    });
  });
});
