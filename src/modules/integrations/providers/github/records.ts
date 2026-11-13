// GitHub's issues and pull requests as records (ADR 0003 §3): their declared types and states, and
// the search the attach dialog runs. Every answer is parsed before it is used, and every failure
// comes back as a `RecordError`, never thrown.
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import type {
  ConnectionAccess,
  ProviderRecords,
  RecordDetail,
  RecordError,
  RecordSearchPage,
  RecordSearchQuery,
  RecordSummary,
  RecordTypeDeclaration,
} from "../../contracts";
import { classifyGithubAnswer, githubGet } from "./api";

const PAGE_SIZE = 20;
/** GitHub's search answers at most the first 1,000 results of a query. */
const SEARCH_LIMIT = 1000;

/** The declared types; `githubRecordTypes` adds a reader to each. */
const declaredTypes = {
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
} as const satisfies Record<string, RecordTypeDeclaration>;

type GithubRecordType = keyof typeof declaredTypes;

const RECORD_TYPES = Object.keys(declaredTypes) as GithubRecordType[];

const isRecordType = (type: string): type is GithubRecordType =>
  Object.hasOwn(declaredTypes, type);

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

/** One page of one type's search: GitHub's best matches with words, the most recently updated without. */
async function searchPage(
  access: ConnectionAccess,
  terms: SearchTerms,
  query: RecordSearchQuery,
  type: GithubRecordType,
  page: number,
): Promise<Result<TypePage, RecordError>> {
  const params = new URLSearchParams({
    q: queryOf(terms, { ...query, type }),
    ...(terms.words.length ? {} : { sort: "updated", order: "desc" }),
    per_page: String(PAGE_SIZE),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  const found = await getJson(`/search/issues?${params}`, access, searchSchema);
  return found.ok ? ok({ type, total: found.value.total_count, items: found.value.items }) : found;
}

/** One page of one type's search. */
type TypePage = { type: GithubRecordType; total: number; items: GithubItem[] };

/**
 * One page of the search for each of `types`, in parallel. GitHub refuses a fine-grained token's
 * search for issues and pull requests at once ("Query must include 'is:issue' or
 * 'is:pull-request'", #58), so "All" is one search per type.
 */
async function searchTypes(
  access: ConnectionAccess,
  terms: SearchTerms,
  query: RecordSearchQuery,
  types: readonly GithubRecordType[],
  page: number,
): Promise<Result<TypePage[], RecordError>> {
  const pages = await Promise.all(
    types.map((type) => searchPage(access, terms, query, type, page)),
  );
  const found: TypePage[] = [];
  for (const typePage of pages) {
    if (!typePage.ok) return typePage;
    found.push(typePage.value);
  }
  return ok(found);
}

/**
 * The types' items as one list: by when they changed when the searches are sorted so, otherwise
 * taking each search's next best match in turn.
 */
function mergedItems(pages: readonly TypePage[], byUpdated: boolean): GithubItem[] {
  if (byUpdated)
    return pages
      .flatMap((typePage) => typePage.items)
      .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at));
  const longest = Math.max(0, ...pages.map((typePage) => typePage.items.length));
  return Array.from({ length: longest }, (_, rank) =>
    pages.flatMap((typePage) => typePage.items[rank] ?? []),
  ).flat();
}

const cursorSchema = z.object({
  page: z.number().int().min(2),
  /** The types whose searches have this page. */
  types: z.array(z.enum(RECORD_TYPES)).min(1),
});
type Cursor = z.infer<typeof cursorSchema>;

/** GitHub's page number and the types it is for, encoded so nobody else reads anything into it. */
const cursorOf = (cursor: Cursor) => btoa(JSON.stringify(cursor));

