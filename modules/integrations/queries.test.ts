// The integrations reads, against the test database, over recorded GitHub answers: the real GitHub
// provider runs, and only `fetch` is answered (ADR 0003 §5).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { User } from "@/lib/auth";
import { insertConnection, insertUser } from "@/test/factories";
import { useRecordedGithub, type RecordedAnswer } from "@/test/support/recorded-github";
import {
  githubIssueDetailSchema,
  githubPullRequestDetailSchema,
  type ConnectionListItem,
  type RecordSearchQuery,
} from "./contracts";
import type { Answer } from "./provider";
import {
  getConnections,
  getProviderChoices,
  getProviderForPrompt,
  readRecord,
  readRecordForModel,
  searchRecords,
} from "./queries";

const FIXTURES = path.join(import.meta.dirname, "providers/github/fixtures");

/** A recorded GitHub answer, as JSON. */
const fixture = (file: string): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

const object = z.looseObject({});
const objects = z.array(object);
const searchAnswer = z.looseObject({
  items: z.array(z.looseObject({ number: z.number(), pull_request: z.unknown().optional() })),
});

/** The value of an answer the test expects to succeed. */
function valueOf<T, E>(answer: Answer<T, E>): T {
  if (!answer.ok) throw new Error(`Expected a value, got ${JSON.stringify(answer.error)}`);
  return answer.value;
}

/** A user with one GitHub connection, whose fake token only recorded answers accept. */
async function connectedUser() {
  const owner = await insertUser();
  const connection = await insertConnection(owner);
  return { owner, connection };
}

/** The status of the owner's connection now. */
async function statusOf(owner: User, connection: ConnectionListItem) {
  const connections = await getConnections(owner);
  return connections.find((candidate) => candidate.id === connection.id)?.status;
}

describe("getConnections", () => {
  it("lists the requester's connections in the order they were made, without their credentials", async () => {
    const owner = await insertUser();
    const first = await insertConnection(owner, { accountLabel: "@first" });
    const second = await insertConnection(owner, {
      accountLabel: "@second",
      status: "needs_reconnect",
      scopes: ["repo"],
      expiresAt: new Date("2027-01-31T12:00:00Z"),
    });

    expect(await getConnections(owner)).toEqual([first, second]);
    expect(JSON.stringify(await getConnections(owner))).not.toContain("github_pat_test");
  });

  it("lists nothing of someone else's connections", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const mine = await insertConnection(owner);
    await insertConnection(other);

    expect(await getConnections(owner)).toEqual([mine]);
  });

  it("lists nothing for a requester without connections", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    await insertConnection(other);

    expect(await getConnections(owner)).toEqual([]);
  });
});

describe("getProviderChoices", () => {
  it("offers GitHub as the browser sees it: its declarations, none of its code", async () => {
    const [github] = await getProviderChoices();

    expect(github).toMatchObject({
      id: "github",
      name: "GitHub",
      auth: [{ kind: "token" }],
      baseUrl: { default: "https://api.github.com" },
      records: {
        types: { issue: { singular: "issue" }, "pull-request": { singular: "pull request" } },
        filters: ["type", "includeClosed"],
      },
    });
    expect(github).not.toHaveProperty("verify");
    expect(github).not.toHaveProperty("guide");
    expect(github?.records).not.toHaveProperty("search");
    expect(github?.records?.types.issue).not.toHaveProperty("read");
  });
});

describe("getProviderForPrompt", () => {
  it("names a provider and its guide", async () => {
    expect(await getProviderForPrompt("github")).toEqual({
      name: "GitHub",
      guide: expect.stringMatching(/\S/),
    });
  });

  it("answers null for a provider there is none of", async () => {
    expect(await getProviderForPrompt("sharepoint")).toBeNull();
  });
});

