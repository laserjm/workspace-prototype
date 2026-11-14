// The record tools the agent calls, against the test database and recorded GitHub answers: they
// read only the connections the server allowed for the answer, whatever the model asks.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { User } from "@/lib/auth";
import { insertConnection, insertUser } from "@/test/factories";
import { useRecordedGithub } from "@/test/support/recorded-github";
import { MAX_SEARCH_RESULTS, type ReadRecordInput, type SearchRecordsInput } from "./contracts";
import { recordTools } from "./tools";

const FIXTURES = path.resolve(
  import.meta.dirname,
  "../integrations/providers/github/fixtures",
);
const fixture = (file: string): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

const REPOS = "GET /user/repos?per_page=100";
const SCOPE = "repo:laserjm/workspace-fixtures";
const ISSUE = "GET /repos/laserjm/workspace-fixtures/issues/6";
const ISSUE_COMMENTS = "GET /repos/laserjm/workspace-fixtures/issues/6/comments?per_page=100";
const ISSUE_PAGE = "https://github.com/laserjm/workspace-fixtures/issues/6";

type ToolContext = { user?: User; connectionIds: string[] };

const searchAs = (context: ToolContext, input: SearchRecordsInput) =>
  recordTools.search_records.execute(input, { toolCallId: "call-1", messages: [], context });

const readAs = (context: ToolContext, input: ReadRecordInput) =>
  recordTools.read_record.execute(input, { toolCallId: "call-1", messages: [], context });

/** A user with one GitHub connection, allowed for the answer. */
async function allowedConnection() {
  const user = await insertUser();
  const connection = await insertConnection(user);
  return { user, connection, context: { user, connectionIds: [connection.id] } };
}

describe("search_records", () => {
  it("searches with GitHub's qualifiers passed through, answering the matches and their count", async () => {
    const { connection, context } = await allowedConnection();
    const { requests } = useRecordedGithub({
      [REPOS]: "repositories.json",
      [`GET /search/issues?q=${SCOPE} label:fixture is:issue is:open&per_page=20`]:
        "search-narrowed.json",
    });

    const answer = await searchAs(context, {
      connectionId: connection.id,
      query: "label:fixture",
      type: "issue",
    });

    expect(answer).toMatchObject({
      results: [{ connectionId: connection.id, key: "laserjm/workspace-fixtures#6" }],
      total: 1,
    });
    expect(requests).toHaveLength(2);
  });

  it(`answers at most ${MAX_SEARCH_RESULTS} results`, async () => {
    const { connection, context } = await allowedConnection();
    const { items } = z
      .object({ items: z.array(z.looseObject({})) })
      .parse(fixture("search-narrowed.json"));
    const [item] = items;
    const many = {
      status: 200,
      body: {
        total_count: 15,
        incomplete_results: false,
        items: Array.from({ length: 15 }, (_, index) => ({ ...item, id: 100 + index, number: 100 + index })),
      },
    };
    useRecordedGithub({
      [REPOS]: "repositories.json",
      [`GET /search/issues?q=${SCOPE} status is:issue is:open&per_page=20`]: many,
      [`GET /search/issues?q=${SCOPE} status is:pr is:open&per_page=20`]: {
        ...many,
        body: {
          ...many.body,
          items: many.body.items.map((found) => ({ ...found, id: found.id + 100, number: found.number + 100 })),
        },
      },
    });

    const answer = await searchAs(context, { connectionId: connection.id, query: "status" });

    expect(answer).toMatchObject({ total: 30 });
    expect(answer).toHaveProperty("results.length", MAX_SEARCH_RESULTS);
  });

  it("answers no_access for a connection not allowed for the answer, without asking GitHub", async () => {
    const { user, connection } = await allowedConnection();
    const { requests } = useRecordedGithub({});

    expect(
      await searchAs({ user, connectionIds: [] }, { connectionId: connection.id, query: "status" }),
    ).toEqual({ error: { kind: "no_access" } });
    expect(
      await searchAs({ connectionIds: [connection.id] }, { connectionId: connection.id, query: "status" }),
    ).toEqual({ error: { kind: "no_access" } });
    expect(requests).toEqual([]);
  });

  it("answers not_found for someone else's connection, even when it is listed as allowed", async () => {
    const { connection } = await allowedConnection();
    const other = await insertUser();
    const { requests } = useRecordedGithub({});

    expect(
      await searchAs(
        { user: other, connectionIds: [connection.id] },
        { connectionId: connection.id, query: "status" },
      ),
    ).toEqual({ error: { kind: "not_found" } });
    expect(requests).toEqual([]);
  });

  it("answers GitHub's refusal as data", async () => {
    const { connection, context } = await allowedConnection();
    useRecordedGithub({ [REPOS]: { status: 401, body: { message: "Bad credentials" } } });

    expect(await searchAs(context, { connectionId: connection.id, query: "status" })).toEqual({
      error: { kind: "needs_reconnect" },
    });
  });
});

describe("read_record", () => {
  it("answers the record's live summary and its detail trimmed for the model", async () => {
    const { connection, context } = await allowedConnection();
    useRecordedGithub({ [ISSUE]: "issue.json", [ISSUE_COMMENTS]: "issue-comments.json" });

    const answer = await readAs(context, {
      connectionId: connection.id,
      type: "issue",
      key: "laserjm/workspace-fixtures#6",
    });

    expect(answer).toMatchObject({
      summary: { connectionId: connection.id, state: "open", url: ISSUE_PAGE },
      detail: { labels: ["fixture", "case/open-issue"], commentCount: 3 },
    });
  });

  it("answers no_access for a connection not allowed for the answer, without asking GitHub", async () => {
    const { user, connection } = await allowedConnection();
    const { requests } = useRecordedGithub({});

    expect(
      await readAs(
        { user, connectionIds: [] },
        { connectionId: connection.id, type: "issue", key: "laserjm/workspace-fixtures#6" },
      ),
    ).toEqual({ error: { kind: "no_access" } });
    expect(requests).toEqual([]);
  });

  it("answers not_found for someone else's connection, even when it is listed as allowed", async () => {
    const { connection } = await allowedConnection();
    const other = await insertUser();
    const { requests } = useRecordedGithub({});

    expect(
      await readAs(
        { user: other, connectionIds: [connection.id] },
        { connectionId: connection.id, type: "issue", key: "laserjm/workspace-fixtures#6" },
      ),
    ).toEqual({ error: { kind: "not_found" } });
    expect(requests).toEqual([]);
  });

  it("keeps the record's page on a refusal, so the model can point the user to it", async () => {
    const { connection, context } = await allowedConnection();
    const missing = { status: 404, body: { message: "Not Found" } };
    useRecordedGithub({ [ISSUE]: missing, [ISSUE_COMMENTS]: missing });

    expect(
      await readAs(context, {
        connectionId: connection.id,
        type: "issue",
        key: "laserjm/workspace-fixtures#6",
      }),
    ).toEqual({ error: { kind: "not_found", url: ISSUE_PAGE } });
  });
});