/** Where a search goes on: page 1 of every type asked for, or what the cursor names of them. */
function cursorFrom(encoded: string | undefined, asked: readonly GithubRecordType[]) {
  if (encoded === undefined) return { page: 1, types: asked };
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(atob(encoded)));
    if (!parsed.success) return undefined;
    const types = parsed.data.types.filter((type) => asked.includes(type));
    return types.length ? { page: parsed.data.page, types } : undefined;
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
    title: visibleText(item.title),
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
  const cursor = cursorFrom(query.cursor, query.type ? [query.type] : RECORD_TYPES);
  if (cursor === undefined)
    return err({ kind: "invalid_query", message: "That page of results is no longer available." });
  const { page, types } = cursor;

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
  // Every search shares one scope, decided on the longest of them.
  const terms: SearchTerms = {
    scope: scopeOf(
      inPlay,
      qualifiersOf({ words, involvesMe: suggesting }, { ...query, type: query.type ?? "issue" }),
    ),
    words,
  };
  // With one repository in play, a typed number is also read directly and put on top: the search
  // has no number qualifier.
  const number = page === 1 && inPlay.length === 1 ? typed.map(numberIn).find(Boolean) : undefined;
  const [found, involving, numbered] = await Promise.all([
    searchTypes(access, terms, query, types, page),
    suggesting ? searchTypes(access, { ...terms, involvesMe: true }, query, types, 1) : undefined,
    number ? getJson(`/repos/${inPlay[0]}/issues/${number}`, access, itemSchema) : undefined,
  ]);
  if (!found.ok) return found;
  if (involving && !involving.ok) return involving;
  const byUpdated = words.length === 0;
  const foundItems = mergedItems(found.value, byUpdated);
  // A number nothing has, or cannot be read, is only not on top.
  const exact = numbered?.ok && matchesToggles(numbered.value, query) ? [numbered.value] : [];
  const items = uniqueItems([
    ...exact,
    ...(involving ? mergedItems(involving.value, byUpdated) : []),
    ...foundItems,
  ]);
  const foundIds = new Set(foundItems.map(idOf));
  const total =
    found.value.reduce((sum, typePage) => sum + typePage.total, 0) +
    exact.filter((item) => !foundIds.has(idOf(item))).length;
  const nextTypes = found.value
    .filter((typePage) => page * PAGE_SIZE < Math.min(typePage.total, SEARCH_LIMIT))
    .map((typePage) => typePage.type);
  return ok({
    results: items.map((item) => summaryOf(access.connectionId, item)),
    ...(nextTypes.length ? { next: cursorOf({ page: page + 1, types: nextTypes }) } : {}),
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

// --- Reading one record (ADR 0003 §3): what its record view shows. ---

/** How many comments a view shows: GitHub's largest page. */
const COMMENT_LIMIT = 100;

/**
 * Characters that draw nothing or reorder what follows: zero-width spaces and marks, the Arabic
 * letter mark and the other bidirectional marks, embeddings, overrides and isolates, the word
 * joiner and invisible operators, the byte order mark, the soft hyphen, the combining grapheme
 * joiner, the Hangul fillers and the tag characters. Untrusted text could hide words or
 * show them in another order with them. The zero-width joiner stays, because emoji are built
 * with it.
 */
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\uFFA0]|[\u{E0000}-\u{E007F}]/gu;

/** `text` without invisible and bidirectional characters. */
export const visibleText = (text: string) => text.replace(INVISIBLE, "");

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

/** `acme/web#482`: the repository and the number. */
function parseKey(key: string) {
  const match = /^([\w.-]+\/[\w.-]+)#(\d{1,9})$/.exec(key);
  return match ? { repository: match[1]!, number: Number(match[2]) } : undefined;
}

const userSchema = z.object({ login: z.string() }).nullable();
const login = (user: z.infer<typeof userSchema>) => user?.login ?? "ghost";

/** The parts of `GET /repos/{o}/{r}/issues/{n}` (and of `/pulls/{n}`) a view shows. */
const issueSchema = itemSchema.extend({
  user: userSchema,
  labels: z.array(
    z.union([
      z.string().transform((name) => ({ name, color: undefined })),
      z.object({ name: z.string(), color: z.string().nullish() }),
    ]),
  ),
  assignees: z.array(z.object({ login: z.string() })).nullish(),
  body: z.string().nullish(),
  comments: z.number(),
  created_at: z.string(),
});
type GithubIssue = z.infer<typeof issueSchema>;

const commentsSchema = z.array(
  z.object({ id: z.number(), user: userSchema, created_at: z.string(), body: z.string().nullish() }),
);

/** What a view shows of an issue (or a pull request's conversation) and its first comments. */
function detailOf(issue: GithubIssue, comments: z.infer<typeof commentsSchema>): GithubIssueDetail {
  return {
    number: issue.number,
    author: login(issue.user),
    createdAt: issue.created_at,
    labels: issue.labels.map(({ name, color }) => ({
      name: visibleText(name),
      ...(color ? { color } : {}),
    })),
    assignees: (issue.assignees ?? []).map((assignee) => assignee.login),
    body: visibleText(issue.body ?? ""),
    commentCount: issue.comments,
    comments: comments.map((comment) => ({
      id: comment.id,
      author: login(comment.user),
      createdAt: comment.created_at,
      body: visibleText(comment.body ?? ""),
    })),
  };
}

/** The pull request fields `/issues/{n}` leaves out, which its state needs. */
const pullSchema = z.object({
  draft: z.boolean().nullish(),
  merged_at: z.string().nullable(),
});

/**
 * Reads an issue, or a pull request's description and conversation, with its first 100 comments,
 * in parallel. A key of the other type is `not_found`, as GitHub answers a missing number.
 */
function readerOf(type: GithubRecordType) {
  return async (access: ConnectionAccess, key: string): Promise<Result<RecordDetail, RecordError>> => {
    const parsed = parseKey(key);
    if (!parsed) return err({ kind: "not_found" });
    const base = `/repos/${parsed.repository}`;
    const [issue, comments, pull] = await Promise.all([
      getJson(`${base}/issues/${parsed.number}`, access, issueSchema),
      getJson(`${base}/issues/${parsed.number}/comments?per_page=${COMMENT_LIMIT}`, access, commentsSchema),
      type === "pull-request"
        ? getJson(`${base}/pulls/${parsed.number}`, access, pullSchema)
        : undefined,
    ]);
    if (!issue.ok) return issue;
    if (typeOf(issue.value) !== type) return err({ kind: "not_found" });
    if (!comments.ok) return comments;
    if (pull && !pull.ok) return pull;
    // `/issues/{n}` says whether a pull request was merged, but not whether it is a draft.
    const item: GithubItem = pull
      ? {
          ...issue.value,
          draft: pull.value.draft,
          pull_request: { merged_at: pull.value.merged_at },
        }
      : issue.value;
    return ok({
      summary: summaryOf(access.connectionId, item),
      detail: detailOf(issue.value, comments.value),
    });
  };
}

/** The declared types, each with its reader. */
export const githubRecordTypes = {
  issue: { ...declaredTypes.issue, read: readerOf("issue") },
  "pull-request": { ...declaredTypes["pull-request"], read: readerOf("pull-request") },
} satisfies ProviderRecords["types"];

/**
 * The record's page on GitHub: the API's address without `api.` or `/api/v3` (GitHub Enterprise),
 * then the repository and the number.
 */
export function githubRecordUrl(baseUrl: string, type: string, key: string): string | undefined {
  const parsed = parseKey(key);
  if (!parsed || !isRecordType(type)) return undefined;
  const site = new URL(baseUrl);
  if (site.hostname.startsWith("api.")) site.hostname = site.hostname.slice("api.".length);
  const root = site.origin + site.pathname.replace(/\/api\/v3\/?$/, "").replace(/\/$/, "");
  const page = type === "issue" ? "issues" : "pull";
  return `${root}/${parsed.repository}/${page}/${parsed.number}`;
}