describe("searchRecords", () => {
  const REPOS = "GET /user/repos?per_page=100";
  const SCOPE = "repo:laserjm/workspace-fixtures";
  const QUALIFIER = { issue: "is:issue", "pull-request": "is:pr" } as const;
  type GithubType = keyof typeof QUALIFIER;

  /** Searches as the attach dialog does: open records only, unless the query says otherwise. */
  const search = (owner: User, connectionId: string, query: RecordSearchQuery = {}) =>
    searchRecords(owner, connectionId, { includeClosed: false, ...query });

  /** One item of a recorded search answer, by its number. */
  function recordedItem(file: string, number: number) {
    const item = searchAnswer.parse(fixture(file)).items.find((found) => found.number === number);
    if (!item) throw new Error(`${file} has no #${number}`);
    return item;
  }

  /** A search key with a type qualifier, where the provider puts it: before `is:open`, or last. */
  function withType(key: string, type: GithubType) {
    const [head = "", ...rest] = key.split("&");
    const q = head.endsWith(" is:open")
      ? `${head.slice(0, -" is:open".length)} ${QUALIFIER[type]} is:open`
      : `${head} ${QUALIFIER[type]}`;
    return [q, ...rest].join("&");
  }

  /** `answer` cut to the items of one type, as GitHub answers a search with that type's qualifier. */
  function ofType(answer: RecordedAnswer, type: GithubType): RecordedAnswer {
    if (answer instanceof Error) return answer;
    const recorded = typeof answer === "string" ? { status: 200, body: fixture(answer) } : answer;
    if (recorded.status !== 200) return recorded;
    const body = searchAnswer.parse(recorded.body);
    const items = body.items.filter(
      (item) => Boolean(item.pull_request) === (type === "pull-request"),
    );
    return { ...recorded, body: { ...body, total_count: items.length, items } };
  }

  /**
   * With no type chosen, the provider sends one search per type, since GitHub refuses a
   * fine-grained token's search for both at once (#58): the two keys of a key written without a
   * type, each answered with its type's part of `answer`.
   */
  const perType = (key: string, answer: RecordedAnswer): Record<string, RecordedAnswer> => ({
    [withType(key, "issue")]: ofType(answer, "issue"),
    [withType(key, "pull-request")]: ofType(answer, "pull-request"),
  });

  /** The token's repositories: the sandbox and one more of the same owner. */
  const twoRepositories = () => ({
    status: 200,
    body: [
      ...objects.parse(fixture("repositories.json")),
      { full_name: "laserjm/other", owner: { login: "laserjm", type: "User" } },
    ],
  });

  const numbersOf = (results: readonly { key: string }[]) =>
    results.map((result) => Number(result.key.split("#")[1]));

  it("searches the words in every repository the token reads, open items only", async () => {
    const { owner, connection } = await connectedUser();
    useRecordedGithub({
      [REPOS]: "repositories.json",
      ...perType(
        `GET /search/issues?q=${SCOPE} status in:title,body is:open&per_page=20`,
        "search-narrowed.json",
      ),
    });

    expect(await search(owner, connection.id, { text: "status" })).toEqual({
      ok: true,
      value: {
        results: [
          {
            connectionId: connection.id,
            type: "issue",
            key: "laserjm/workspace-fixtures#6",
            label: "workspace-fixtures#6",
            title: "Sample: publish a status page for the prototype",
            state: "open",
            updatedAt: expect.any(String),
            where: "laserjm/workspace-fixtures #6",
          },
        ],
        total: 1,
        reach: "laserjm, 1 repository",
      },
    });
  });

  it("searches issues and pull requests one search each when no type is chosen, by rank", async () => {
    const { owner, connection } = await connectedUser();
    const answer = (...numbers: number[]) => ({
      status: 200,
      body: {
        total_count: numbers.length * 10,
        incomplete_results: false,
        items: numbers.map((number) => recordedItem("search.json", number)),
      },
    });
    const KEY = `GET /search/issues?q=${SCOPE} status in:title,body is:open&per_page=20`;
    useRecordedGithub({
      [REPOS]: "repositories.json",
      [withType(KEY, "issue")]: answer(6, 1),
      [withType(KEY, "pull-request")]: answer(9, 8, 5),
    });

    const page = valueOf(await search(owner, connection.id, { text: "status" }));

    expect(numbersOf(page.results)).toEqual([6, 9, 1, 8, 5]);
    expect(page.total).toBe(50);
  });

  it.each<{ query: RecordSearchQuery; q: string }>([
    { query: { type: "issue", text: "status" }, q: `${SCOPE} status in:title,body is:issue is:open` },
    { query: { type: "pull-request", text: "status" }, q: `${SCOPE} status in:title,body is:pr is:open` },
    {
      query: { type: "issue", includeClosed: true, text: "status" },
      q: `${SCOPE} status in:title,body is:issue`,
    },
  ])("narrows by the toggles $query", async ({ query, q }) => {
    const { owner, connection } = await connectedUser();
    const { requests } = useRecordedGithub({
      [REPOS]: "repositories.json",
      [`GET /search/issues?q=${q}&per_page=20`]: "search-narrowed.json",
    });

    expect(await search(owner, connection.id, query)).toMatchObject({ ok: true });
    expect(requests).toHaveLength(2);
  });

  describe("a word naming a repository", () => {
    it.each([
      "workspace-fixtures",
      "Workspace-Fixtures",
      "laserjm/workspace-fixtures",
      "LaserJM/Workspace-Fixtures",
    ])("narrows the search to it, as %s", async (word) => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [REPOS]: twoRepositories(),
        ...perType(
          `GET /search/issues?q=${SCOPE} status in:title,body is:open&per_page=20`,
          "search-narrowed.json",
        ),
      });

      const page = valueOf(await search(owner, connection.id, { text: `${word} status` }));

      expect(page.narrowedTo).toEqual(["laserjm/workspace-fixtures"]);
      expect(page.results).toHaveLength(1);
    });

    it("lists the repository newest first when nothing else is typed", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [REPOS]: twoRepositories(),
        ...perType(
          `GET /search/issues?q=${SCOPE} is:open&sort=updated&order=desc&per_page=20`,
          "search.json",
        ),
      });

      const page = valueOf(await search(owner, connection.id, { text: "workspace-fixtures" }));

      expect(page.narrowedTo).toEqual(["laserjm/workspace-fixtures"]);
    });

    it("is searched as a word when it names no repository exactly", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [REPOS]: twoRepositories(),
        ...perType(
          `GET /search/issues?q=${SCOPE} repo:laserjm/other workspace in:title,body is:open&per_page=20`,
          "search-narrowed.json",
        ),
      });

      const page = valueOf(await search(owner, connection.id, { text: "workspace" }));

      expect(page).not.toHaveProperty("narrowedTo");
    });
  });

  describe("a number", () => {
    /** A recorded search answer without #6. */
    const withoutSix = () => ({
      status: 200,
      body: { total_count: 1, incomplete_results: false, items: [recordedItem("search.json", 9)] },
    });

    it.each(["6", "#6"])(
      "is fetched directly and put on top when one repository is in play, as %s",
      async (word) => {
        const { owner, connection } = await connectedUser();
        useRecordedGithub({
          [REPOS]: "repositories.json",
          ...perType(
            `GET /search/issues?q=${SCOPE} 6 in:title,body is:open&per_page=20`,
            withoutSix(),
          ),
          "GET /repos/laserjm/workspace-fixtures/issues/6": "issue.json",
        });

        const page = valueOf(await search(owner, connection.id, { text: word }));

        expect(page.results.map((result) => result.key)).toEqual([
          "laserjm/workspace-fixtures#6",
          "laserjm/workspace-fixtures#9",
        ]);
        expect(page.results[0]).toMatchObject({ type: "issue", state: "open" });
      },
    );

    it("is listed once when the search finds it too", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(
          `GET /search/issues?q=${SCOPE} 6 in:title,body is:open&per_page=20`,
          "search-narrowed.json",
        ),
        "GET /repos/laserjm/workspace-fixtures/issues/6": "issue.json",
      });

      expect(valueOf(await search(owner, connection.id, { text: "6" })).results).toHaveLength(1);
    });

    it("is left to the search when it is not of the toggled type", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [REPOS]: "repositories.json",
        [`GET /search/issues?q=${SCOPE} 6 in:title,body is:pr is:open&per_page=20`]: withoutSix(),
        "GET /repos/laserjm/workspace-fixtures/issues/6": "issue.json",
      });

      const page = valueOf(await search(owner, connection.id, { text: "6", type: "pull-request" }));

      expect(page.results).toHaveLength(1);
    });

    it("is left to the search when several repositories are in play", async () => {
      const { owner, connection } = await connectedUser();
      const { requests } = useRecordedGithub({
        [REPOS]: twoRepositories(),
        ...perType(
          `GET /search/issues?q=${SCOPE} repo:laserjm/other 6 in:title,body is:open&per_page=20`,
          withoutSix(),
        ),
      });

      expect(valueOf(await search(owner, connection.id, { text: "#6" })).results).toHaveLength(1);
      expect(requests).toHaveLength(3);
    });
  });

  it("names each owner instead when the repositories make the query longer than 256 characters", async () => {
    const { owner, connection } = await connectedUser();
    // 2 owners × 6 repositories × "repo:<owner>/a-repository-with-a-long-name-N " ≈ 540 characters.
    const repositories = ["acme", "bo"].flatMap((login) =>
      Array.from({ length: 6 }, (_, index) => ({
        full_name: `${login}/a-repository-with-a-long-name-${index}`,
        owner: { login, type: login === "acme" ? "Organization" : "User" },
      })),
    );
    const { requests } = useRecordedGithub({
      [REPOS]: { status: 200, body: repositories },
      ...perType(
        "GET /search/issues?q=user:acme user:bo status in:title,body is:open&per_page=20",
        "search-narrowed.json",
      ),
    });

    const page = valueOf(await search(owner, connection.id, { text: "status" }));

    expect(page.results).toHaveLength(1);
    expect(page.reach).toBe("12 repositories across 2 accounts");
    expect(requests).toHaveLength(3);
  });

  it("names the owners in both searches before typing when only the one involving the user is too long", async () => {
    const { owner, connection } = await connectedUser();
    // 10 × "repo:acme/repository-0N", " is:issue" and " is:open" make 256 characters;
    // " involves:@me" makes 269.
    const repositories = Array.from({ length: 10 }, (_, index) => ({
      full_name: `acme/repository-0${index}`,
      owner: { login: "acme", type: "Organization" },
    }));
    const { requests } = useRecordedGithub({
      [REPOS]: { status: 200, body: repositories },
      ...perType(
        "GET /search/issues?q=user:acme involves:@me is:open&sort=updated&order=desc&per_page=20",
        "search-narrowed.json",
      ),
      ...perType(
        "GET /search/issues?q=user:acme is:open&sort=updated&order=desc&per_page=20",
        "search.json",
      ),
    });

    expect(await search(owner, connection.id)).toMatchObject({ ok: true });
    expect(requests).toHaveLength(5);
  });

  describe("before typing", () => {
    const involving = (q: string) =>
      `GET /search/issues?q=${SCOPE} involves:@me${q}&sort=updated&order=desc&per_page=20`;
    const recent = (q: string, page?: number) =>
      `GET /search/issues?q=${SCOPE}${q}&sort=updated&order=desc&per_page=20${page ? `&page=${page}` : ""}`;
    /** A recorded search answer cut to these numbers, in this order. */
    const answerWith = (...numbers: number[]) => ({
      status: 200,
      body: {
        total_count: numbers.length,
        incomplete_results: false,
        items: numbers.map((number) => recordedItem("search.json", number)),
      },
    });

    it("lists what involves the user first, then the rest by when it changed, each once", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(involving(""), answerWith(9, 6)),
        ...perType(recent(""), "search.json"),
      });

      const page = valueOf(await search(owner, connection.id, { includeClosed: true }));

      // search.json lists 10, 9, 8, 7, 6, 5, 3, 4, 2, 1.
      expect(numbersOf(page.results)).toEqual([9, 6, 10, 8, 7, 5, 3, 4, 2, 1]);
      expect(page.total).toBe(10);
    });

    it.each<{ query: RecordSearchQuery; q: string }>([
      { query: { type: "issue" }, q: " is:issue is:open" },
      { query: { type: "pull-request" }, q: " is:pr is:open" },
      { query: { type: "issue", includeClosed: true }, q: " is:issue" },
    ])("runs both searches with the toggles $query", async ({ query, q }) => {
      const { owner, connection } = await connectedUser();
      const { requests } = useRecordedGithub({
        [REPOS]: "repositories.json",
        [involving(q)]: answerWith(6),
        [recent(q)]: answerWith(6, 1),
      });

      const page = valueOf(await search(owner, connection.id, query));

      expect(numbersOf(page.results)).toEqual([6, 1]);
      expect(requests).toHaveLength(3);
    });

    it("runs both searches for each type when no type is chosen", async () => {
      const { owner, connection } = await connectedUser();
      const { requests } = useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(involving(""), answerWith(6)),
        ...perType(recent(""), answerWith(6, 1)),
      });

      const page = valueOf(await search(owner, connection.id, { includeClosed: true }));

      expect(numbersOf(page.results)).toEqual([6, 1]);
      expect(requests).toHaveLength(5);
    });

    it("loads more from the second search alone, of the types that have more", async () => {
      const { owner, connection } = await connectedUser();
      const many = (total: number) => ({
        status: 200,
        body: { total_count: total, incomplete_results: false, items: [] },
      });
      const { requests } = useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(involving(" is:open"), answerWith(6)),
        [withType(recent(" is:open"), "issue")]: many(45),
        [withType(recent(" is:open"), "pull-request")]: many(5),
        [withType(recent(" is:open", 2), "issue")]: answerWith(1),
      });

      const first = valueOf(await search(owner, connection.id));
      expect(first.total).toBe(50);
      const second = valueOf(await search(owner, connection.id, { cursor: first.next }));

      expect(numbersOf(second.results)).toEqual([1]);
      expect(requests.filter((request) => request.includes("involves"))).toHaveLength(2);
      expect(requests.filter((request) => request.includes("&page=2&"))).toHaveLength(1);
    });
  });

  it("refuses a type GitHub does not declare, without asking GitHub", async () => {
    const { owner, connection } = await connectedUser();
    const { requests } = useRecordedGithub({});

    expect(await search(owner, connection.id, { type: "page" })).toEqual({
      ok: false,
      error: { kind: "invalid_query", message: expect.any(String) },
    });
    expect(requests).toEqual([]);
  });

  it("pages by an opaque cursor, and refuses a forged one", async () => {
    const { owner, connection } = await connectedUser();
    const page = (number: number) =>
      `GET /search/issues?q=${SCOPE} is:issue is:open&sort=updated&order=desc&per_page=20${number > 1 ? `&page=${number}` : ""}`;
    const many = { status: 200, body: { total_count: 45, incomplete_results: false, items: [] } };
    const involving = `GET /search/issues?q=${SCOPE} involves:@me is:issue is:open&sort=updated&order=desc&per_page=20`;
    useRecordedGithub({
      [REPOS]: "repositories.json",
      [involving]: many,
      [page(1)]: many,
      [page(2)]: many,
      [page(3)]: many,
    });

    const first = valueOf(await search(owner, connection.id, { type: "issue" }));
    expect(first.next).toEqual(expect.any(String));
    expect(first.next).not.toContain("2");
    const second = valueOf(await search(owner, connection.id, { type: "issue", cursor: first.next }));
    expect(second.next).toEqual(expect.any(String));
    const third = valueOf(await search(owner, connection.id, { type: "issue", cursor: second.next }));
    expect(third).not.toHaveProperty("next");

    expect(await search(owner, connection.id, { type: "issue", cursor: "page-2" })).toEqual({
      ok: false,
      error: { kind: "invalid_query", message: expect.any(String) },
    });
  });

  it("computes each record's state from the search item", async () => {
    const { owner, connection } = await connectedUser();
    const closedIssue = {
      ...recordedItem("search-narrowed.json", 6),
      number: 99,
      state: "closed",
      state_reason: "completed",
    };
    const recorded = searchAnswer.parse(fixture("search.json"));
    useRecordedGithub({
      [REPOS]: "repositories.json",
      ...perType(
        `GET /search/issues?q=${SCOPE} involves:@me&sort=updated&order=desc&per_page=20`,
        "search-involves-me.json",
      ),
      ...perType(`GET /search/issues?q=${SCOPE}&sort=updated&order=desc&per_page=20`, {
        status: 200,
        body: { ...recorded, items: [...recorded.items, closedIssue] },
      }),
    });

    const { results } = valueOf(await search(owner, connection.id, { includeClosed: true }));

    const stateOf = (number: number) => results.find((result) => result.key.endsWith(`#${number}`));
    // The seeded cases (fixtures/README.md), and the closed issue above.
    expect(stateOf(6)).toMatchObject({ type: "issue", state: "open" });
    expect(stateOf(9)).toMatchObject({ type: "pull-request", state: "draft" });
    expect(stateOf(8)).toMatchObject({ type: "pull-request", state: "merged" });
    expect(stateOf(99)).toMatchObject({ type: "issue", state: "closed" });
    expect(stateOf(7)).toMatchObject({ type: "issue", state: "not_planned" });
  });

  it("answers not_found for someone else's connection, without asking GitHub", async () => {
    const { connection } = await connectedUser();
    const other = await insertUser();
    const { requests } = useRecordedGithub({});

    expect(await search(other, connection.id)).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(requests).toEqual([]);
  });

  it.each(["no-such-connection", "00000000-0000-4000-8000-000000000000"])(
    "answers not_found for the id %s, without asking GitHub",
    async (connectionId) => {
      const { owner } = await connectedUser();
      const { requests } = useRecordedGithub({});

      expect(await search(owner, connectionId)).toEqual({ ok: false, error: { kind: "not_found" } });
      expect(requests).toEqual([]);
    },
  );

  it("answers not_found for a connection whose provider holds no records", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner, { providerId: "retired-provider" });
    const { requests } = useRecordedGithub({});

    expect(await search(owner, connection.id)).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(requests).toEqual([]);
  });

  describe("when GitHub refuses", () => {
    const SEARCH = `GET /search/issues?q=${SCOPE} is:open&sort=updated&order=desc&per_page=20`;
    const INVOLVING = `GET /search/issues?q=${SCOPE} involves:@me is:open&sort=updated&order=desc&per_page=20`;
    const NOW = new Date("2026-11-13T12:00:00Z");

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** The recorded answers when every search before typing gets `answer`. */
    const refusal = (answer: RecordedAnswer) => ({
      [REPOS]: "repositories.json",
      ...perType(INVOLVING, answer),
      ...perType(SEARCH, answer),
    });

    it.each<{ name: string; answer: RecordedAnswer; retryAt: string }>([
      {
        name: "a 403 with no requests left",
        answer: {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Date.parse("2026-11-13T12:00:40Z") / 1000),
          },
          body: { message: "API rate limit exceeded for user ID 1." },
        },
        retryAt: "2026-11-13T12:00:40.000Z",
      },
      {
        name: "a 429 with retry-after",
        answer: { status: 429, headers: { "retry-after": "30" }, body: { message: "Too many requests" } },
        retryAt: "2026-11-13T12:00:30.000Z",
      },
      {
        name: "a 403 for a secondary rate limit",
        answer: {
          status: 403,
          body: {
            message:
              "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
          },
        },
        retryAt: "2026-11-13T12:01:00.000Z",
      },
    ])("answers rate_limited with retryAt to $name", async ({ answer, retryAt }) => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(refusal(answer));

      expect(await search(owner, connection.id)).toEqual({
        ok: false,
        error: { kind: "rate_limited", retryAt },
      });
    });

    it.each([
      {
        status: 403,
        body: { message: "Resource not accessible by personal access token" },
        error: { kind: "no_access" },
      },
      { status: 404, body: { message: "Not Found" }, error: { kind: "not_found" } },
      {
        status: 422,
        body: {
          message: "Validation Failed",
          errors: [{ message: "The listed users and repositories cannot be searched" }],
        },
        error: { kind: "invalid_query", message: expect.any(String) },
      },
      { status: 502, body: { message: "Server Error" }, error: { kind: "unreachable" } },
    ])("answers $error.kind to a $status", async ({ status, body, error }) => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(refusal({ status, body }));

      expect(await search(owner, connection.id)).toEqual({ ok: false, error });
    });

    it("passes GitHub's reason on for a query it could not run", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(
        refusal({
          status: 422,
          body: {
            message: "Validation Failed",
            errors: [{ message: "The listed users and repositories cannot be searched" }],
          },
        }),
      );

      expect(await search(owner, connection.id)).toMatchObject({
        ok: false,
        error: { kind: "invalid_query", message: expect.stringContaining("cannot be searched") },
      });
    });

    it("answers unreachable when GitHub does not answer", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(refusal(new TypeError("fetch failed")));

      expect(await search(owner, connection.id)).toEqual({
        ok: false,
        error: { kind: "unreachable" },
      });
    });

    it("answers needs_reconnect to a 401, and marks the connection", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(refusal({ status: 401, body: { message: "Bad credentials" } }));

      expect(await search(owner, connection.id)).toEqual({
        ok: false,
        error: { kind: "needs_reconnect" },
      });
      expect(await statusOf(owner, connection)).toBe("needs_reconnect");
    });

    it("leaves the connection alone on any other refusal", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(refusal({ status: 404, body: { message: "Not Found" } }));

      await search(owner, connection.id);

      expect(await statusOf(owner, connection)).toBe("active");
    });

    it("leaves someone else's connection alone when its token is refused", async () => {
      const { owner, connection } = await connectedUser();
      const other = await insertUser();
      useRecordedGithub(refusal({ status: 401, body: { message: "Bad credentials" } }));

      expect(await search(other, connection.id)).toEqual({
        ok: false,
        error: { kind: "not_found" },
      });
      expect(await statusOf(owner, connection)).toBe("active");
    });
  });
});

