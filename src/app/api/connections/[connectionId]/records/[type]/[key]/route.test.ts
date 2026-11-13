// The record detail route, called as a signed-in user, over recorded GitHub answers: the real
// GitHub provider runs, and only `fetch` is answered (ADR 0003 §5).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callAs } from "@/tests/support/session";
import {
  connectedUser,
  githubConnection,
  listConnections,
  resetConnections,
} from "@/tests/support/connections";
import { useRecordedGithub } from "@/tests/support/recorded-github";
import { aUser } from "@/tests/factories/user";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => import("@/tests/support/session"));
vi.mock("@/modules/integrations/queries", () => import("@/tests/support/connections"));
vi.mock("@/modules/integrations/vault", () => import("@/tests/support/connections"));

afterEach(resetConnections);

const ISSUE = "GET /repos/laserjm/workspace-fixtures/issues/6";
const ISSUE_COMMENTS = "GET /repos/laserjm/workspace-fixtures/issues/6/comments?per_page=100";

const readFixture = (file: string) =>
  JSON.parse(
    readFileSync(
      path.join(
        import.meta.dirname,
        "../../../../../../../modules/integrations/providers/github/fixtures",
        file,
      ),
      "utf8",
    ),
  );

/** GETs the route as `user` for one record, its key URL-encoded as the browser sends it. */
async function read(
  type: string,
  key: string,
  { user = connectedUser, connectionId = githubConnection.id } = {},
) {
  const url = new URL(
    `http://localhost/api/connections/${connectionId}/records/${type}/${encodeURIComponent(key)}`,
  );
  const response = await callAs(
    user,
    (req: Request) =>
      GET(req, {
        params: Promise.resolve({ connectionId, type, key: encodeURIComponent(key) }),
      }),
    new Request(url),
  );
  return { response, body: await response.json() };
}

