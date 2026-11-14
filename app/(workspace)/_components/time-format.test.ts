import { describe, expect, it } from "vitest";
import {
  formatResponseDuration,
  formatResponseTimeTooltip,
  toLocalDateTime,
} from "./time-format";

describe("formatResponseDuration", () => {
  it.each([
    { ms: -1, label: "0ms" },
    { ms: Number.NaN, label: "0ms" },
    { ms: 0.2, label: "1ms" },
    { ms: 640, label: "640ms" },
    { ms: 2_400, label: "2.4s" },
    { ms: 42_000, label: "42s" },
    { ms: 106_000, label: "1m 46s" },
    { ms: 3_600_000, label: "1h" },
    { ms: 3_725_000, label: "1h 2m 5s" },
  ])("shows $ms ms as $label", ({ ms, label }) => {
    expect(formatResponseDuration(ms)).toBe(label);
  });
});

describe("toLocalDateTime", () => {
  it("formats a date for a datetime-local input in local time", () => {
    expect(toLocalDateTime(new Date(2026, 10, 4, 9, 5))).toBe(
      "2026-11-04T09:05",
    );
  });
});

describe("formatResponseTimeTooltip", () => {
  it.each([
    { day: 1, suffix: "1st" },
    { day: 2, suffix: "2nd" },
    { day: 3, suffix: "3rd" },
    { day: 4, suffix: "4th" },
    { day: 11, suffix: "11th" },
    { day: 12, suffix: "12th" },
    { day: 13, suffix: "13th" },
    { day: 21, suffix: "21st" },
    { day: 22, suffix: "22nd" },
  ])("writes day $day as $suffix", ({ day, suffix }) => {
    const timestamp = new Date(2026, 9, day, 14, 5).toISOString();
    expect(formatResponseTimeTooltip(timestamp)).toBe(
      `14:05, ${suffix} October 2026`,
    );
  });
});
