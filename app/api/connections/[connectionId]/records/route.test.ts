// The record search route, called as a signed-in user, over recorded GitHub answers: the real
// GitHub provider runs, and only `fetch` is answered (ADR 0003 §5).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAs } from "@/test/support/session";
import {
  connectedUser,
  githubConnection,
  listConnections,
  resetConnections,
} from "@/test/support/connections";
import { useRecordedGithub, type RecordedAnswer } from "@/test/support/recorded-github";
import { aUser } from "@/test/factories/user";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => import("@/test/support/session"));
vi.mock("@/modules/integrations/queries", () => import("@/test/support/connections"));
vi.mock("@/modules/integrations/vault", () => import("@/test/support/connections"));

afterEach(resetConnections);

const REPOS = "GET /user/repos?per_page=100";
const SCOPE = "repo:laserjm/workspace-fixtures";

const readFixture = (file: string) =>
  readFileSync(
    path.join(
      import.meta.dirname,
      "../../../../../modules/integrations/providers/github/fixtures",
      file,
    ),
    "utf8",
  );

/** One item of a recorded search answer, by its number. */
function recordedItem(file: string, number: number) {
  const { items } = JSON.parse(readFixture(file)) as { items: { number: number }[] };
  return items.find((item) => item.number === number)!;
}

const QUALIFIER = { issue: "is:issue", "pull-request": "is:pr" } as const;

/** A search key with a type qualifier, where the provider puts it: before `is:open`, or last. */
function withType(key: string, type: keyof typeof QUALIFIER) {
  const [head, ...rest] = key.split("&");
  const q = head!.endsWith(" is:open")
    ? `${head!.slice(0, -" is:open".length)} ${QUALIFIER[type]} is:open`
    : `${head} ${QUALIFIER[type]}`;
  return [q, ...rest].join("&");
}