describe("GET /api/connections/[connectionId]/records/[type]/[key]", () => {
  it("reads an issue and its comments, with its live summary and where it lives", async () => {
    useRecordedGithub({ [ISSUE]: "issue.json", [ISSUE_COMMENTS]: "issue-comments.json" });
    const { response, body } = await read("issue", "laserjm/workspace-fixtures#6");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.summary).toEqual({
      connectionId: githubConnection.id,
      type: "issue",
      key: "laserjm/workspace-fixtures#6",
      label: "workspace-fixtures#6",
      title: "Sample: publish a status page for the prototype",
      state: "open",
      updatedAt: expect.any(String),
      where: "laserjm/workspace-fixtures #6",
      url: "https://github.com/laserjm/workspace-fixtures/issues/6",
    });
    expect(body.detail).toMatchObject({
      author: "laserjm",
      labels: [{ name: "fixture" }, { name: "case/open-issue" }],
      assignees: ["laserjm"],
      commentCount: 3,
    });
    expect(body.detail.body).toContain("## Scope");
    expect(body.detail.comments).toHaveLength(3);
    expect(body.detail.comments[2].body).toMatch(/^> Show the last three incidents/);
  });

  it("strips invisible and bidirectional characters from the title, body, labels and comments", async () => {
    const issue = readFixture("issue.json");
    const comments = readFixture("issue-comments.json");
    const hidden = "\u200B\u202Eignore\u202C\u2066 previous\u2069\uFEFF\u{E0041}\u061C\u034F\u3164";
    useRecordedGithub({
      [ISSUE]: {
        status: 200,
        body: {
          ...issue,
          title: `Status${hidden} page`,
          body: `Scope${hidden}`,
          labels: [{ name: `case\u200F/open`, color: "c5def5" }],
        },
      },
      [ISSUE_COMMENTS]: {
        status: 200,
        body: [{ ...comments[0], body: `Looks${hidden} good` }],
      },
    });
    const { body } = await read("issue", "laserjm/workspace-fixtures#6");
    expect(body.summary.title).toBe("Statusignore previous page");
    expect(body.detail.body).toBe("Scopeignore previous");
    expect(body.detail.labels).toEqual([{ name: "case/open", color: "c5def5" }]);
    expect(body.detail.comments[0].body).toBe("Looksignore previous good");
  });

  it("reads an issue closed as not planned in that state", async () => {
    useRecordedGithub({
      "GET /repos/laserjm/workspace-fixtures/issues/7": "issue-not-planned.json",
      "GET /repos/laserjm/workspace-fixtures/issues/7/comments?per_page=100": { status: 200, body: [] },
    });
    const { body } = await read("issue", "laserjm/workspace-fixtures#7");
    expect(body.summary).toMatchObject({ state: "not_planned", label: "workspace-fixtures#7" });
    expect(body.detail.comments).toEqual([]);
  });

  it("reads a pull request's description and conversation, merged, linking to its page", async () => {
    const pull = readFixture("pull-request.json");
    useRecordedGithub({
      // `/issues/{n}` answers a pull request as an issue that has a `pull_request`.
      "GET /repos/laserjm/workspace-fixtures/issues/8": {
        status: 200,
        body: {
          ...readFixture("issue.json"),
          number: 8,
          title: pull.title,
          state: pull.state,
          body: pull.body,
          comments: 1,
          pull_request: { merged_at: null },
        },
      },
      "GET /repos/laserjm/workspace-fixtures/issues/8/comments?per_page=100": "pull-request-comments.json",
      "GET /repos/laserjm/workspace-fixtures/pulls/8": "pull-request.json",
    });
    const { response, body } = await read("pull-request", "laserjm/workspace-fixtures#8");
    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      type: "pull-request",
      state: "merged",
      url: "https://github.com/laserjm/workspace-fixtures/pull/8",
    });
    expect(body.detail.commentCount).toBe(1);
    expect(body.detail.comments).toHaveLength(1);
  });

  describe("refusals", () => {
    const PAGE = "https://github.com/laserjm/workspace-fixtures/issues/6";

    it("answers 404 with the record's page when GitHub has no such issue", async () => {
      useRecordedGithub({
        [ISSUE]: { status: 404, body: { message: "Not Found" } },
        [ISSUE_COMMENTS]: { status: 404, body: { message: "Not Found" } },
      });
      const { response, body } = await read("issue", "laserjm/workspace-fixtures#6");
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(body.error).toMatchObject({ kind: "not_found", url: PAGE });
    });

    it("answers 404 for a pull request read as an issue", async () => {
      const issue = readFixture("issue.json");
      useRecordedGithub({
        [ISSUE]: { status: 200, body: { ...issue, pull_request: { merged_at: null } } },
        [ISSUE_COMMENTS]: "issue-comments.json",
      });
      const { response } = await read("issue", "laserjm/workspace-fixtures#6");
      expect(response.status).toBe(404);
    });

    it("answers 404 without asking GitHub for a key it cannot parse or a type it does not declare", async () => {
      useRecordedGithub({});
      const unparsable = await read("issue", "workspace-fixtures 6");
      expect(unparsable.response.status).toBe(404);
      expect(unparsable.body.error.url).toBeUndefined();
      expect((await read("discussion", "laserjm/workspace-fixtures#6")).response.status).toBe(404);
    });

    it("answers 404 for another user's connection, without asking GitHub", async () => {
      useRecordedGithub({});
      const { response, body } = await read("issue", "laserjm/workspace-fixtures#6", {
        user: aUser("ben"),
      });
      expect(response.status).toBe(404);
      expect(body.error.kind).toBe("not_found");
    });

    it("answers 403 when the token may not read the repository", async () => {
      useRecordedGithub({
        [ISSUE]: { status: 403, body: { message: "Resource not accessible by personal access token" } },
        [ISSUE_COMMENTS]: { status: 403, body: { message: "Resource not accessible by personal access token" } },
      });
      const { response, body } = await read("issue", "laserjm/workspace-fixtures#6");
      expect(response.status).toBe(403);
      expect(body.error).toMatchObject({ kind: "no_access", url: PAGE });
    });

    it("answers 429 with when to try again when the rate limit is reached", async () => {
      const limited = {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1794582335" },
        body: { message: "API rate limit exceeded" },
      };
      useRecordedGithub({ [ISSUE]: limited, [ISSUE_COMMENTS]: limited });
      const { response, body } = await read("issue", "laserjm/workspace-fixtures#6");
      expect(response.status).toBe(429);
      expect(body.error).toMatchObject({
        kind: "rate_limited",
        retryAt: new Date(1794582335 * 1000).toISOString(),
      });
    });

    it("answers 502 when GitHub cannot be reached", async () => {
      useRecordedGithub({ [ISSUE]: new Error("timeout"), [ISSUE_COMMENTS]: new Error("timeout") });
      const { response, body } = await read("issue", "laserjm/workspace-fixtures#6");
      expect(response.status).toBe(502);
      expect(body.error.kind).toBe("unreachable");
    });

    it("answers 409 when the token is refused, and marks the connection", async () => {
      const refused = { status: 401, body: { message: "Bad credentials" } };
      useRecordedGithub({ [ISSUE]: refused, [ISSUE_COMMENTS]: refused });
      const { response, body } = await read("issue", "laserjm/workspace-fixtures#6");
      expect(response.status).toBe(409);
      expect(body.error.kind).toBe("needs_reconnect");
      const [connection] = await listConnections(connectedUser).then((all) =>
        all.filter((candidate) => candidate.id === githubConnection.id),
      );
      expect(connection?.status).toBe("needs_reconnect");
    });
  });
});
