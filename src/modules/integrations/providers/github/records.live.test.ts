// The GitHub reader against the real API, opt-in: runs only with GITHUB_TEST_TOKEN set to a
// fine-grained token that can read at least one repository with issues or pull requests.
//
//   GITHUB_TEST_TOKEN=github_pat_… pnpm vitest run src/modules/integrations/providers/github
import { describe, expect, it } from "vitest";
import { githubRecords } from "./records";

const token = process.env.GITHUB_TEST_TOKEN;
const access = {
  connectionId: "live",
  baseUrl: "https://api.github.com",
  authorization: `Bearer ${token}`,
};

describe.skipIf(!token)("githubRecords on api.github.com", () => {
  it("lists repositories, pages their items, reads them back by id with comments", async () => {
    const sources = await githubRecords.listSources(access);
    expect(sources.length).toBeGreaterThan(0);

    let page;
    let key;
    for (const source of sources) {
      page = await githubRecords.searchRecords(access, source.key, {});
      key = source.key;
      if (page?.records.length) break;
    }
    expect(page?.records.length, "no repository has issues or pull requests").toBeGreaterThan(0);

    const ids = page!.records.slice(0, 5).map((record) => record.id);
    const read = await githubRecords.getRecords(access, key!, [...ids].reverse());
    expect(read.map((record) => record.id)).toEqual(ids);
    for (const record of read) {
      expect(record.id).toMatch(/^#\d+$/);
      expect(record.url).toMatch(/^https:\/\/github\.com\//);
      expect(["To do", "In progress", "In review", "Done"]).toContain(record.status);
    }
    expect(Array.isArray(await githubRecords.getComments!(access, key!, ids[0]!))).toBe(true);
  }, 30_000);
});
