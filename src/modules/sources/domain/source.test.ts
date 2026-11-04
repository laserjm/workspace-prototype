import { describe, expect, it } from "vitest";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import {
  allRecordIds,
  countByStatus,
  recordCountLabel,
  recordsIn,
} from "./source";

describe("recordsIn", () => {
  const source = aSource({
    records: [
      aSourceRecord({ id: "A-1" }),
      aSourceRecord({ id: "A-2" }),
      aSourceRecord({ id: "A-3" }),
    ],
  });

  it.each([
    { ids: ["A-3", "A-1"], expected: ["A-1", "A-3"] },
    { ids: ["A-2", "UNKNOWN"], expected: ["A-2"] },
    { ids: [], expected: [] },
  ])(
    "returns $expected for $ids in the source's order",
    ({ ids, expected }) => {
      expect(recordsIn(source, ids).map((record) => record.id)).toEqual(
        expected,
      );
    },
  );

  it("lists every record id of a source", () => {
    expect(allRecordIds(source)).toEqual(["A-1", "A-2", "A-3"]);
  });
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
