import { describe, expect, it, vi } from "vitest";
import { aUser } from "@/tests/factories/user";
import {
  findSource,
  listScopedRecords,
  listSources,
  readScopedRecord,
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
      system: "Sample data",
      account: "Sample data",
      availability: "snapshot",
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

describe("findSource", () => {
  it("finds one of the user's sources by its id", async () => {
    expect(await findSource(user, "sample:confluence")).toMatchObject({
      id: "sample:confluence",
      name: "Confluence",
    });
  });

  it.each(["sample:sharepoint", "github:acme/web", "jira"])(
    "finds nothing for %s",
    async (sourceId) => {
      expect(await findSource(user, sourceId)).toBeUndefined();
    },
  );
});

describe("readScopedRecord", () => {
  const scope = { sourceId: "sample:jira", recordIds: ["PLAT-124", "PLAT-125"] };

  it("reads a scoped record in full, its sample notes as fields", async () => {
    const record = await readScopedRecord(user, scope, "PLAT-124");
    expect(record).toMatchObject({
      id: "PLAT-124",
      description: expect.stringContaining("SAML"),
      fields: {
        Summary: expect.any(String),
        Risk: expect.any(String),
        "Next step": expect.any(String),
      },
      comments: [],
    });
    expect(record).not.toHaveProperty("summary");
  });

  it.each([
    { name: "a record outside the scope", id: "PLAT-126", where: scope },
    {
      name: "a record of a source the user does not have",
      id: "#1",
      where: { sourceId: "github:acme/web", recordIds: ["#1"] },
    },
  ])("reads nothing for $name", async ({ id, where }) => {
    expect(await readScopedRecord(user, where, id)).toBeUndefined();
  });
});
