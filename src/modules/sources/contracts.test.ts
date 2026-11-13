import { describe, expect, it } from "vitest";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import {
  countByStatus,
  recordCountLabel,
  sourceIdOf,
  sourceRefOf,
} from "./contracts";

describe("sourceIdOf and sourceRefOf", () => {
  it.each([
    { connectionId: "sample", sourceKey: "jira" },
    { connectionId: "c-42", sourceKey: "laserjm/workspace-prototype" },
    { connectionId: "c-7", sourceKey: "space:PLATFORM" },
  ])("round-trips $connectionId and $sourceKey", (ref) => {
    expect(sourceRefOf(sourceIdOf(ref))).toEqual(ref);
  });

  it.each(["jira", ":jira", "sample:", ""])(
    "names no source with %j",
    (sourceId) => {
      expect(sourceRefOf(sourceId)).toBeUndefined();
    },
  );
});

describe("recordCountLabel", () => {
  const source = aSource({ singular: "ticket", plural: "tickets" });

  it.each([
    { count: 0, label: "0 tickets" },
    { count: 1, label: "1 ticket" },
    { count: 5, label: "5 tickets" },
  ])("labels $count as $label", ({ count, label }) => {
    expect(recordCountLabel(source, count)).toBe(label);
  });
});

describe("countByStatus", () => {
  it("counts every status, including the empty ones", () => {
    const records = [
      aSourceRecord({ status: "Done" }),
      aSourceRecord({ status: "Done" }),
      aSourceRecord({ status: "In review" }),
    ];
    expect(countByStatus(records)).toEqual([
      { status: "To do", count: 0 },
      { status: "In progress", count: 0 },
      { status: "In review", count: 1 },
      { status: "Done", count: 2 },
    ]);
  });
});
