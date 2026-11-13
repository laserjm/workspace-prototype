// The recorded GitHub answers (ADR 0003 §5) are data, captured by hand from the sandbox
// laserjm/workspace-fixtures. This test is what a recapture has to pass: every README line made
// one file, the seeded cases are still there, and nothing secret was saved.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const folder = path.join(import.meta.dirname, "fixtures");
const readme = readFileSync(path.join(folder, "README.md"), "utf8");

/** `get <request> > <file>.json`: the README's capture lines, by the file each one writes. */
const captureLines = [...readme.matchAll(/^get (.+) > ([\w-]+\.json)$/gm)].map(
  ([, request, file]) => ({ request, file }),
);
const jsonFiles = readdirSync(folder).filter((file) => file.endsWith(".json"));

/** One saved answer, typed only as far as these checks read it. */
function answer<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(folder, file), "utf8")) as T;
}

type Labelled = { labels: { name: string }[] };
type Issue = Labelled & { title: string; state: string; state_reason: string | null };
type SearchItem = Issue & { draft?: boolean; pull_request?: { merged_at: string | null } };
type Search = { items: SearchItem[] };
type PullRequest = Labelled & {
  state: string;
  draft: boolean;
  merged: boolean;
  head: { sha: string };
};

const isCase = (name: string) => (record: Labelled) =>
  record.labels.some((label) => label.name === `case/${name}`);

describe("the recorded GitHub answers", () => {
  it("are made one file per README line, and every file has its line", () => {
    expect(captureLines.map(({ file }) => file).toSorted()).toEqual(jsonFiles.toSorted());
    expect(new Set(captureLines.map(({ file }) => file)).size).toBe(captureLines.length);
  });

  it("save no token and no Authorization header", () => {
    const secret = /authorization|bearer |gh[opsur]_[A-Za-z0-9]{20}|github_pat_/i;
    const leaking = jsonFiles.filter((file) =>
      secret.test(readFileSync(path.join(folder, file), "utf8")),
    );
    expect(leaking).toEqual([]);
  });

  it("hold the open issue with its three comments", () => {
    const issue = answer<Issue>("issue.json");
    expect(isCase("open-issue")(issue)).toBe(true);
    expect(issue).toMatchObject({
      title: "Sample: publish a status page for the prototype",
      state: "open",
    });
    expect(answer<unknown[]>("issue-comments.json")).toHaveLength(3);
  });

  it("hold the issue closed as not planned", () => {
    const issue = answer<Issue>("issue-not-planned.json");
    expect(isCase("not-planned")(issue)).toBe(true);
    expect(issue).toMatchObject({ state: "closed", state_reason: "not_planned" });
  });

  it("hold the draft pull request", () => {
    const pull = answer<PullRequest>("pull-request-draft.json");
    expect(isCase("draft-pr")(pull)).toBe(true);
    expect(pull).toMatchObject({ state: "open", draft: true });
  });

  it("hold the merged pull request with its review, comments and changed files", () => {
    const pull = answer<PullRequest>("pull-request.json");
    expect(isCase("merged-pr")(pull)).toBe(true);
    expect(pull).toMatchObject({ state: "closed", merged: true });
    expect(answer<{ state: string }[]>("pull-request-reviews.json")).toEqual([
      expect.objectContaining({ state: "COMMENTED" }),
    ]);
    expect(answer<{ path: string }[]>("pull-request-review-comments.json")).toEqual([
      expect.objectContaining({ path: "status/components.json" }),
    ]);
    expect(answer<unknown[]>("pull-request-comments.json")).toHaveLength(1);
    const files = answer<{ filename: string; status: string }[]>("pull-request-files.json");
    expect(files.map(({ filename, status }) => `${status} ${filename}`).toSorted()).toEqual([
      "added status/README.md",
      "added status/components.json",
      "added status/incidents.md",
      "modified README.md",
    ]);
  });

  it("hold Actions runs and commit statuses for the merged pull request's head", () => {
    const { sha } = answer<PullRequest>("pull-request.json").head;
    const status = answer<{ sha: string; state: string; statuses: { context: string; state: string }[] }>(
      "pull-request-status.json",
    );
    expect(status).toMatchObject({ sha, state: "failure" });
    expect(status.statuses.map(({ context, state }) => `${context} ${state}`).toSorted()).toEqual([
      "fixtures/links failure",
      "fixtures/schema success",
    ]);
    const { workflow_runs: runs } = answer<{ workflow_runs: { head_sha: string }[] }>(
      "pull-request-workflow-runs.json",
    );
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.head_sha === sha)).toBe(true);
  });

  it("hold a search page with every seeded state", () => {
    const { items } = answer<Search>("search.json");
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

  it("hold the involves:@me search, open records only, and a search narrowed to the open issue", () => {
    const involved = answer<Search>("search-involves-me.json").items;
    expect(involved.every((item) => item.state === "open")).toBe(true);
    expect(involved.some(isCase("open-issue"))).toBe(true);
    expect(involved.some(isCase("draft-pr"))).toBe(true);
    const narrowed = answer<Search>("search-narrowed.json").items;
    expect(narrowed).toHaveLength(1);
    expect(isCase("open-issue")(narrowed[0]!)).toBe(true);
  });

  it("hold the user and the sandbox repository, without account-only fields", () => {
    const user = answer<Record<string, unknown>>("user.json");
    expect(user).toHaveProperty("login", "laserjm");
    expect(user).not.toHaveProperty("email");
    expect(user).not.toHaveProperty("total_private_repos");
    expect(answer<{ full_name: string; private: boolean }[]>("repositories.json")).toEqual([
      expect.objectContaining({ full_name: "laserjm/workspace-fixtures", private: false }),
    ]);
  });
});
