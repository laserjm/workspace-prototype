import { describe, expect, it, vi } from "vitest";
import { aUser } from "@/tests/factories/user";
import {
  listScopedRecords,
  listSources,
  searchSourceRecords,
} from "./queries";

// The sample connection alone, without the compose Postgres.
vi.mock("@/modules/integrations/queries", () =>
  import("@/tests/support/connections"),
);

const user = aUser("ana");

describe("listSources", () => {
  it("lists the sample connection's sources, with their product's presentation and no records", async () => {
    const sources = await listSources(user);
    expect(sources.map((source) => source.id)).toEqual([
      "sample:jira",
      "sample:confluence",
      "sample:codebeamer",
    ]);
    expect(sources[0]).toMatchObject({
      connectionId: "sample",
      icon: "jira",
      name: "Jira",
      singular: "ticket",
      plural: "tickets",
      hasBoard: true,
    });
    expect(sources[0]).not.toHaveProperty("records");
  });
});

describe("searchSourceRecords", () => {
  it("reads a source's records through its connection", async () => {
    const page = await searchSourceRecords(user, "sample:jira", {});
    expect(page?.records.map((record) => record.id)).toContain("PLAT-124");
  });

  it("narrows to the records whose id, title or owner holds the words", async () => {
    const page = await searchSourceRecords(user, "sample:jira", {
      text: "maya",
    });
    expect(page?.records.map((record) => record.owner)).toEqual(["Maya Chen"]);
  });

  it.each(["sample:sharepoint", "github:acme/web", "jira", ":jira", "sample:"])(
    "has no source %s",
    async (sourceId) => {
      expect(await searchSourceRecords(user, sourceId, {})).toBeUndefined();
    },
  );
});

describe("listScopedRecords", () => {
  it("returns the named records that exist, in the source's order", async () => {
    const records = await listScopedRecords(user, {
      sourceId: "sample:jira",
      recordIds: ["PLAT-126", "GONE-1", "PLAT-124"],
    });
    expect(records.map((record) => record.id)).toEqual([
      "PLAT-124",
      "PLAT-126",
    ]);
  });

  it("returns none for a source the user does not have", async () => {
    expect(
      await listScopedRecords(user, {
        sourceId: "github:acme/web",
        recordIds: ["1"],
      }),
    ).toEqual([]);
  });
});
