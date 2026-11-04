import { describe, expect, it } from "vitest";
import { customSnoozeTime, snoozePresets } from "./snooze";

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
