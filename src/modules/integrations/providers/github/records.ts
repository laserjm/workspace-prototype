// GitHub's repositories as sources, their issues and pull requests as records (ADR 0002, "GitHub
// mapping"). Keys and ids come from the browser, so each is checked before it is put in a path.
import { z } from "zod";
import type {
  RecordComment,
  RecordStatus,
  SourceRecord,
} from "@/modules/sources";
import type { RecordReader, SourceSummary } from "../../contracts";
import { githubJson } from "./api";

/** One page of the explorer and the scope dialog. */
const PAGE_SIZE = 50;
/** At most this many requests to GitHub at once when reading records by id. */
const CONCURRENCY = 10;
const COMMENTS_READ = 100;
const COMMENTS_KEPT = 20;

/** `owner/name`, as GitHub allows them. */
const REPO_KEY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
/** A record's id is its number: "#42". */
const RECORD_ID = /^#([1-9]\d{0,9})$/;

const repoSchema = z.object({
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  html_url: z.string(),
  owner: z.object({ login: z.string() }),
  has_issues: z.boolean(),
});

const login = z.object({ login: z.string() }).nullish();
const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  state_reason: z.string().nullish(),
  html_url: z.string(),
  body: z.string().nullish(),
  user: login,
  assignee: login,
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])),
  milestone: z.object({ title: z.string() }).nullish(),
  comments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  draft: z.boolean().optional(),
  pull_request: z.object({ merged_at: z.string().nullish() }).optional(),
});
type GithubIssue = z.infer<typeof issueSchema>;

const commentSchema = z.object({
  user: login,
  body: z.string().nullish(),
  created_at: z.string(),
});

/** GitHub's state as a status category and its own words (ADR 0002's table). */
function statusOf(issue: GithubIssue): {
  status: RecordStatus;
  statusLabel: string;
} {
  if (issue.pull_request) {
    if (issue.pull_request.merged_at)
      return { status: "Done", statusLabel: "Merged" };
    if (issue.state === "closed") return { status: "Done", statusLabel: "Closed" };
    return issue.draft
      ? { status: "In progress", statusLabel: "Draft" }
      : { status: "In review", statusLabel: "Open" };
  }
  if (issue.state === "closed")
    return {
      status: "Done",
      statusLabel:
        issue.state_reason === "not_planned" ? "Closed as not planned" : "Closed",
    };
  return issue.assignee
    ? { status: "In progress", statusLabel: "Open" }
    : { status: "To do", statusLabel: "Open" };
}

export function toRecord(issue: GithubIssue): SourceRecord {
  const labels = issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
  const fields: Record<string, string> = {};
  if (issue.user) fields.Author = `@${issue.user.login}`;
  if (labels.length) fields.Labels = labels.join(", ");
  if (issue.milestone) fields.Milestone = issue.milestone.title;
  fields.Comments = String(issue.comments);
  fields.Created = issue.created_at;
  return {
    id: `#${issue.number}`,
    title: issue.title,
    type: issue.pull_request ? "Pull request" : "Issue",
    ...statusOf(issue),
    ...(issue.assignee ? { owner: issue.assignee.login } : {}),
    description: issue.body ?? "",
    url: issue.html_url,
    updated: issue.updated_at,
    fields,
  };
}

function toSummary(repo: z.infer<typeof repoSchema>): SourceSummary {
  return {
    key: repo.full_name,
    product: "github",
    name: repo.name,
    description: repo.description || "Issues & pull requests",
    workspace: repo.owner.login,
    location: repo.html_url.replace(/^https:\/\//, ""),
    collection: repo.full_name,
    collectionPath: "ISSUES & PULL REQUESTS",
  };
}

/** Words to search for, without the qualifiers that would reach past the repository. */
function searchWords(text: string) {
  return text
    .replace(/[":()]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !/^(AND|OR|NOT)$/.test(word))
    .join(" ");
}

/** The newest change first, as the explorer lists them. */
const byUpdated = (a: SourceRecord, b: SourceRecord) =>
  b.updated.localeCompare(a.updated) ||
  Number(b.id.slice(1)) - Number(a.id.slice(1));

/** Runs `task` for every item, at most `limit` at once. */
async function inBatches<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += limit)
    results.push(...(await Promise.all(items.slice(start, start + limit).map(task))));
  return results;
}

export const githubRecords: RecordReader = {
  async listSources(access) {
    const page = await githubJson(
      "/user/repos?per_page=100&sort=pushed",
      access,
      z.array(repoSchema),
    );
    return (page?.data ?? []).filter((repo) => repo.has_issues).map(toSummary);
  },

  async searchRecords(access, sourceKey, { text, cursor }) {
    if (!REPO_KEY.test(sourceKey)) return undefined;
    const page = /^[1-9]\d{0,3}$/.test(cursor ?? "") ? Number(cursor) : 1;
    const words = searchWords(text ?? "");
    const found = words
      ? await githubJson(
          `/search/issues?advanced_search=true&sort=updated&per_page=${PAGE_SIZE}&page=${page}&q=${encodeURIComponent(
            `repo:${sourceKey} (is:issue OR is:pr) ${words}`,
          )}`,
          access,
          z.object({ items: z.array(issueSchema) }),
        ).then((result) => result && { ...result, data: result.data.items })
      : await githubJson(
          `/repos/${sourceKey}/issues?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
          access,
          z.array(issueSchema),
        );
    if (!found) return undefined;
    return {
      records: found.data.map(toRecord),
      ...(found.hasNext ? { nextCursor: String(page + 1) } : {}),
    };
  },

  async getRecords(access, sourceKey, ids) {
    if (!REPO_KEY.test(sourceKey)) return [];
    const numbers = [
      ...new Set(ids.flatMap((id) => RECORD_ID.exec(id)?.[1] ?? [])),
    ];
    const issues = await inBatches(numbers, CONCURRENCY, (number) =>
      githubJson(`/repos/${sourceKey}/issues/${number}`, access, issueSchema),
    );
    return issues
      .flatMap((issue) => (issue ? [toRecord(issue.data)] : []))
      .sort(byUpdated);
  },

  async getComments(access, sourceKey, id): Promise<RecordComment[]> {
    const number = RECORD_ID.exec(id)?.[1];
    if (!REPO_KEY.test(sourceKey) || !number) return [];
    const comments = await githubJson(
      `/repos/${sourceKey}/issues/${number}/comments?per_page=${COMMENTS_READ}`,
      access,
      z.array(commentSchema),
    );
    return (comments?.data ?? []).slice(-COMMENTS_KEPT).map((comment) => ({
      author: comment.user ? `@${comment.user.login}` : "ghost",
      body: comment.body ?? "",
      created: comment.created_at,
    }));
  },
};
