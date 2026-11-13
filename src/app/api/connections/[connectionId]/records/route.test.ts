// The record search route, called as a signed-in user, over recorded GitHub answers: the real
// GitHub provider runs, and only `fetch` is answered (ADR 0003 §5).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAs } from "@/tests/support/session";
import {
  connectedUser,
  githubConnection,
  listConnections,
  resetConnections,
} from "@/tests/support/connections";
import { useRecordedGithub, type RecordedAnswer } from "@/tests/support/recorded-github";
import { aUser } from "@/tests/factories/user";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => import("@/tests/support/session"));
vi.mock("@/modules/integrations/queries", () => import("@/tests/support/connections"));
vi.mock("@/modules/integrations/vault", () => import("@/tests/support/connections"));

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
      [`GET /search/issues?q=${SCOPE} status in:title,body is:open&per_page=20`]:
        "search-narrowed.json",
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

  it.each<{ params: Record<string, string>; q: string }>([
    { params: { type: "issue" }, q: `${SCOPE} is:issue is:open` },
    { params: { type: "pull-request" }, q: `${SCOPE} is:pr is:open` },
    { params: { closed: "1" }, q: SCOPE },
    { params: { type: "issue", closed: "1" }, q: `${SCOPE} is:issue` },
  ])("narrows by the toggles $params, newest first before typing", async ({ params, q }) => {
    const { requests } = useRecordedGithub({
      [REPOS]: "repositories.json",
      [`GET /search/issues?q=${q}&sort=updated&order=desc&per_page=20`]: "search.json",
    });
    expect((await search(params)).response.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("refuses a type GitHub does not declare", async () => {
    const { response, body } = await search({ type: "page" });
    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({ kind: "invalid_query" });
  });

  it("pages by an opaque cursor", async () => {
    const page = (number: number) =>
      `GET /search/issues?q=${SCOPE} is:open&sort=updated&order=desc&per_page=20${number > 1 ? `&page=${number}` : ""}`;
    const many = { status: 200, body: { total_count: 45, incomplete_results: false, items: [] } };
    useRecordedGithub({ [REPOS]: "repositories.json", [page(1)]: many, [page(2)]: many, [page(3)]: many });

    const first = await search();
    expect(first.body.next).toEqual(expect.any(String));
    expect(first.body.next).not.toContain("2");
    const second = await search({ cursor: first.body.next });
    expect(second.body.next).toEqual(expect.any(String));
    const third = await search({ cursor: second.body.next });
    expect(third.response.status).toBe(200);
    expect(third.body).not.toHaveProperty("next");

    const forged = await search({ cursor: "page-2" });
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
      [`GET /search/issues?q=${SCOPE}&sort=updated&order=desc&per_page=20`]: {
        status: 200,
        body: { ...recorded, items: [...recorded.items, closedIssue] },
      },
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
    const NOW = new Date("2026-11-13T12:00:00Z");

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** The recorded answers when the search gets `answer`. */
    const refusal = (answer: RecordedAnswer) => ({
      [REPOS]: "repositories.json",
      [SEARCH]: answer,
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
      const [, github] = await listConnections(connectedUser);
      expect(github).toMatchObject({ id: githubConnection.id, status: "needs_reconnect" });
    });

    it("leaves the connection alone on any other refusal", async () => {
      useRecordedGithub(refusal({ status: 404, body: { message: "Not Found" } }));
      await search();
      const [, github] = await listConnections(connectedUser);
      expect(github).toMatchObject({ status: "active" });
    });
  });

  it("answers 401 to a visitor", async () => {
    const { response } = await search({}, { user: null as never });
    expect(response.status).toBe(401);
  });
});
