// The GitHub reader against a fake GitHub: responses in the REST API's shape (trimmed to the
// fields the reader parses, as `GET /repos/{owner}/{repo}/issues` answers them). No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeRecordReader } from "@/tests/support/record-reader";
import { GithubError } from "./api";
import { githubRecords } from "./records";

const access = {
  connectionId: "c1",
  baseUrl: "https://api.github.com",
  authorization: "Bearer github_pat_test",
};

const repo = (fullName: string, hasIssues = true) => ({
  full_name: fullName,
  name: fullName.split("/")[1],
  description: fullName === "acme/app" ? "The app" : null,
  html_url: `https://github.com/${fullName}`,
  owner: { login: fullName.split("/")[0] },
  has_issues: hasIssues,
});

function anIssue(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Item ${number}`,
    state: "open",
    state_reason: null,
    html_url: `https://github.com/acme/app/issues/${number}`,
    body: `Body of ${number}`,
    user: { login: "ana" },
    assignee: null,
    labels: [],
    milestone: null,
    comments: 0,
    created_at: "2026-10-01T09:00:00Z",
    // Newer numbers changed later, so the list's order is by number too.
    updated_at: `2026-11-0${Math.min(number, 9)}T${String(10 + number).padStart(2, "0")}:00:00Z`,
    ...overrides,
  };
}

const pr = (number: number, overrides: Record<string, unknown> = {}) =>
  anIssue(number, {
    html_url: `https://github.com/acme/app/pull/${number}`,
    draft: false,
    pull_request: { merged_at: null },
    ...overrides,
  });

/** acme/app's issues and pull requests, newest change first, two pages of three. */
const items = [
  pr(6),
  anIssue(5, { assignee: { login: "ben" }, labels: [{ name: "bug" }, "ui"] }),
  anIssue(4, { state: "closed", state_reason: "not_planned" }),
  pr(3, { state: "closed", pull_request: { merged_at: "2026-11-03T12:00:00Z" } }),
  pr(2, { draft: true }),
  anIssue(1, { body: null, milestone: { title: "v1" }, comments: 25 }),
];

const json = (body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { headers });
const missing = () => Response.json({ message: "Not Found" }, { status: 404 });

/** Answers what the reader asks GitHub, from `items`. */
function fakeGithub(url: URL) {
  const path = url.pathname;
  const page = Number(url.searchParams.get("page") ?? "1");
  if (path === "/user/repos")
    return json([repo("acme/app"), repo("acme/wiki-only", false)]);
  if (path === "/repos/acme/app/issues") {
    const next: Record<string, string> =
      page === 1
        ? { link: '<https://api.github.com/repositories/1/issues?page=2>; rel="next"' }
        : {};
    return json(items.slice((page - 1) * 3, page * 3), next);
  }
  if (path === "/search/issues")
    return json({
      total_count: 1,
      items: items.filter((item) => item.title === "Item 5"),
    });
  const one = path.match(/^\/repos\/acme\/app\/issues\/(\d+)$/);
  if (one) {
    const item = items.find((candidate) => candidate.number === Number(one[1]));
    return item ? json(item) : missing();
  }
  if (/^\/repos\/acme\/app\/issues\/1\/comments$/.test(path))
    return json(
      Array.from({ length: 25 }, (_, index) => ({
        user: index === 0 ? null : { login: `user${index}` },
        body: `Comment ${index}`,
        created_at: `2026-10-02T09:${String(index).padStart(2, "0")}:00Z`,
      })),
    );
  return missing();
}

let fetch: ReturnType<typeof vi.fn>;
const requested = () =>
  fetch.mock.calls.map(([url]) => {
    const parsed = new URL(url as string);
    return `${parsed.pathname}${parsed.search}`;
  });

