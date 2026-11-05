import { describe, expect, it } from "vitest";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import {
  allRecordIds,
  countByStatus,
  recordCountLabel,
  recordsIn,
  searchRecords,
} from "./contracts";

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

describe("searchRecords", () => {
  const records = [
    aSourceRecord({
      id: "PLAT-124",
      title: "Enable SSO",
      status: "In progress",
      priority: "High",
      owner: "Maya Chen",
    }),
    aSourceRecord({
      id: "PLAT-125",
      title: "Audit log export",
      status: "In review",
      priority: "High",
      owner: "Jonas Weber",
      risk: "Blocked by the SSO rollout.",
    }),
    aSourceRecord({
      id: "PLAT-126",
      title: "Dark mode",
      status: "In review",
      priority: "Low",
      owner: "Maya Chen",
    }),
  ];
  const ids = (input: Parameters<typeof searchRecords>[1]) =>
    searchRecords(records, input).matches.map((match) => match.id);

  it.each([
    { name: "no filter", input: {}, expected: ["PLAT-124", "PLAT-125", "PLAT-126"] },
    { name: "a status", input: { status: "In review" as const }, expected: ["PLAT-125", "PLAT-126"] },
    {
      name: "every filter given",
      input: { status: "In review" as const, priority: "High" as const },
      expected: ["PLAT-125"],
    },
    { name: "part of an owner, any case", input: { owner: "maya" }, expected: ["PLAT-124", "PLAT-126"] },
    { name: "words in a recorded risk", input: { text: "sso" }, expected: ["PLAT-124", "PLAT-125"] },
    { name: "an id", input: { text: "plat-126" }, expected: ["PLAT-126"] },
    { name: "nothing", input: { owner: "Nobody" }, expected: [] },
  ])("matches $name", ({ input, expected }) => {
    expect(ids(input)).toEqual(expected);
  });

  it("answers how many records it searched, and each match's key fields only", () => {
    expect(searchRecords(records, { text: "dark" })).toEqual({
      searched: 3,
      matches: [
        {
          id: "PLAT-126",
          title: "Dark mode",
          status: "In review",
          priority: "Low",
          owner: "Maya Chen",
          updated: "Today, 09:00",
        },
      ],
    });
  });
});
