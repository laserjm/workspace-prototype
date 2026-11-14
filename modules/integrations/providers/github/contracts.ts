/* eslint-disable local/require-server-only -- browser-safe like the module's contracts.ts: a provider's browser door (docs/adr/0011) */
// What GitHub's record views and its tool's chat part read: the detail each view parses and the
// schemas of `github_pull_request_diff`. Browser-safe: zod, types and the module's own
// contracts.ts, nothing else (test/boundaries.test.ts). The server's readers in this folder
// build these shapes; the views in app/(workspace)/_components/providers/github/ draw them.
import { z } from "zod";
import { recordReadRefusalSchema, recordSummarySchema } from "../../contracts";

/** An issue's or pull request's text and comments, as its view shows them. Markdown bodies. */
export const githubIssueDetailSchema = z.object({
  number: z.number(),
  author: z.string(),
  /** ISO 8601. */
  createdAt: z.string(),
  labels: z.array(z.object({ name: z.string(), color: z.string().optional() })),
  assignees: z.array(z.string()),
  body: z.string(),
  /** All of them; `comments` holds the first 100. */
  commentCount: z.number(),
  comments: z.array(
    z.object({ id: z.number(), author: z.string(), createdAt: z.string(), body: z.string() }),
  ),
});
export type GithubIssueDetail = z.infer<typeof githubIssueDetailSchema>;

/**
 * A pull request laid out for review (#61): its description and conversation as an issue's, its
 * reviews with their inline comments, the merge state and the changed files without their patches.
 */
export const githubPullRequestDetailSchema = githubIssueDetailSchema.extend({
  merge: z.object({
    mergeableState: z
      .string()
      .describe(
        "GitHub's mergeable_state: clean (can merge), unstable (can merge, but a check is failing), has_hooks (can merge, with hooks), behind (the base branch moved on), blocked (a required review or check is missing), dirty (a merge conflict), draft, or unknown (GitHub is still working it out, and after a merge).",
      ),
    draft: z
      .boolean()
      .describe("Not ready for review: GitHub may still call it clean, but it cannot be merged."),
    merged: z.boolean(),
    closed: z
      .boolean()
      .describe("Closed, merged or not: the mergeable state no longer applies."),
    /** ISO 8601, when merged. */
    mergedAt: z.string().optional(),
    mergedBy: z.string().optional(),
    /** The branch it merges into, and the branch it merges. */
    base: z.string(),
    head: z.string(),
    commits: z.number(),
    additions: z.number(),
    deletions: z.number(),
  }),
  /** The first 100 reviews, each with its inline comments among the first 100 of those. */
  reviews: z.array(
    z.object({
      id: z.number(),
      author: z.string(),
      state: z
        .string()
        .describe("APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED or PENDING (not submitted yet)."),
      /** ISO 8601; a pending review has none. */
      submittedAt: z.string().optional(),
      body: z.string(),
      comments: z.array(
        z.object({
          id: z.number(),
          author: z.string(),
          createdAt: z.string(),
          path: z.string(),
          line: z.number().optional(),
          body: z.string(),
        }),
      ),
    }),
  ),
  /** All inline review comments, shown or not. */
  reviewCommentCount: z.number(),
  /** All changed files; `files` holds the first 100. */
  fileCount: z.number(),
  files: z.array(
    z.object({
      path: z.string(),
      /** Where a renamed file was. */
      previousPath: z.string().optional(),
      status: z
        .string()
        .describe("added, removed, modified, renamed, copied, changed or unchanged."),
      additions: z.number(),
      deletions: z.number(),
    }),
  ),
  /**
   * CI for the head commit: its GitHub Actions runs and its combined commit status. Check runs
   * from other apps are not read, because a fine-grained token cannot read them (#43). Each part
   * is `readable: false` when the token lacks its permission, and the rest of the view still loads.
   */
  ci: z.object({
    headSha: z.string(),
    actions: z.discriminatedUnion("readable", [
      z.object({ readable: z.literal(false) }),
      z.object({
        readable: z.literal(true),
        /** All runs for the head commit; `runs` holds the first page. */
        total: z.number(),
        runs: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            title: z.string(),
            event: z.string().describe("What started the run: push, pull_request, …"),
            status: z.string().describe("queued, in_progress, completed, …"),
            conclusion: z
              .string()
              .optional()
              .describe("Once completed: success, failure, cancelled, skipped, …"),
            /** Its page on GitHub, built from the connection's base URL. */
            url: z.string(),
          }),
        ),
      }),
    ]),
    statuses: z.discriminatedUnion("readable", [
      z.object({ readable: z.literal(false) }),
      z.object({
        readable: z.literal(true),
        state: z
          .string()
          .describe("The combined state of the commit statuses: success, pending, failure or error."),
        statuses: z.array(
          z.object({
            id: z.number(),
            context: z.string(),
            state: z.string(),
            description: z.string().optional(),
          }),
        ),
      }),
    ]),
  }),
});
export type GithubPullRequestDetail = z.infer<typeof githubPullRequestDetailSchema>;

/** What the model may ask `github_pull_request_diff` for. */
export const githubPullRequestDiffInput = z.object({
  connectionId: z
    .string()
    .min(1)
    .max(100)
    .describe("The pull request's connection: the connectionId of a GitHub connection you may use."),
  key: z
    .string()
    .min(1)
    .max(200)
    .describe("The pull request's key, as an attached item or a search result names it, e.g. acme/web#42."),
  path: z
    .string()
    .min(1)
    .max(1000)
    .optional()
    .describe("Only this changed file's diff, by its path as a file list names it. Every file when left out."),
});
export type GithubPullRequestDiffInput = z.infer<typeof githubPullRequestDiffInput>;

export const githubDiffFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().optional().describe("Where a renamed file was."),
  status: z.string().describe("added, removed, modified, renamed, copied, changed or unchanged."),
  additions: z.number(),
  deletions: z.number(),
  patch: z
    .string()
    .optional()
    .describe("The file's change as a unified diff; a long one ends with what was cut."),
  note: z.string().optional().describe("Why the file has no patch."),
});

/** The pull request's changed files with their diffs, or why they cannot be read. */
export const githubPullRequestDiffOutput = z.union([
  z.object({
    summary: recordSummarySchema.extend({
      url: z.string().describe("The pull request's page on GitHub."),
    }),
    fileCount: z.number().describe("How many files the pull request changes in all."),
    files: z.array(githubDiffFileSchema),
    note: z.string().optional().describe("What this answer left out, and how to read it."),
  }),
  z.object({ error: recordReadRefusalSchema }),
]);
export type GithubPullRequestDiffOutput = z.infer<typeof githubPullRequestDiffOutput>;