beforeEach(() => {
  fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer github_pat_test",
    );
    return fakeGithub(new URL(url));
  });
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("githubRecords", () => {
  describeRecordReader({ reader: githubRecords, products: ["github"], access });

  it("lists the repositories that have issues as sources", async () => {
    expect(await githubRecords.listSources(access)).toEqual([
      {
        key: "acme/app",
        product: "github",
        name: "app",
        description: "The app",
        workspace: "acme",
        location: "github.com/acme/app",
        collection: "acme/app",
        collectionPath: "ISSUES & PULL REQUESTS",
      },
    ]);
  });

  it("maps GitHub's states onto the four categories, keeping GitHub's words", async () => {
    const all = await githubRecords.getRecords(
      access,
      "acme/app",
      items.map((item) => `#${item.number}`),
    );
    expect(
      all.map(({ id, type, status, statusLabel }) => [id, type, status, statusLabel]),
    ).toEqual([
      ["#6", "Pull request", "In review", "Open"],
      ["#5", "Issue", "In progress", "Open"],
      ["#4", "Issue", "Done", "Closed as not planned"],
      ["#3", "Pull request", "Done", "Merged"],
      ["#2", "Pull request", "In progress", "Draft"],
      ["#1", "Issue", "To do", "Open"],
    ]);
  });

  it("carries the owner, link, labels and other facts, and no sample-only fields", async () => {
    const [five, one] = await githubRecords.getRecords(access, "acme/app", [
      "#5",
      "#1",
    ]);
    expect(five).toEqual({
      id: "#5",
      title: "Item 5",
      type: "Issue",
      status: "In progress",
      statusLabel: "Open",
      owner: "ben",
      description: "Body of 5",
      url: "https://github.com/acme/app/issues/5",
      updated: "2026-11-05T15:00:00Z",
      fields: {
        Author: "@ana",
        Labels: "bug, ui",
        Comments: "0",
        Created: "2026-10-01T09:00:00Z",
      },
    });
    expect(one).toMatchObject({ description: "", fields: { Milestone: "v1" } });
    expect(one).not.toHaveProperty("owner");
  });

  it("pages through a repository's items, newest change first", async () => {
    const first = await githubRecords.searchRecords(access, "acme/app", {});
    expect(first?.records.map((record) => record.id)).toEqual(["#6", "#5", "#4"]);
    expect(first?.nextCursor).toBe("2");
    const second = await githubRecords.searchRecords(access, "acme/app", {
      cursor: "2",
    });
    expect(second?.records.map((record) => record.id)).toEqual(["#3", "#2", "#1"]);
    expect(second).not.toHaveProperty("nextCursor");
    expect(requested()).toEqual([
      "/repos/acme/app/issues?state=all&sort=updated&direction=desc&per_page=50&page=1",
      "/repos/acme/app/issues?state=all&sort=updated&direction=desc&per_page=50&page=2",
    ]);
  });

  it("searches issues and pull requests of the repository only, with qualifiers stripped", async () => {
    const found = await githubRecords.searchRecords(access, "acme/app", {
      text: 'item repo:evil/other (OR) "5"',
    });
    expect(found?.records.map((record) => record.id)).toEqual(["#5"]);
    const [search] = fetch.mock.calls.map(([url]) => new URL(url as string));
    expect(search?.searchParams.get("advanced_search")).toBe("true");
    expect(search?.searchParams.get("q")).toBe(
      "repo:acme/app (is:issue OR is:pr) item repo evil/other 5",
    );
  });

  it("reads a record's latest twenty comments, oldest first", async () => {
    const comments = await githubRecords.getComments!(access, "acme/app", "#1");
    expect(comments).toHaveLength(20);
    expect(comments[0]).toEqual({
      author: "@user5",
      body: "Comment 5",
      created: "2026-10-02T09:05:00Z",
    });
    expect(comments.at(-1)?.body).toBe("Comment 24");
  });

  it("asks GitHub nothing for a key or id of another shape", async () => {
    expect(await githubRecords.searchRecords(access, "../user", {})).toBeUndefined();
    expect(await githubRecords.getRecords(access, "acme/app/../x", ["#1"])).toEqual([]);
    expect(
      await githubRecords.getRecords(access, "acme/app", ["1", "#0", "#1/../2", "PLAT-1"]),
    ).toEqual([]);
    expect(await githubRecords.getComments!(access, "acme/app", "1")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails loudly, without the token, when GitHub refuses or breaks", async () => {
    for (const status of [401, 500]) {
      fetch.mockResolvedValueOnce(Response.json({}, { status }));
      const failure = githubRecords.listSources(access);
      await expect(failure).rejects.toThrow(GithubError);
      await expect(failure).rejects.toThrow(`HTTP ${status}`);
      await expect(failure).rejects.not.toThrow("github_pat_test");
    }
  });
});
