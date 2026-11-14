// The recorded GitHub answers (ADR 0003 §5) are data, captured by hand from the sandbox
// laserjm/workspace-fixtures. This test is what a recapture has to pass: every README line made
// one file, the seeded cases are still there, and nothing secret was saved.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const folder = path.join(import.meta.dirname, "fixtures");
const readme = readFileSync(path.join(folder, "README.md"), "utf8");

/** `get <request> > <file>.json`: the README's capture lines, by the file each one writes. */
const captureLines = [...readme.matchAll(/^get (.+) > ([\w-]+\.json)$/gm)].map(
  ([, request, file]) => ({ request, file }),
);
const jsonFiles = readdirSync(folder).filter((file) => file.endsWith(".json"));

const textOf = (file: string) => readFileSync(path.join(folder, file), "utf8");

/** One recorded answer, parsed only as far as these checks read it. */
function recorded<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  return schema.parse(JSON.parse(textOf(file)));
}

const labelled = z.looseObject({ labels: z.array(z.looseObject({ name: z.string() })) });
type Labelled = z.infer<typeof labelled>;
const issueSchema = labelled.extend({
  title: z.string(),
  state: z.string(),
  state_reason: z.string().nullable(),
});
const searchItem = issueSchema.extend({
  draft: z.boolean().optional(),
  pull_request: z.looseObject({ merged_at: z.string().nullable() }).optional(),
});
const searchSchema = z.looseObject({ items: z.array(searchItem) });
const pullRequest = labelled.extend({
  state: z.string(),
  draft: z.boolean(),
  merged: z.boolean(),
  head: z.looseObject({ sha: z.string() }),
});
const list = z.array(z.unknown());
const workflowRuns = z.looseObject({
  workflow_runs: z.array(z.looseObject({ head_sha: z.string() })),
});

const isCase = (name: string) => (record: Labelled) =>
  record.labels.some((label) => label.name === `case/${name}`);

describe("the recorded GitHub answers", () => {
  it("are made one file per README line, and every file has its line", () => {
    expect(captureLines.map(({ file }) => file).toSorted()).toEqual(jsonFiles.toSorted());
    expect(new Set(captureLines.map(({ file }) => file)).size).toBe(captureLines.length);
  });

  it("save no token and no Authorization header", () => {
    const secret = /authorization|bearer |gh[opsur]_[A-Za-z0-9]{20}|github_pat_/i;
    const leaking = jsonFiles.filter((file) => secret.test(textOf(file)));
    expect(leaking).toEqual([]);
  });

  it("hold the open issue with its three comments", () => {
    const issue = recorded("issue.json", issueSchema);
    expect(isCase("open-issue")(issue)).toBe(true);
    expect(issue).toMatchObject({
      title: "Sample: publish a status page for the prototype",
      state: "open",
    });
    expect(recorded("issue-comments.json", list)).toHaveLength(3);
  });

  it("hold the issue closed as not planned", () => {
    const issue = recorded("issue-not-planned.json", issueSchema);
    expect(isCase("not-planned")(issue)).toBe(true);
    expect(issue).toMatchObject({ state: "closed", state_reason: "not_planned" });
  });

  it("hold the draft pull request with its one file and its Actions runs", () => {
    const pull = recorded("pull-request-draft.json", pullRequest);
    expect(isCase("draft-pr")(pull)).toBe(true);
    expect(pull).toMatchObject({ state: "open", draft: true });
    expect(recorded("pull-request-draft-files.json", list)).toEqual([
      expect.objectContaining({ filename: "status/history.md", status: "added" }),
    ]);
    expect(recorded("pull-request-draft-status.json", z.unknown())).toMatchObject({
      sha: pull.head.sha,
      statuses: [],
    });
    const { workflow_runs: runs } = recorded("pull-request-draft-workflow-runs.json", workflowRuns);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.head_sha === pull.head.sha)).toBe(true);
  });

  it("hold the merged pull request with its review, comments and changed files", () => {
    const pull = recorded("pull-request.json", pullRequest);
    expect(isCase("merged-pr")(pull)).toBe(true);
    expect(pull).toMatchObject({ state: "closed", merged: true });
    expect(recorded("pull-request-reviews.json", list)).toEqual([
      expect.objectContaining({ state: "COMMENTED" }),
    ]);
    expect(recorded("pull-request-review-comments.json", list)).toEqual([
      expect.objectContaining({ path: "status/components.json" }),
    ]);
    expect(recorded("pull-request-comments.json", list)).toHaveLength(1);
    const files = recorded(
      "pull-request-files.json",
      z.array(z.looseObject({ filename: z.string(), status: z.string() })),
    );
    expect(files.map(({ filename, status }) => `${status} ${filename}`).toSorted()).toEqual([
      "added status/README.md",
      "added status/components.json",
      "added status/incidents.md",
      "modified README.md",
    ]);
  });

  it("hold Actions runs and commit statuses for the merged pull request's head", () => {
    const { sha } = recorded("pull-request.json", pullRequest).head;
    const status = recorded(
      "pull-request-status.json",
      z.looseObject({
        sha: z.string(),
        state: z.string(),
        statuses: z.array(z.looseObject({ context: z.string(), state: z.string() })),
      }),
    );
    expect(status).toMatchObject({ sha, state: "failure" });
    expect(status.statuses.map(({ context, state }) => `${context} ${state}`).toSorted()).toEqual([
      "fixtures/links failure",
      "fixtures/schema success",
    ]);
    const { workflow_runs: runs } = recorded("pull-request-workflow-runs.json", workflowRuns);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.head_sha === sha)).toBe(true);
  });

  it("hold a search page with every seeded state", () => {
    const { items } = recorded("search.json", searchSchema);
    const stateOf = (name: string) => {
      const item = items.find(isCase(name));
      if (!item) return undefined;
      if (item.draft) return "draft";
      if (item.pull_request?.merged_at) return "merged";
      return item.state_reason === "not_planned" ? "not_planned" : item.state;
    };
    expect(
      ["open-issue", "not-planned", "draft-pr", "merged-pr"].map(stateOf),
    ).toEqual(["open", "not_planned", "draft", "merged"]);
  });

  it("hold the involves:@me search and a search narrowed to the open issue", () => {
    const involved = recorded("search-involves-me.json", searchSchema).items;
    expect(involved.some(isCase("open-issue"))).toBe(true);
    expect(involved.some(isCase("draft-pr"))).toBe(true);
    const narrowed = recorded("search-narrowed.json", searchSchema).items;
    expect(narrowed).toHaveLength(1);
    expect(narrowed.every(isCase("open-issue"))).toBe(true);
  });

  it("hold the user and the sandbox repository, without account-only fields", () => {
    const user = recorded("user.json", z.unknown());
    expect(user).toHaveProperty("login", "laserjm");
    expect(user).not.toHaveProperty("email");
    expect(user).not.toHaveProperty("total_private_repos");
    expect(recorded("repositories.json", list)).toEqual([
      expect.objectContaining({ full_name: "laserjm/workspace-fixtures", private: false }),
    ]);
  });
});
