// A pull request's code change for the agent (`github_pull_request_diff`, #65): its changed files
// with their patches, cut to the model's limits. Its schemas are browser-safe, so the chat can type
// the tool's parts; `tools.ts` runs it on the server.
import "server-only";
import { z } from "zod";
import {
  type RecordReadRefusal,
  type RecordSummary,
  githubDiffFileSchema,
  type GithubPullRequestDiffOutput,
} from "../../contracts";
import {
  cutText,
  MODEL_LIMITS,
  type ConnectionAccess,
  err,
  ok,
  type Answer,
} from "../../provider";
import {
  codePointsShown,
  getJson,
  githubRecordUrl,
  parseKey,
  pullSchema,
  pullSummary,
  visibleText,
} from "./records";

/** How many changed files are read: GitHub's largest page. */
const FILES_READ = 100;

/** Where what a cut left out is: the model is told, and can tell the user. */
const REST_ON_GITHUB = "the rest is on GitHub";
/** "40,000": the answer's limit, as its notes name it. */
const TOTAL_LABEL = MODEL_LIMITS.diffCharacters.toLocaleString("en-US");

type GithubPullRequestDiff = Exclude<GithubPullRequestDiffOutput, { error: unknown }>;
type DiffFile = z.infer<typeof githubDiffFileSchema>;

/** The changed files with their patches (`patch` is missing for a binary or very large file). */
const patchedFilesSchema = z.array(
  z.object({
    filename: z.string(),
    previous_filename: z.string().nullish(),
    status: z.string(),
    additions: z.number(),
    deletions: z.number(),
    patch: z.string().nullish(),
  }),
);

/** `1 file`, `3 files`. */
const countedFiles = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/**
 * A changed file as read, and its whole patch. Invisible characters are dropped from its paths and
 * shown as code points in its patch, where they may be the change.
 */
const fileOf = (file: z.infer<typeof patchedFilesSchema>[number]) => ({
  listed: {
    path: visibleText(file.filename),
    ...(file.previous_filename ? { previousPath: visibleText(file.previous_filename) } : {}),
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  },
  patch: file.patch ? codePointsShown(file.patch) : undefined,
});

/**
 * The changed files as the model reads them, only the one at `path` when asked: each patch cut to
 * its first characters, and once the patches kept reach the answer's limit (counted in the diffs'
 * characters, the cut notes aside), the file that would pass it and every later one listed without
 * theirs. The note says what was left out.
 */
function cutDiffs(
  read: z.infer<typeof patchedFilesSchema>,
  fileCount: number,
  path: string | undefined,
): Pick<GithubPullRequestDiff, "files" | "note"> {
  const asked = read.map(fileOf).filter((file) => path === undefined || file.listed.path === path);
  let budget: number = MODEL_LIMITS.diffCharacters;
  let leftOut = 0;
  const shown = asked.map(({ listed, patch }): DiffFile => {
    if (!patch) return { ...listed, note: "GitHub shows no diff for it: binary, or too large." };
    const kept = Math.min(patch.length, MODEL_LIMITS.diffFileCharacters);
    if (leftOut > 0 || kept > budget) {
      leftOut += 1;
      return { ...listed, note: `Diff left out: past the ${TOTAL_LABEL} characters of this answer.` };
    }
    budget -= kept;
    return { ...listed, patch: cutText(patch, MODEL_LIMITS.diffFileCharacters, REST_ON_GITHUB) };
  });
  // A file asked for by its path and found needs nothing more.
  const unread = path !== undefined && shown.length > 0 ? 0 : fileCount - read.length;
  const notes = [
    ...(path !== undefined && shown.length === 0
      ? [`No changed file is at ${path} among the ${read.length} read.`]
      : []),
    ...(leftOut > 0
      ? [
          `${countedFiles(leftOut)} ${leftOut === 1 ? "is" : "are"} listed without their diff, past the ${TOTAL_LABEL} characters of this answer: ask for one by its path.`,
        ]
      : []),
    ...(unread > 0
      ? [`${unread} more changed ${unread === 1 ? "file was" : "files were"} not read: ${REST_ON_GITHUB}.`]
      : []),
  ];
  return notes.length ? { files: shown, note: notes.join(" ") } : { files: shown };
}

/**
 * Reads a pull request and its first 100 changed files with their patches, in parallel, cut for
 * the model (`cutDiffs`), only the file at `path` when asked. An issue's number is `not_found`, as
 * `/pulls/{n}` answers it. A refusal carries the pull request's page.
 */
export async function readGithubPullRequestDiff(
  access: ConnectionAccess,
  key: string,
  path?: string,
): Promise<Answer<GithubPullRequestDiff, RecordReadRefusal>> {
  const parsed = parseKey(key);
  const url = githubRecordUrl(access.baseUrl, "pull-request", key);
  if (!parsed || !url) return err({ kind: "not_found" });
  const pullPath = `/repos/${parsed.repository}/pulls/${parsed.number}`;
  const [pull, changed] = await Promise.all([
    getJson(pullPath, access, pullSchema),
    getJson(`${pullPath}/files?per_page=${FILES_READ}`, access, patchedFilesSchema),
  ]);
  if (!pull.ok) return err({ ...pull.error, url });
  if (!changed.ok) return err({ ...changed.error, url });
  const summary: RecordSummary = pullSummary(access.connectionId, parsed.repository, pull.value);
  return ok({
    summary: { ...summary, url },
    fileCount: pull.value.changed_files,
    ...cutDiffs(changed.value, pull.value.changed_files, path),
  });
}
