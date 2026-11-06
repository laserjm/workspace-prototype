import { describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/user";
import { aUser } from "@/tests/factories/user";
import type { RecordScope } from "./contracts";
import { searchSourceRecords } from "./queries";
import { sourceTools } from "./tools";

// The sample connection alone, without the compose Postgres.
vi.mock("@/modules/integrations/queries", () =>
  import("@/tests/support/connections"),
);

const user = aUser("ana");

const searchRecords = (
  scope: RecordScope | undefined,
  text?: string,
  context: { user?: User; scope?: RecordScope } = { user, scope },
) =>
  sourceTools.search_records.execute(
    { text },
    { toolCallId: "call-1", messages: [], context },
  );

describe("search_records", () => {
  it("searches only the records the thread attached", async () => {
    const page = await searchSourceRecords(user, "sample:jira", {});
    const [first, second, outside] = page!.records;
    const scope = {
      sourceId: "sample:jira",
      recordIds: [first!.id, second!.id],
    };
    expect(await searchRecords(scope)).toMatchObject({ searched: 2 });
    expect(await searchRecords(scope, outside!.id)).toEqual({
      searched: 2,
      matches: [],
    });
  });

  it("finds nothing in a source the user does not have", async () => {
    expect(
      await searchRecords({ sourceId: "sharepoint:docs", recordIds: ["X-1"] }),
    ).toEqual({ searched: 0, matches: [] });
  });

  it("refuses to run without attached records or a user", async () => {
    const scope = { sourceId: "sample:jira", recordIds: ["PLAT-124"] };
    await expect(searchRecords(undefined)).rejects.toThrow(
      "No records are attached",
    );
    await expect(
      searchRecords(scope, undefined, { scope }),
    ).rejects.toThrow("No records are attached");
  });
});