const ISSUE = "GET /repos/laserjm/workspace-fixtures/issues/6";
const ISSUE_COMMENTS = "GET /repos/laserjm/workspace-fixtures/issues/6/comments?per_page=100";
const ISSUE_PAGE = "https://github.com/laserjm/workspace-fixtures/issues/6";

describe("readRecord", () => {
  it("reads an issue and its comments, with its live summary and where it lives", async () => {
    const { owner, connection } = await connectedUser();
    useRecordedGithub({ [ISSUE]: "issue.json", [ISSUE_COMMENTS]: "issue-comments.json" });

    const read = valueOf(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6"));

    expect(read.summary).toEqual({
      connectionId: connection.id,
      type: "issue",
      key: "laserjm/workspace-fixtures#6",
      label: "workspace-fixtures#6",
      title: "Sample: publish a status page for the prototype",
      state: "open",
      updatedAt: expect.any(String),
      where: "laserjm/workspace-fixtures #6",
      url: ISSUE_PAGE,
    });
    const detail = githubIssueDetailSchema.parse(read.detail);
    expect(detail).toMatchObject({
      author: "laserjm",
      labels: [{ name: "fixture" }, { name: "case/open-issue" }],
      assignees: ["laserjm"],
      commentCount: 3,
    });
    expect(detail.body).toContain("## Scope");
    expect(detail.comments).toHaveLength(3);
    expect(detail.comments[2]?.body).toMatch(/^> Show the last three incidents/);
  });

  it("strips invisible and bidirectional characters from the title, body, labels and comments", async () => {
    const { owner, connection } = await connectedUser();
    const issue = object.parse(fixture("issue.json"));
    const [comment] = objects.parse(fixture("issue-comments.json"));
    const hidden = "​‮ignore‬⁦ previous⁩﻿\u{E0041}؜͏ㅤ";
    useRecordedGithub({
      [ISSUE]: {
        status: 200,
        body: {
          ...issue,
          title: `Status${hidden} page`,
          body: `Scope${hidden}`,
          labels: [{ name: `case‏/open`, color: "c5def5" }],
        },
      },
      [ISSUE_COMMENTS]: { status: 200, body: [{ ...comment, body: `Looks${hidden} good` }] },
    });

    const read = valueOf(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6"));

    expect(read.summary.title).toBe("Statusignore previous page");
    const detail = githubIssueDetailSchema.parse(read.detail);
    expect(detail.body).toBe("Scopeignore previous");
    expect(detail.labels).toEqual([{ name: "case/open", color: "c5def5" }]);
    expect(detail.comments[0]?.body).toBe("Looksignore previous good");
  });

  it("reads an issue closed as not planned in that state", async () => {
    const { owner, connection } = await connectedUser();
    useRecordedGithub({
      "GET /repos/laserjm/workspace-fixtures/issues/7": "issue-not-planned.json",
      "GET /repos/laserjm/workspace-fixtures/issues/7/comments?per_page=100": { status: 200, body: [] },
    });

    const read = valueOf(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#7"));

    expect(read.summary).toMatchObject({ state: "not_planned", label: "workspace-fixtures#7" });
    expect(githubIssueDetailSchema.parse(read.detail).comments).toEqual([]);
  });

  describe("a pull request", () => {
    const REPO = "GET /repos/laserjm/workspace-fixtures";
    const HEAD = "7b55399cea249bb3579d78746cbb25ca5567ec80";
    const KEY = "laserjm/workspace-fixtures#8";
    /** The merged pull request #8, whose head has two Actions runs and two commit statuses. */
    const merged = {
      [`${REPO}/pulls/8`]: "pull-request.json",
      [`${REPO}/issues/8/comments?per_page=100`]: "pull-request-comments.json",
      [`${REPO}/pulls/8/reviews?per_page=100`]: "pull-request-reviews.json",
      [`${REPO}/pulls/8/comments?per_page=100`]: "pull-request-review-comments.json",
      [`${REPO}/pulls/8/files?per_page=100`]: "pull-request-files.json",
      [`${REPO}/commits/${HEAD}/status`]: "pull-request-status.json",
      [`${REPO}/actions/runs?head_sha=${HEAD}`]: "pull-request-workflow-runs.json",
    } satisfies Record<string, RecordedAnswer>;

    it("reads a merged one for review: its reviews, comments, changed files and merge state", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(merged);

      const read = valueOf(await readRecord(owner, connection.id, "pull-request", KEY));

      expect(read.summary).toMatchObject({
        type: "pull-request",
        title: "Sample: add the status page data",
        state: "merged",
        url: "https://github.com/laserjm/workspace-fixtures/pull/8",
      });
      const detail = githubPullRequestDetailSchema.parse(read.detail);
      expect(detail).toMatchObject({ number: 8, author: "laserjm", commentCount: 1 });
      expect(detail.body).not.toBe("");
      expect(detail.comments).toHaveLength(1);
      expect(detail.reviews).toHaveLength(1);
      expect(detail.reviews[0]).toMatchObject({
        author: "laserjm",
        state: "COMMENTED",
        body: "Reads well. One question on the component list.",
        comments: [
          {
            path: "status/components.json",
            body: "Should a degraded component link to its incident?",
          },
        ],
      });
      expect(detail.merge).toMatchObject({
        mergeableState: "unknown",
        merged: true,
        draft: false,
        closed: true,
        base: "main",
        head: "fixtures/status-page",
      });
      expect(detail.fileCount).toBe(4);
      expect(
        detail.files.map(
          (file) => `${file.status} ${file.path} +${file.additions} -${file.deletions}`,
        ),
      ).toEqual([
        "modified README.md +2 -0",
        "added status/README.md +4 -0",
        "added status/components.json +7 -0",
        "added status/incidents.md +4 -0",
      ]);
      // The schema above strips unknown keys, so the patch is looked for in the detail as read.
      const files = z.object({ files: objects }).parse(read.detail).files;
      for (const file of files) expect(file).not.toHaveProperty("patch");
    });

    it("reads the GitHub Actions runs and the combined commit status of its head", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub(merged);

      const read = valueOf(await readRecord(owner, connection.id, "pull-request", KEY));

      const { ci } = githubPullRequestDetailSchema.parse(read.detail);
      expect(ci.headSha).toBe(HEAD);
      expect(ci.actions).toMatchObject({ readable: true, total: 2 });
      const runs = ci.actions.readable ? ci.actions.runs : [];
      expect(runs.map((run) => `${run.name} ${run.event} ${run.status} ${run.conclusion}`)).toEqual([
        "Fixture checks pull_request completed success",
        "Fixture checks push completed success",
      ]);
      expect(runs[0]?.url).toBe(
        "https://github.com/laserjm/workspace-fixtures/actions/runs/43413512557",
      );
      expect(ci.statuses).toMatchObject({ readable: true, state: "failure" });
      const statuses = ci.statuses.readable ? ci.statuses.statuses : [];
      expect(
        statuses.map((status) => `${status.context} ${status.state}: ${status.description}`),
      ).toEqual([
        "fixtures/schema success: components.json matches the schema",
        "fixtures/links failure: 1 broken link in incidents.md",
      ]);
    });

    it("still loads when the token lacks Actions: read, and says the runs are not readable", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        ...merged,
        [`${REPO}/actions/runs?head_sha=${HEAD}`]: {
          status: 403,
          body: {
            message: "Resource not accessible by personal access token",
            documentation_url:
              "https://docs.github.com/rest/actions/workflow-runs#list-workflow-runs-for-a-repository",
            status: "403",
          },
        },
      });

      const read = valueOf(await readRecord(owner, connection.id, "pull-request", KEY));

      const detail = githubPullRequestDetailSchema.parse(read.detail);
      expect(detail.ci.actions).toEqual({ readable: false });
      expect(detail.ci.statuses).toMatchObject({ readable: true, state: "failure" });
      expect(detail.reviews).toHaveLength(1);
      expect(detail.files).toHaveLength(4);
    });

    it("reads a draft one as a draft, with its file and Actions runs and no reviews yet", async () => {
      const { owner, connection } = await connectedUser();
      const DRAFT_HEAD = "fb96c63f0a07fec0962c22e8afd3072b9a58c114";
      const none = { status: 200, body: [] };
      useRecordedGithub({
        [`${REPO}/pulls/9`]: "pull-request-draft.json",
        [`${REPO}/issues/9/comments?per_page=100`]: none,
        [`${REPO}/pulls/9/reviews?per_page=100`]: none,
        [`${REPO}/pulls/9/comments?per_page=100`]: none,
        [`${REPO}/pulls/9/files?per_page=100`]: "pull-request-draft-files.json",
        [`${REPO}/commits/${DRAFT_HEAD}/status`]: "pull-request-draft-status.json",
        [`${REPO}/actions/runs?head_sha=${DRAFT_HEAD}`]: "pull-request-draft-workflow-runs.json",
      });

      const read = valueOf(
        await readRecord(owner, connection.id, "pull-request", "laserjm/workspace-fixtures#9"),
      );

      expect(read.summary).toMatchObject({
        title: "Sample: keep older incidents on a history page",
        state: "draft",
      });
      const detail = githubPullRequestDetailSchema.parse(read.detail);
      // GitHub calls the draft `clean`; the view must not read that as ready to merge.
      expect(detail.merge).toMatchObject({
        mergeableState: "clean",
        draft: true,
        merged: false,
        closed: false,
      });
      expect(detail.merge.mergedAt).toBeUndefined();
      expect(detail.reviews).toEqual([]);
      expect(detail.files).toEqual([
        { path: "status/history.md", status: "added", additions: 3, deletions: 0 },
      ]);
      expect(detail.ci.headSha).toBe(DRAFT_HEAD);
      expect(detail.ci.actions).toMatchObject({ readable: true, total: 2 });
      expect(detail.ci.statuses).toEqual({ readable: true, state: "pending", statuses: [] });
    });

    it("keeps the first 100 changed files and counts the rest", async () => {
      const { owner, connection } = await connectedUser();
      const pull = object.parse(fixture("pull-request.json"));
      const files = Array.from({ length: 100 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: "modified",
        additions: 1,
        deletions: 1,
      }));
      useRecordedGithub({
        ...merged,
        [`${REPO}/pulls/8`]: { status: 200, body: { ...pull, changed_files: 130 } },
        [`${REPO}/pulls/8/files?per_page=100`]: { status: 200, body: files },
      });

      const read = valueOf(await readRecord(owner, connection.id, "pull-request", KEY));

      const detail = githubPullRequestDetailSchema.parse(read.detail);
      expect(detail.files).toHaveLength(100);
      expect(detail.fileCount).toBe(130);
    });

    it("answers not_found with the page for an issue read as a pull request", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        ...merged,
        [`${REPO}/pulls/8`]: { status: 404, body: { message: "Not Found" } },
      });

      expect(await readRecord(owner, connection.id, "pull-request", KEY)).toEqual({
        ok: false,
        error: { kind: "not_found", url: "https://github.com/laserjm/workspace-fixtures/pull/8" },
      });
    });

    it("strips invisible and bidirectional characters from reviews, file paths and CI", async () => {
      const { owner, connection } = await connectedUser();
      const hidden = "‮​";
      const [review] = objects.parse(fixture("pull-request-reviews.json"));
      const [file] = objects.parse(fixture("pull-request-files.json"));
      const status = z.looseObject({ statuses: objects }).parse(fixture("pull-request-status.json"));
      useRecordedGithub({
        ...merged,
        [`${REPO}/pulls/8/reviews?per_page=100`]: {
          status: 200,
          body: [{ ...review, body: `Reads${hidden} well` }],
        },
        [`${REPO}/pulls/8/files?per_page=100`]: {
          status: 200,
          body: [{ ...file, filename: `READ${hidden}ME.md` }],
        },
        [`${REPO}/commits/${HEAD}/status`]: {
          status: 200,
          body: { ...status, statuses: [{ ...status.statuses[0], description: `ok${hidden}` }] },
        },
      });

      const read = valueOf(await readRecord(owner, connection.id, "pull-request", KEY));

      const detail = githubPullRequestDetailSchema.parse(read.detail);
      expect(detail.reviews[0]?.body).toBe("Reads well");
      expect(detail.files[0]?.path).toBe("README.md");
      expect(detail.ci.statuses).toMatchObject({ statuses: [{ description: "ok" }] });
    });

    it("fails the read when CI hits the rate limit", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        ...merged,
        [`${REPO}/commits/${HEAD}/status`]: {
          status: 429,
          headers: { "retry-after": "30" },
          body: { message: "You have exceeded a secondary rate limit." },
        },
      });

      expect(await readRecord(owner, connection.id, "pull-request", KEY)).toEqual({
        ok: false,
        error: {
          kind: "rate_limited",
          retryAt: expect.any(String),
          url: "https://github.com/laserjm/workspace-fixtures/pull/8",
        },
      });
    });
  });

  describe("refusals", () => {
    it("answers not_found with the record's page when GitHub has no such issue", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({
        [ISSUE]: { status: 404, body: { message: "Not Found" } },
        [ISSUE_COMMENTS]: { status: 404, body: { message: "Not Found" } },
      });

      expect(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: { kind: "not_found", url: ISSUE_PAGE },
      });
    });

    it("answers not_found for a pull request read as an issue", async () => {
      const { owner, connection } = await connectedUser();
      const issue = object.parse(fixture("issue.json"));
      useRecordedGithub({
        [ISSUE]: { status: 200, body: { ...issue, pull_request: { merged_at: null } } },
        [ISSUE_COMMENTS]: "issue-comments.json",
      });

      expect(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: { kind: "not_found", url: ISSUE_PAGE },
      });
    });

    it("answers not_found without asking GitHub for a key it cannot parse or a type it does not declare", async () => {
      const { owner, connection } = await connectedUser();
      const { requests } = useRecordedGithub({});

      expect(await readRecord(owner, connection.id, "issue", "workspace-fixtures 6")).toEqual({
        ok: false,
        error: { kind: "not_found" },
      });
      expect(
        await readRecord(owner, connection.id, "discussion", "laserjm/workspace-fixtures#6"),
      ).toEqual({ ok: false, error: { kind: "not_found" } });
      expect(requests).toEqual([]);
    });

    it("answers not_found for someone else's connection, without asking GitHub", async () => {
      const { connection } = await connectedUser();
      const other = await insertUser();
      const { requests } = useRecordedGithub({});

      expect(await readRecord(other, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: { kind: "not_found" },
      });
      expect(requests).toEqual([]);
    });

    it.each(["no-such-connection", "00000000-0000-4000-8000-000000000000"])(
      "answers not_found for the id %s, without asking GitHub",
      async (connectionId) => {
        const { owner } = await connectedUser();
        const { requests } = useRecordedGithub({});

        expect(await readRecord(owner, connectionId, "issue", "laserjm/workspace-fixtures#6")).toEqual({
          ok: false,
          error: { kind: "not_found" },
        });
        expect(requests).toEqual([]);
      },
    );

    it("answers no_access when the token may not read the repository", async () => {
      const { owner, connection } = await connectedUser();
      const forbidden = {
        status: 403,
        body: { message: "Resource not accessible by personal access token" },
      };
      useRecordedGithub({ [ISSUE]: forbidden, [ISSUE_COMMENTS]: forbidden });

      expect(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: { kind: "no_access", url: ISSUE_PAGE },
      });
    });

    it("answers rate_limited with when to try again when the rate limit is reached", async () => {
      const { owner, connection } = await connectedUser();
      const limited = {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1794582335" },
        body: { message: "API rate limit exceeded" },
      };
      useRecordedGithub({ [ISSUE]: limited, [ISSUE_COMMENTS]: limited });

      expect(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: {
          kind: "rate_limited",
          retryAt: new Date(1794582335 * 1000).toISOString(),
          url: ISSUE_PAGE,
        },
      });
    });

    it("answers unreachable when GitHub cannot be reached", async () => {
      const { owner, connection } = await connectedUser();
      useRecordedGithub({ [ISSUE]: new Error("timeout"), [ISSUE_COMMENTS]: new Error("timeout") });

      expect(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: { kind: "unreachable", url: ISSUE_PAGE },
      });
    });

    it("answers needs_reconnect when the token is refused, and marks the connection", async () => {
      const { owner, connection } = await connectedUser();
      const refused = { status: 401, body: { message: "Bad credentials" } };
      useRecordedGithub({ [ISSUE]: refused, [ISSUE_COMMENTS]: refused });

      expect(await readRecord(owner, connection.id, "issue", "laserjm/workspace-fixtures#6")).toEqual({
        ok: false,
        error: { kind: "needs_reconnect", url: ISSUE_PAGE },
      });
      expect(await statusOf(owner, connection)).toBe("needs_reconnect");
    });
  });
});