/** `answer` cut to the items of one type, as GitHub answers a search with that type's qualifier. */
function ofType(answer: RecordedAnswer, type: keyof typeof QUALIFIER): RecordedAnswer {
  if (answer instanceof Error) return answer;
  const recorded =
    typeof answer === "string" ? { status: 200, body: JSON.parse(readFixture(answer)) } : answer;
  if (recorded.status !== 200) return recorded;
  const body = recorded.body as { items: { pull_request?: unknown }[] };
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

/** GETs the route as `user` with these query parameters. */
async function search(
  params: Record<string, string> = {},
  { user = connectedUser, connectionId = githubConnection.id } = {},
) {
  const url = new URL(`http://localhost/api/connections/${connectionId}/records`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await callAs(user, (req: Request) =>
    GET(req, { params: Promise.resolve({ connectionId }) }),
    new Request(url),
  );
  return { response, body: await response.json() };
}

describe("GET /api/connections/[connectionId]/records", () => {
  it("searches the words in every repository the token reads, open items only", async () => {
    useRecordedGithub({
      [REPOS]: "repositories.json",
      ...perType(
        `GET /search/issues?q=${SCOPE} status in:title,body is:open&per_page=20`,
        "search-narrowed.json",
      ),
    });
    const { response, body } = await search({ q: "status" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      results: [
        {
          connectionId: githubConnection.id,
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
    });
  });

  it("searches issues and pull requests one search each when no type is chosen, by rank", async () => {
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
    const { body } = await search({ q: "status" });
    expect(body.results.map((result: { key: string }) => result.key.split("#")[1])).toEqual([
      "6", "9", "1", "8", "5",
    ]);
    expect(body.total).toBe(50);
  });

  it.each<{ params: Record<string, string>; q: string }>([
    { params: { type: "issue", q: "status" }, q: `${SCOPE} status in:title,body is:issue is:open` },
    { params: { type: "pull-request", q: "status" }, q: `${SCOPE} status in:title,body is:pr is:open` },
    { params: { type: "issue", closed: "1", q: "status" }, q: `${SCOPE} status in:title,body is:issue` },
  ])("narrows by the toggles $params", async ({ params, q }) => {
    const { requests } = useRecordedGithub({
      [REPOS]: "repositories.json",
      [`GET /search/issues?q=${q}&per_page=20`]: "search-narrowed.json",
    });
    expect((await search(params)).response.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  describe("a word naming a repository", () => {
    /** The token's repositories: the sandbox and one more of the same owner. */
    const twoRepositories = {
      status: 200,
      body: [
        ...JSON.parse(readFixture("repositories.json")),
        { full_name: "laserjm/other", owner: { login: "laserjm", type: "User" } },
      ],
    };

    it.each(["workspace-fixtures", "Workspace-Fixtures", "laserjm/workspace-fixtures", "LaserJM/Workspace-Fixtures"])(
      "narrows the search to it, as %s",
      async (word) => {
        useRecordedGithub({
          [REPOS]: twoRepositories,
          ...perType(
            `GET /search/issues?q=${SCOPE} status in:title,body is:open&per_page=20`,
            "search-narrowed.json",
          ),
        });
        const { response, body } = await search({ q: `${word} status` });
        expect(response.status).toBe(200);
        expect(body.narrowedTo).toEqual(["laserjm/workspace-fixtures"]);
        expect(body.results).toHaveLength(1);
      },
    );

    it("lists the repository newest first when nothing else is typed", async () => {
      useRecordedGithub({
        [REPOS]: twoRepositories,
        ...perType(
          `GET /search/issues?q=${SCOPE} is:open&sort=updated&order=desc&per_page=20`,
          "search.json",
        ),
      });
      const { body } = await search({ q: "workspace-fixtures" });
      expect(body.narrowedTo).toEqual(["laserjm/workspace-fixtures"]);
    });

    it("is searched as a word when it names no repository exactly", async () => {
      useRecordedGithub({
        [REPOS]: twoRepositories,
        ...perType(
          `GET /search/issues?q=${SCOPE} repo:laserjm/other workspace in:title,body is:open&per_page=20`,
          "search-narrowed.json",
        ),
      });
      const { body } = await search({ q: "workspace" });
      expect(body).not.toHaveProperty("narrowedTo");
    });
  });

  describe("a number", () => {
    /** A recorded search answer without #6. */
    const withoutSix = {
      status: 200,
      body: { total_count: 1, incomplete_results: false, items: [recordedItem("search.json", 9)] },
    };

    it.each(["6", "#6"])(
      "is fetched directly and put on top when one repository is in play, as %s",
      async (word) => {
        useRecordedGithub({
          [REPOS]: "repositories.json",
          ...perType(`GET /search/issues?q=${SCOPE} 6 in:title,body is:open&per_page=20`, withoutSix),
          "GET /repos/laserjm/workspace-fixtures/issues/6": "issue.json",
        });
        const { body } = await search({ q: word });
        expect(body.results.map((result: { key: string }) => result.key)).toEqual([
          "laserjm/workspace-fixtures#6",
          "laserjm/workspace-fixtures#9",
        ]);
        expect(body.results[0]).toMatchObject({ type: "issue", state: "open" });
      },
    );

    it("is listed once when the search finds it too", async () => {
      useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(
          `GET /search/issues?q=${SCOPE} 6 in:title,body is:open&per_page=20`,
          "search-narrowed.json",
        ),
        "GET /repos/laserjm/workspace-fixtures/issues/6": "issue.json",
      });
      const { body } = await search({ q: "6" });
      expect(body.results).toHaveLength(1);
    });

    it("is left to the search when it is not of the toggled type", async () => {
      useRecordedGithub({
        [REPOS]: "repositories.json",
        [`GET /search/issues?q=${SCOPE} 6 in:title,body is:pr is:open&per_page=20`]: withoutSix,
        "GET /repos/laserjm/workspace-fixtures/issues/6": "issue.json",
      });
      const { body } = await search({ q: "6", type: "pull-request" });
      expect(body.results).toHaveLength(1);
    });

    it("is left to the search when several repositories are in play", async () => {
      const { requests } = useRecordedGithub({
        [REPOS]: {
          status: 200,
          body: [
            ...JSON.parse(readFixture("repositories.json")),
            { full_name: "laserjm/other", owner: { login: "laserjm", type: "User" } },
          ],
        },
        ...perType(
          `GET /search/issues?q=${SCOPE} repo:laserjm/other 6 in:title,body is:open&per_page=20`,
          withoutSix,
        ),
      });
      const { body } = await search({ q: "#6" });
      expect(body.results).toHaveLength(1);
      expect(requests).toHaveLength(3);
    });
  });

  it("names each owner instead when the repositories make the query longer than 256 characters", async () => {
    // 2 owners × 6 repositories × "repo:<owner>/a-repository-with-a-long-name-N " ≈ 540 characters.
    const repositories = ["acme", "bo"].flatMap((owner) =>
      Array.from({ length: 6 }, (_, index) => ({
        full_name: `${owner}/a-repository-with-a-long-name-${index}`,
        owner: { login: owner, type: owner === "acme" ? "Organization" : "User" },
      })),
    );
    const { requests } = useRecordedGithub({
      [REPOS]: { status: 200, body: repositories },
      ...perType(
        "GET /search/issues?q=user:acme user:bo status in:title,body is:open&per_page=20",
        "search-narrowed.json",
      ),
    });
    const { response, body } = await search({ q: "status" });
    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.reach).toBe("12 repositories across 2 accounts");
    expect(requests).toHaveLength(3);
  });

  it("names the owners in both searches before typing when only the one involving the user is too long", async () => {
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
    expect((await search()).response.status).toBe(200);
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
    const numbersOf = (results: { key: string }[]) =>
      results.map((result) => Number(result.key.split("#")[1]));

    it("lists what involves the user first, then the rest by when it changed, each once", async () => {
      useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(involving(""), answerWith(9, 6)),
        ...perType(recent(""), "search.json"),
      });
      const { body } = await search({ closed: "1" });
      // search.json lists 10, 9, 8, 7, 6, 5, 3, 4, 2, 1.
      expect(numbersOf(body.results)).toEqual([9, 6, 10, 8, 7, 5, 3, 4, 2, 1]);
      expect(body.total).toBe(10);
    });

    it.each<{ params: Record<string, string>; q: string }>([
      { params: { type: "issue" }, q: " is:issue is:open" },
      { params: { type: "pull-request" }, q: " is:pr is:open" },
      { params: { type: "issue", closed: "1" }, q: " is:issue" },
    ])("runs both searches with the toggles $params", async ({ params, q }) => {
      const { requests } = useRecordedGithub({
        [REPOS]: "repositories.json",
        [involving(q)]: answerWith(6),
        [recent(q)]: answerWith(6, 1),
      });
      const { response, body } = await search(params);
      expect(response.status).toBe(200);
      expect(numbersOf(body.results)).toEqual([6, 1]);
      expect(requests).toHaveLength(3);
    });

    it("runs both searches for each type when no type is chosen", async () => {
      const { requests } = useRecordedGithub({
        [REPOS]: "repositories.json",
        ...perType(involving(""), answerWith(6)),
        ...perType(recent(""), answerWith(6, 1)),
      });
      const { body } = await search({ closed: "1" });
      expect(numbersOf(body.results)).toEqual([6, 1]);
      expect(requests).toHaveLength(5);
    });

    it("loads more from the second search alone, of the types that have more", async () => {
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
      const first = await search();
      expect(first.body.total).toBe(50);
      const second = await search({ cursor: first.body.next });
      expect(numbersOf(second.body.results)).toEqual([1]);
      expect(requests.filter((request) => request.includes("involves"))).toHaveLength(2);
      expect(requests.filter((request) => request.includes("&page=2&"))).toHaveLength(1);
    });
  });

  it("refuses a type GitHub does not declare", async () => {
    const { response, body } = await search({ type: "page" });
    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({ kind: "invalid_query" });
  });

  it("pages by an opaque cursor", async () => {
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

    const first = await search({ type: "issue" });
    expect(first.body.next).toEqual(expect.any(String));
    expect(first.body.next).not.toContain("2");
    const second = await search({ type: "issue", cursor: first.body.next });
    expect(second.body.next).toEqual(expect.any(String));
    const third = await search({ type: "issue", cursor: second.body.next });
    expect(third.response.status).toBe(200);
    expect(third.body).not.toHaveProperty("next");

    const forged = await search({ type: "issue", cursor: "page-2" });
    expect(forged.response.status).toBe(422);
  });

  it("computes each record's state from the search item", async () => {
    const closedIssue = {
      ...recordedItem("search-narrowed.json", 6),
      number: 99,
      state: "closed",
      state_reason: "completed",
    };
    const recorded = JSON.parse(readFixture("search.json"));
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
    const { body } = await search({ closed: "1" });
    const stateOf = (number: number) =>
      body.results.find((result: { key: string }) =>
        result.key.endsWith(`#${number}`),
      );
    // The seeded cases (fixtures/README.md), and the closed issue above.
    expect(stateOf(6)).toMatchObject({ type: "issue", state: "open" });
    expect(stateOf(9)).toMatchObject({ type: "pull-request", state: "draft" });
    expect(stateOf(8)).toMatchObject({ type: "pull-request", state: "merged" });
    expect(stateOf(99)).toMatchObject({ type: "issue", state: "closed" });
    expect(stateOf(7)).toMatchObject({ type: "issue", state: "not_planned" });
  });

  it("answers 404 for a connection that is not the user's", async () => {
    useRecordedGithub({});
    const other = await search({}, { user: aUser("bo") });
    expect(other.response.status).toBe(404);
    expect(other.body.error).toMatchObject({ kind: "not_found" });
    const missing = await search({}, { connectionId: "no-such-connection" });
    expect(missing.response.status).toBe(404);
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
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.parse("2026-11-13T12:00:40Z") / 1000) },
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
        answer: { status: 403, body: { message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again." } },
        retryAt: "2026-11-13T12:01:00.000Z",
      },
    ])("answers 429 with retryAt to $name", async ({ answer, retryAt }) => {
      useRecordedGithub(refusal(answer));
      const { response, body } = await search();
      expect(response.status).toBe(429);
      expect(body).toEqual({
        error: { kind: "rate_limited", message: expect.any(String), retryAt },
      });
    });

    it.each([
      { status: 403, body: { message: "Resource not accessible by personal access token" }, kind: "no_access", answered: 403 },
      { status: 404, body: { message: "Not Found" }, kind: "not_found", answered: 404 },
      { status: 422, body: { message: "Validation Failed", errors: [{ message: "The listed users and repositories cannot be searched" }] }, kind: "invalid_query", answered: 422 },
      { status: 502, body: { message: "Server Error" }, kind: "unreachable", answered: 502 },
    ])("answers $answered with $kind to a $status", async ({ status, body: answer, kind, answered }) => {
      useRecordedGithub(refusal({ status, body: answer }));
      const { response, body } = await search();
      expect(response.status).toBe(answered);
      expect(body).toEqual({ error: { kind, message: expect.any(String) } });
    });

    it("passes GitHub's reason on for a query it could not run", async () => {
      useRecordedGithub(refusal({
        status: 422,
        body: { message: "Validation Failed", errors: [{ message: "The listed users and repositories cannot be searched" }] },
      }));
      const { body } = await search();
      expect(body.error.message).toContain("cannot be searched");
    });

    it("answers 502 with unreachable when GitHub does not answer", async () => {
      useRecordedGithub(refusal(new TypeError("fetch failed")));
      const { response, body } = await search();
      expect(response.status).toBe(502);
      expect(body.error).toMatchObject({ kind: "unreachable" });
    });

    it("answers 409 with needs_reconnect to a 401, and marks the connection", async () => {
      useRecordedGithub(refusal({ status: 401, body: { message: "Bad credentials" } }));
      const { response, body } = await search();
      expect(response.status).toBe(409);
      expect(body.error).toMatchObject({ kind: "needs_reconnect" });
      const [github] = await listConnections(connectedUser);
      expect(github).toMatchObject({ id: githubConnection.id, status: "needs_reconnect" });
    });

    it("leaves the connection alone on any other refusal", async () => {
      useRecordedGithub(refusal({ status: 404, body: { message: "Not Found" } }));
      await search();
      const [github] = await listConnections(connectedUser);
      expect(github).toMatchObject({ status: "active" });
    });
  });

  it("answers 401 to a visitor", async () => {
    const { response } = await search({}, { user: null as never });
    expect(response.status).toBe(401);
  });
});
