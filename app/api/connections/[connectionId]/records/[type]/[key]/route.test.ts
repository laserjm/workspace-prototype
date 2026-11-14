// The record detail route, called as a signed-in user, over recorded GitHub answers: the real
// GitHub provider runs, and only `fetch` is answered (ADR 0003 §5).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("a pull request", () => {
    const REPO = "GET /repos/laserjm/workspace-fixtures";
    const HEAD = "7b55399cea249bb3579d78746cbb25ca5567ec80";
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
      useRecordedGithub(merged);
      const { response, body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(response.status).toBe(200);
      expect(body.summary).toMatchObject({
        type: "pull-request",
        title: "Sample: add the status page data",
        state: "merged",
        url: "https://github.com/laserjm/workspace-fixtures/pull/8",
      });
      expect(body.detail).toMatchObject({ number: 8, author: "laserjm", commentCount: 1 });
      expect(body.detail.body).not.toBe("");
      expect(body.detail.comments).toHaveLength(1);
      expect(body.detail.reviews).toHaveLength(1);
      expect(body.detail.reviews[0]).toMatchObject({
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
      expect(body.detail.merge).toMatchObject({
        mergeableState: "unknown",
        merged: true,
        draft: false,
        closed: true,
        base: "main",
        head: "fixtures/status-page",
      });
      expect(body.detail.fileCount).toBe(4);
      expect(
        body.detail.files.map(
          (file: { status: string; path: string; additions: number; deletions: number }) =>
            `${file.status} ${file.path} +${file.additions} -${file.deletions}`,
        ),
      ).toEqual([
        "modified README.md +2 -0",
        "added status/README.md +4 -0",
        "added status/components.json +7 -0",
        "added status/incidents.md +4 -0",
      ]);
      expect(JSON.stringify(body.detail.files)).not.toContain("patch");
    });

    it("reads the GitHub Actions runs and the combined commit status of its head", async () => {
      useRecordedGithub(merged);
      const { body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(body.detail.ci.headSha).toBe(HEAD);
      expect(body.detail.ci.actions.readable).toBe(true);
      expect(body.detail.ci.actions.total).toBe(2);
      expect(
        body.detail.ci.actions.runs.map(
          (run: { name: string; event: string; status: string; conclusion: string }) =>
            `${run.name} ${run.event} ${run.status} ${run.conclusion}`,
        ),
      ).toEqual([
        "Fixture checks pull_request completed success",
        "Fixture checks push completed success",
      ]);
      expect(body.detail.ci.actions.runs[0].url).toBe(
        "https://github.com/laserjm/workspace-fixtures/actions/runs/43413512557",
      );
      expect(body.detail.ci.statuses).toMatchObject({ readable: true, state: "failure" });
      expect(
        body.detail.ci.statuses.statuses.map(
          (status: { context: string; state: string; description: string }) =>
            `${status.context} ${status.state}: ${status.description}`,
        ),
      ).toEqual([
        "fixtures/schema success: components.json matches the schema",
        "fixtures/links failure: 1 broken link in incidents.md",
      ]);
    });

    it("still loads when the token lacks Actions: read, and says the runs are not readable", async () => {
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
      const { response, body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(response.status).toBe(200);
      expect(body.detail.ci.actions).toEqual({ readable: false });
      expect(body.detail.ci.statuses).toMatchObject({ readable: true, state: "failure" });
      expect(body.detail.reviews).toHaveLength(1);
      expect(body.detail.files).toHaveLength(4);
    });

    it("reads a draft one as a draft, with its file and Actions runs and no reviews yet", async () => {
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
      const { response, body } = await read("pull-request", "laserjm/workspace-fixtures#9");
      expect(response.status).toBe(200);
      expect(body.summary).toMatchObject({
        title: "Sample: keep older incidents on a history page",
        state: "draft",
      });
      // GitHub calls the draft `clean`; the view must not read that as ready to merge.
      expect(body.detail.merge).toMatchObject({
        mergeableState: "clean",
        draft: true,
        merged: false,
        closed: false,
      });
      expect(body.detail.merge.mergedAt).toBeUndefined();
      expect(body.detail.reviews).toEqual([]);
      expect(body.detail.files).toEqual([
        { path: "status/history.md", status: "added", additions: 3, deletions: 0 },
      ]);
      expect(body.detail.ci.headSha).toBe(DRAFT_HEAD);
      expect(body.detail.ci.actions).toMatchObject({ readable: true, total: 2 });
      expect(body.detail.ci.statuses).toEqual({ readable: true, state: "pending", statuses: [] });
    });

    it("keeps the first 100 changed files and counts the rest", async () => {
      const pull = readFixture("pull-request.json");
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
      const { body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(body.detail.files).toHaveLength(100);
      expect(body.detail.fileCount).toBe(130);
    });

    it("answers 404 for an issue read as a pull request", async () => {
      useRecordedGithub({
        ...merged,
        [`${REPO}/pulls/8`]: { status: 404, body: { message: "Not Found" } },
      });
      const { response, body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(response.status).toBe(404);
      expect(body.error.url).toBe("https://github.com/laserjm/workspace-fixtures/pull/8");
    });

    it("strips invisible and bidirectional characters from reviews, file paths and CI", async () => {
      const hidden = "‮​";
      const reviews = readFixture("pull-request-reviews.json");
      const files = readFixture("pull-request-files.json");
      const status = readFixture("pull-request-status.json");
      useRecordedGithub({
        ...merged,
        [`${REPO}/pulls/8/reviews?per_page=100`]: {
          status: 200,
          body: [{ ...reviews[0], body: `Reads${hidden} well` }],
        },
        [`${REPO}/pulls/8/files?per_page=100`]: {
          status: 200,
          body: [{ ...files[0], filename: `READ${hidden}ME.md` }],
        },
        [`${REPO}/commits/${HEAD}/status`]: {
          status: 200,
          body: { ...status, statuses: [{ ...status.statuses[0], description: `ok${hidden}` }] },
        },
      });
      const { body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(body.detail.reviews[0].body).toBe("Reads well");
      expect(body.detail.files[0].path).toBe("README.md");
      expect(body.detail.ci.statuses.statuses[0].description).toBe("ok");
    });

    it("fails the view when CI hits the rate limit", async () => {
      useRecordedGithub({
        ...merged,
        [`${REPO}/commits/${HEAD}/status`]: {
          status: 429,
          headers: { "retry-after": "30" },
          body: { message: "You have exceeded a secondary rate limit." },
        },
      });
      const { response, body } = await read("pull-request", "laserjm/workspace-fixtures#8");
      expect(response.status).toBe(429);
      expect(body.error.kind).toBe("rate_limited");
    });
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