describe("readRecordForModel", () => {
  it("reads an issue trimmed for the model: label names, the body cut, the newest comments", async () => {
    const { owner, connection } = await connectedUser();
    const issue = object.parse(fixture("issue.json"));
    const [comment] = objects.parse(fixture("issue-comments.json"));
    const comments = Array.from({ length: 32 }, (_, index) => ({
      ...comment,
      id: index + 1,
      body: `Comment ${index + 1}`,
    }));
    useRecordedGithub({
      [ISSUE]: { status: 200, body: { ...issue, body: "x".repeat(8_010), comments: 32 } },
      [ISSUE_COMMENTS]: { status: 200, body: comments },
    });

    const read = valueOf(
      await readRecordForModel(owner, connection.id, "issue", "laserjm/workspace-fixtures#6"),
    );

    expect(read.summary).toMatchObject({ key: "laserjm/workspace-fixtures#6", url: ISSUE_PAGE });
    expect(read.detail).toMatchObject({
      labels: ["fixture", "case/open-issue"],
      body: expect.stringMatching(/^x{8000}\n\n\[… 10 more characters, open the view\]$/),
      commentCount: 32,
      olderComments: "+ 2 older comments",
    });
    expect(read.detail).toHaveProperty("comments.length", 30);
    expect(read.detail).toHaveProperty("comments.0.body", "Comment 3");
    expect(read.detail).not.toHaveProperty("comments.0.id");
  });

  it("keeps the record's page on a refusal", async () => {
    const { owner, connection } = await connectedUser();
    useRecordedGithub({
      [ISSUE]: { status: 404, body: { message: "Not Found" } },
      [ISSUE_COMMENTS]: { status: 404, body: { message: "Not Found" } },
    });

    expect(
      await readRecordForModel(owner, connection.id, "issue", "laserjm/workspace-fixtures#6"),
    ).toEqual({ ok: false, error: { kind: "not_found", url: ISSUE_PAGE } });
  });

  it("answers not_found for someone else's connection, without asking GitHub", async () => {
    const { connection } = await connectedUser();
    const other = await insertUser();
    const { requests } = useRecordedGithub({});

    expect(
      await readRecordForModel(other, connection.id, "issue", "laserjm/workspace-fixtures#6"),
    ).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(requests).toEqual([]);
  });

  it("answers not_found for a malformed id, without asking GitHub", async () => {
    const { owner } = await connectedUser();
    const { requests } = useRecordedGithub({});

    expect(
      await readRecordForModel(owner, "no-such-connection", "issue", "laserjm/workspace-fixtures#6"),
    ).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(requests).toEqual([]);
  });

  it("answers needs_reconnect when the token is refused, and marks the connection", async () => {
    const { owner, connection } = await connectedUser();
    const refused = { status: 401, body: { message: "Bad credentials" } };
    useRecordedGithub({ [ISSUE]: refused, [ISSUE_COMMENTS]: refused });

    expect(
      await readRecordForModel(owner, connection.id, "issue", "laserjm/workspace-fixtures#6"),
    ).toMatchObject({ ok: false, error: { kind: "needs_reconnect" } });
    expect(await statusOf(owner, connection)).toBe("needs_reconnect");
  });
});
