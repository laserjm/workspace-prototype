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

/** An issue or a pull request as the search lists it, and as `GET /repos/…/issues/{n}` answers. */
const itemSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  state_reason: z.string().nullish(),
  draft: z.boolean().nullish(),
  pull_request: z.object({ merged_at: z.string().nullable() }).nullish(),
  repository_url: z.string(),
  updated_at: z.string(),
});
type GithubItem = z.infer<typeof itemSchema>;

const searchSchema = z.object({ total_count: z.number(), items: z.array(itemSchema) });

/** "Organisation acme, 4 repositories": whose repositories the token reads, and how many. */
function reachOf(repositories: Repository[]): string {
  const count = `${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`;
  const owners = [...new Map(repositories.map((repo) => [repo.owner.login, repo.owner])).values()];
  if (owners.length === 0) return "No repositories";
  if (owners.length > 1) return `${count} across ${owners.length} accounts`;
  const [owner] = owners as [Repository["owner"]];
  return `${owner.type === "Organization" ? "Organisation " : ""}${owner.login}, ${count}`;
}

/** `482` or `#482`: a typed word that names a number. */
const numberIn = (word: string) => /^#?(\d{1,9})$/.exec(word)?.[1];

/** A typed word GitHub would read as a qualifier or an operator is searched as plain text. */
function searchWord(word: string): string {
  const number = numberIn(word);
  if (number) return number;
  const plain = word.replaceAll('"', "");
  return /[:()]|^-|^(AND|OR|NOT)$/.test(plain) ? `"${plain}"` : plain;
}

/** GitHub refuses a longer search query. */
const QUERY_LIMIT = 256;

/** What one search asks GitHub for, besides the dialog's toggles. */
type SearchTerms = {
  /** `repo:acme/web …`, or `user:acme …`. */
  scope: readonly string[];
  words: readonly string[];
  /** Only what involves the token's user (`involves:@me`). */
  involvesMe?: boolean;
};

/** The query after the scope: the words, the type and whether closed items count. */
function qualifiersOf({ words, involvesMe }: Omit<SearchTerms, "scope">, query: RecordSearchQuery) {
  return [
    ...(involvesMe ? ["involves:@me"] : []),
    ...words,
    ...(words.length ? ["in:title,body"] : []),
    ...(query.type ? [QUALIFIER[query.type as GithubRecordType]] : []),
    ...(query.includeClosed ? [] : ["is:open"]),
  ];
}

/**
 * The repositories as `repo:` qualifiers, or, when that makes `longest` (the longest query to be
 * sent) too long, their owners as `user:`, which may also find an owner's public repositories the
 * token was not given (#43).
 */
function scopeOf(repositories: readonly string[], longest: readonly string[]): string[] {
  const byRepository = repositories.map((name) => `repo:${name}`);
  if ([...byRepository, ...longest].join(" ").length <= QUERY_LIMIT) return byRepository;
  return [...new Set(repositories.map((name) => `user:${name.split("/")[0]}`))];
}

const queryOf = (terms: SearchTerms, query: RecordSearchQuery) =>
  [...terms.scope, ...qualifiersOf(terms, query)].join(" ");

/** One page of one search: GitHub's best matches with words, the most recently updated without. */
function searchPage(
  access: ConnectionAccess,
  terms: SearchTerms,
  query: RecordSearchQuery,
  page: number,
) {
  const params = new URLSearchParams({
    q: queryOf(terms, query),
    ...(terms.words.length ? {} : { sort: "updated", order: "desc" }),
    per_page: String(PAGE_SIZE),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  return getJson(`/search/issues?${params}`, access, searchSchema);
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
function stateOf(item: GithubItem): string {
  if (item.pull_request) {
    if (item.pull_request.merged_at) return "merged";
    if (item.state === "closed") return "closed";
    return item.draft ? "draft" : "open";
  }
  if (item.state === "open") return "open";
  return item.state_reason === "not_planned" ? "not_planned" : "closed";
}

const typeOf = (item: GithubItem): GithubRecordType => (item.pull_request ? "pull-request" : "issue");

function summaryOf(connectionId: string, item: GithubItem): RecordSummary {
  const repository = item.repository_url.split("/").slice(-2).join("/");
  const name = repository.split("/")[1];
  return {
    connectionId,
    type: typeOf(item),
    key: `${repository}#${item.number}`,
    label: `${name}#${item.number}`,
    title: item.title,
    state: stateOf(item),
    updatedAt: item.updated_at,
    where: `${repository} #${item.number}`,
  };
}

/**
 * Issues and pull requests in every repository the token reads (`GET /user/repos`), 20 a page
 * (#43). Without words, what involves the user comes first, then the most recently updated, and
 * later pages continue the second; with words, GitHub's best matches.
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

  const typed = (query.text ?? "").split(/\s+/).filter(Boolean);
  const named = typed.map((word) => repositoriesNamed(repositories.value, word));
  const narrowedTo = [...new Set(named.flat().map((repo) => repo.full_name))];
  const inPlay = narrowedTo.length ? narrowedTo : repositories.value.map((repo) => repo.full_name);
  const words = typed
    .filter((_, index) => named[index].length === 0)
    .map(searchWord)
    .filter(Boolean);
  const suggesting = typed.length === 0 && page === 1;
  // Both searches before typing share one scope, decided on the longer of them.
  const terms: SearchTerms = {
    scope: scopeOf(inPlay, qualifiersOf({ words, involvesMe: suggesting }, query)),
    words,
  };
  // With one repository in play, a typed number is also read directly and put on top: the search
  // has no number qualifier.
  const number = page === 1 && inPlay.length === 1 ? typed.map(numberIn).find(Boolean) : undefined;
  const [found, involving, numbered] = await Promise.all([
    searchPage(access, terms, query, page),
    suggesting ? searchPage(access, { ...terms, involvesMe: true }, query, 1) : undefined,
    number ? getJson(`/repos/${inPlay[0]}/issues/${number}`, access, itemSchema) : undefined,
  ]);
  if (!found.ok) return found;
  if (involving && !involving.ok) return involving;
  // A number nothing has, or cannot be read, is only not on top.
  const exact = numbered?.ok && matchesToggles(numbered.value, query) ? [numbered.value] : [];
  const items = uniqueItems([...exact, ...(involving?.value.items ?? []), ...found.value.items]);
  const foundIds = new Set(found.value.items.map(idOf));
  const total = found.value.total_count + exact.filter((item) => !foundIds.has(idOf(item))).length;
  const hasNext = page * PAGE_SIZE < Math.min(found.value.total_count, SEARCH_LIMIT);
  return ok({
    results: items.map((item) => summaryOf(access.connectionId, item)),
    ...(hasNext ? { next: cursorOf(page + 1) } : {}),
    total,
    reach,
    ...(narrowedTo.length ? { narrowedTo } : {}),
  });
}

/** The repositories a typed word names exactly, in any case: `web` (of any owner) or `acme/web`. */
function repositoriesNamed(repositories: readonly Repository[], word: string) {
  const name = word.toLowerCase();
  return repositories.filter((repo) => {
    const full = repo.full_name.toLowerCase();
    return full === name || full.split("/")[1] === name;
  });
}

/** Whether an item read directly is one the dialog's toggles let through. */
function matchesToggles(item: GithubItem, query: RecordSearchQuery): boolean {
  if (query.type !== undefined && query.type !== typeOf(item)) return false;
  return query.includeClosed === true || item.state === "open";
}

const idOf = (item: GithubItem) => `${item.repository_url}#${item.number}`;

/** Each item once, where it first appears. */
function uniqueItems(items: readonly GithubItem[]): GithubItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
