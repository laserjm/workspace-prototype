import { describe, expect, it } from "vitest";
import { sampleSourceCatalog } from "./catalog";
import type { RecordScope } from "./contracts";
import { sourceTools } from "./tools";

const searchRecords = (scope: RecordScope | undefined, text?: string) =>
  sourceTools.search_records.execute(
    { text },
    { toolCallId: "call-1", messages: [], context: { scope } },
  );

describe("search_records", () => {
  const jira = sampleSourceCatalog.find((source) => source.id === "jira")!;
  const [first, second, outside] = jira.records;

  it("searches only the records the thread attached", async () => {
    const scope = { sourceId: "jira", recordIds: [first!.id, second!.id] };
    const result = await searchRecords(scope);
    expect(result).toMatchObject({ searched: 2 });
    expect(await searchRecords(scope, outside!.id)).toEqual({
      searched: 2,
      matches: [],
    });
  });

  it("finds nothing in a source that does not exist", async () => {
    expect(
      await searchRecords({ sourceId: "sharepoint", recordIds: ["X-1"] }),
    ).toEqual({ searched: 0, matches: [] });
  });

  it("refuses to run without attached records", async () => {
    await expect(searchRecords(undefined)).rejects.toThrow(
      "No records are attached",
    );
  });
});
