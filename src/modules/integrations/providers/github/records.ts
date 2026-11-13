// GitHub's issues and pull requests as records (ADR 0003 §3): their declared types and states, and
// the search the attach dialog runs. Every answer is parsed before it is used, and every failure
// comes back as a `RecordError`, never thrown.
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import type {
  ConnectionAccess,
  ProviderRecords,
  RecordError,
  RecordSearchPage,
  RecordSearchQuery,
  RecordSummary,
} from "../../contracts";
import { classifyGithubAnswer, githubGet } from "./api";

const PAGE_SIZE = 20;
/** GitHub's search answers at most the first 1,000 results of a query. */
const SEARCH_LIMIT = 1000;

export const githubRecordTypes = {
  issue: {
    singular: "issue",
    plural: "issues",
    states: {
      open: { label: "Open", tone: "open" },
      closed: { label: "Closed", tone: "done" },
      not_planned: { label: "Not planned", tone: "neutral" },
    },
  },
  "pull-request": {
    singular: "pull request",
    plural: "pull requests",
    states: {
      open: { label: "Open", tone: "open" },
      draft: { label: "Draft", tone: "draft" },
      merged: { label: "Merged", tone: "done" },
      closed: { label: "Closed", tone: "closed" },
    },
  },
} as const satisfies ProviderRecords["types"];

type GithubRecordType = keyof typeof githubRecordTypes;

const isRecordType = (type: string): type is GithubRecordType =>
  Object.hasOwn(githubRecordTypes, type);

const QUALIFIER: Record<GithubRecordType, string> = {
  issue: "is:issue",
  "pull-request": "is:pr",
};

/** Asks GitHub and parses the answer with `schema`. */
async function getJson<T>(
  path: string,
  access: ConnectionAccess,
  schema: z.ZodType<T>,
): Promise<Result<T, RecordError>> {
  let response: Response;
  try {
    response = await githubGet(path, access);
  } catch {
    return err({ kind: "unreachable" });
  }
  if (!response.ok) return err(await classifyGithubAnswer(response));
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? ok(parsed.data) : err({ kind: "unreachable" });
}

const repositoriesSchema = z.array(
  z.object({
    full_name: z.string(),
    owner: z.object({ login: z.string(), type: z.string() }),
  }),
);
type Repository = z.infer<typeof repositoriesSchema>[number];

const searchSchema = z.object({
  total_count: z.number(),
  items: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      state: z.enum(["open", "closed"]),
      state_reason: z.string().nullish(),
      draft: z.boolean().optional(),
      pull_request: z.object({ merged_at: z.string().nullable() }).optional(),
      repository_url: z.string(),
      updated_at: z.string(),
    }),
  ),
});
type SearchItem = z.infer<typeof searchSchema>["items"][number];

/** "Organisation acme, 4 repositories": whose repositories the token reads, and how many. */
function reachOf(repositories: Repository[]): string {
  const count = `${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`;
  const owners = [...new Map(repositories.map((repo) => [repo.owner.login, repo.owner])).values()];
  if (owners.length === 0) return "No repositories";
  if (owners.length > 1) return `${count} across ${owners.length} accounts`;
  const [owner] = owners as [Repository["owner"]];
  return `${owner.type === "Organization" ? "Organisation " : ""}${owner.login}, ${count}`;
}

/** A typed word GitHub would read as a qualifier or an operator is searched as plain text. */
function searchWord(word: string): string {
  const plain = word.replaceAll('"', "");
  return /[:()]|^-|^(AND|OR|NOT)$/.test(plain) ? `"${plain}"` : plain;
}

/** The search query: the token's repositories, the words, the type and whether closed items count. */
function queryOf(repositories: Repository[], query: RecordSearchQuery): string {
  const words = (query.text ?? "").split(/\s+/).filter(Boolean).map(searchWord).filter(Boolean);
  return [
    ...repositories.map((repo) => `repo:${repo.full_name}`),
    ...words,
    ...(words.length ? ["in:title,body"] : []),
    ...(query.type ? [QUALIFIER[query.type as GithubRecordType]] : []),
    ...(query.includeClosed ? [] : ["is:open"]),
  ].join(" ");
}

const cursorSchema = z.object({ page: z.number().int().min(2) });

/** GitHub's page number, encoded so nobody else reads anything into it. */
const cursorOf = (page: number) => btoa(JSON.stringify({ page }));

function pageOf(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return 1;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(atob(cursor)));
    return parsed.success ? parsed.data.page : undefined;
  } catch {
    return undefined;
  }
}

/** The state GitHub's search item is in, as declared above. */
function stateOf(item: SearchItem): string {
  if (item.pull_request) {
    if (item.pull_request.merged_at) return "merged";
    if (item.state === "closed") return "closed";
    return item.draft ? "draft" : "open";
  }
  if (item.state === "open") return "open";
  return item.state_reason === "not_planned" ? "not_planned" : "closed";
}

function summaryOf(connectionId: string, item: SearchItem): RecordSummary {
  const repository = item.repository_url.split("/").slice(-2).join("/");
  const name = repository.split("/")[1];
  return {
    connectionId,
    type: item.pull_request ? "pull-request" : "issue",
    key: `${repository}#${item.number}`,
    label: `${name}#${item.number}`,
    title: item.title,
    state: stateOf(item),
    updatedAt: item.updated_at,
    where: `${repository} #${item.number}`,
  };
}

/**
 * Issues and pull requests in every repository the token reads (`GET /user/repos`), 20 a page.
 * Without words, the most recently updated come first; with words, GitHub's best matches.
 */
export async function searchGithubRecords(
  access: ConnectionAccess,
  query: RecordSearchQuery,
): Promise<Result<RecordSearchPage, RecordError>> {
  if (query.type !== undefined && !isRecordType(query.type))
    return err({ kind: "invalid_query", message: `GitHub has no record type '${query.type}'.` });
  const page = pageOf(query.cursor);
  if (page === undefined)
    return err({ kind: "invalid_query", message: "That page of results is no longer available." });

  const repositories = await getJson("/user/repos?per_page=100", access, repositoriesSchema);
  if (!repositories.ok) return repositories;
  const reach = reachOf(repositories.value);
  if (repositories.value.length === 0) return ok({ results: [], total: 0, reach });

  const params = new URLSearchParams({
    q: queryOf(repositories.value, query),
    ...(query.text?.trim() ? {} : { sort: "updated", order: "desc" }),
    per_page: String(PAGE_SIZE),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  const found = await getJson(`/search/issues?${params}`, access, searchSchema);
  if (!found.ok) return found;
  const { total_count: total, items } = found.value;
  const hasNext = page * PAGE_SIZE < Math.min(total, SEARCH_LIMIT);
  return ok({
    results: items.map((item) => summaryOf(access.connectionId, item)),
    ...(hasNext ? { next: cursorOf(page + 1) } : {}),
    total,
    reach,
  });
}
