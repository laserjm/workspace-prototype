// GitHub's issues and pull requests as records (ADR 0003 §3): their declared types and states, and
// the search the attach dialog runs. Every answer is parsed before it is used, and every failure
// comes back as a `RecordError`, never thrown.
import "server-only";
import { z } from "zod";
import {
  type RecordError,
  type RecordSearchPage,
  type RecordSearchQuery,
  type RecordSummary,
  type RecordTypeDeclaration,
  type GithubIssueDetail,
  type GithubPullRequestDetail,
} from "../../contracts";
import {
  cutNote,
  cutText,
  MODEL_LIMITS,
  newestEntries,
  recordType,
  type ConnectionAccess,
  type ProviderRecords,
  err,
  ok,
  type Answer,
} from "../../provider";
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

const isRecordType = (type: string): type is GithubRecordType =>
  Object.hasOwn(declaredTypes, type);

const RECORD_TYPES = Object.keys(declaredTypes).filter(isRecordType);

const QUALIFIER: Record<GithubRecordType, string> = {
  issue: "is:issue",
  "pull-request": "is:pr",
};

/** Asks GitHub and parses the answer with `schema`. */
export async function getJson<T>(
  path: string,
  access: ConnectionAccess,
  schema: z.ZodType<T>,
): Promise<Answer<T, RecordError>> {
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
/** An item without where it lives: what a summary needs, wherever the item was read. */
type ItemWithoutRepository = Omit<GithubItem, "repository_url">;

const searchSchema = z.object({ total_count: z.number(), items: z.array(itemSchema) });

/** "Organisation acme, 4 repositories": whose repositories the token reads, and how many. */
function reachOf(repositories: Repository[]): string {
  const count = `${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`;
  const owners = [...new Map(repositories.map((repo) => [repo.owner.login, repo.owner])).values()];
  const [owner] = owners;
  if (!owner) return "No repositories";
  if (owners.length > 1) return `${count} across ${owners.length} accounts`;
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
  /** The words, and the qualifiers that pass through, in the order given. */
  words: readonly string[];
  /** Match the words in titles and descriptions only (`in:title,body`), as the dialog does. */
  inTitleBody?: boolean;
  /** Only what involves the token's user (`involves:@me`). */
  involvesMe?: boolean;
};

/** The query after the scope: the words, the type and whether closed items count. */
function qualifiersOf(
  { words, inTitleBody, involvesMe }: Omit<SearchTerms, "scope">,
  query: RecordSearchQuery,
) {
  return [
    ...(involvesMe ? ["involves:@me"] : []),
    ...words,
    ...(inTitleBody ? ["in:title,body"] : []),
    ...(query.type && isRecordType(query.type) ? [QUALIFIER[query.type]] : []),
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
): Promise<Answer<TypePage, RecordError>> {
  const params = new URLSearchParams({
    q: queryOf(terms, { ...query, type }),
    ...(byRelevance(terms) ? {} : { sort: "updated", order: "desc" }),
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
): Promise<Answer<TypePage[], RecordError>> {
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
function stateOf(item: ItemWithoutRepository): string {
  if (item.pull_request) {
    if (item.pull_request.merged_at) return "merged";
    if (item.state === "closed") return "closed";
    return item.draft ? "draft" : "open";
  }
  if (item.state === "open") return "open";
  return item.state_reason === "not_planned" ? "not_planned" : "closed";
}

const typeOf = (item: ItemWithoutRepository): GithubRecordType => (item.pull_request ? "pull-request" : "issue");

/** `acme/web`: the repository an item lives in. */
const repositoryOf = (item: GithubItem) => item.repository_url.split("/").slice(-2).join("/");

const summaryOf = (connectionId: string, item: GithubItem): RecordSummary =>
  summaryInRepository(connectionId, repositoryOf(item), item);

/** The summary of an item of `repository` (`acme/web`). */
function summaryInRepository(connectionId: string, repository: string, item: ItemWithoutRepository): RecordSummary {
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
): Promise<Answer<RecordSearchPage, RecordError>> {
  const typeAsked = query.type;
  if (typeAsked !== undefined && !isRecordType(typeAsked))
    return err({ kind: "invalid_query", message: `GitHub has no record type '${typeAsked}'.` });

  const repositories = await getJson("/user/repos?per_page=100", access, repositoriesSchema);
  if (!repositories.ok) return repositories;
  const reach = reachOf(repositories.value);
  if (repositories.value.length === 0) return ok({ results: [], total: 0, reach });

  const reading = readText(query.text ?? "", query.qualifiers === true, repositories.value);
  if (typeAsked !== undefined && reading.type !== undefined && reading.type !== typeAsked)
    return err({
      kind: "invalid_query",
      message: `The query asks for ${reading.type}, but the type asked for is ${typeAsked}.`,
    });
  const type = typeAsked ?? reading.type;
  // A state the query names wins over leaving closed items out.
  const asked: RecordSearchQuery = {
    ...query,
    type,
    includeClosed: query.includeClosed === true || reading.namesState,
  };
  const cursor = cursorFrom(query.cursor, type ? [type] : RECORD_TYPES);
  if (cursor === undefined)
    return err({ kind: "invalid_query", message: "That page of results is no longer available." });
  const { page, types } = cursor;

  const narrowedTo = reading.narrowedTo;
  const inPlay = (narrowedTo.length ? narrowedTo : repositories.value.map((repo) => repo.full_name)).filter(
    (name) => !reading.excluded.includes(name),
  );
  if (inPlay.length === 0) return ok({ results: [], total: 0, reach, narrowedTo });
  const { words } = reading;
  const suggesting = reading.empty && page === 1;
  // Every search shares one scope, decided on the longest of them.
  const shared = { words, inTitleBody: reading.plainWords > 0 && !query.qualifiers };
  const terms: SearchTerms = {
    ...shared,
    scope: scopeOf(
      inPlay,
      qualifiersOf({ ...shared, involvesMe: suggesting }, { ...asked, type: asked.type ?? "issue" }),
    ),
  };
  // With one repository in play, a typed number is also read directly and put on top: the search
  // has no number qualifier.
  const number =
    page === 1 && inPlay.length === 1 && !reading.qualified ? reading.number : undefined;
  const [found, involving, numbered] = await Promise.all([
    searchTypes(access, terms, asked, types, page),
    suggesting ? searchTypes(access, { ...terms, involvesMe: true }, asked, types, 1) : undefined,
    number ? getJson(`/repos/${inPlay[0]}/issues/${number}`, access, itemSchema) : undefined,
  ]);
  if (!found.ok) return found;
  if (involving && !involving.ok) return involving;
  const byUpdated = !byRelevance(terms);
  // Past 256 characters the scope names owners, which may reach their public repositories the
  // token was not given (#43). The dialog shows what it finds; the agent's search never wanders
  // past the token's repositories, and its count would hold the others too.
  const byOwner = terms.scope.some((term) => term.startsWith("user:"));
  const strict = query.qualifiers === true;
  const readable = new Set(inPlay.map((name) => name.toLowerCase()));
  const foundItems = mergedItems(found.value, byUpdated).filter(
    (item) => !strict || readable.has(repositoryOf(item).toLowerCase()),
  );
  // A number nothing has, or cannot be read, is only not on top.
  const exact = numbered?.ok && matchesToggles(numbered.value, asked) ? [numbered.value] : [];
  const items = uniqueItems([
    ...exact,
    ...(involving ? mergedItems(involving.value, byUpdated) : []),
    ...foundItems,
  ]);
  const foundIds = new Set(foundItems.map(idOf));
  const total = strict && byOwner
    ? undefined
    : found.value.reduce((sum, typePage) => sum + typePage.total, 0) +
      exact.filter((item) => !foundIds.has(idOf(item))).length;
  const nextTypes = found.value
    .filter((typePage) => page * PAGE_SIZE < Math.min(typePage.total, SEARCH_LIMIT))
    .map((typePage) => typePage.type);
  return ok({
    results: items.map((item) => summaryOf(access.connectionId, item)),
    ...(nextTypes.length ? { next: cursorOf({ page: page + 1, types: nextTypes }) } : {}),
    ...(total === undefined ? {} : { total }),
    reach,
    ...(narrowedTo.length ? { narrowedTo } : {}),
  });
}

/** GitHub's best matches first while there are words to match; otherwise the most recently updated. */
const byRelevance = (terms: SearchTerms) => terms.words.length > 0;

/** What a search's text asks for. */
type TextReading = {
  /** Nothing typed. */
  empty: boolean;
  /** The words and passed-through qualifiers to send, in the order given. */
  words: string[];
  /** How many of `words` are plain words, not qualifiers. */
  plainWords: number;
  /** The readable repositories it names, by `repo:`, `user:` or `org:` or by a repository's name. */
  narrowedTo: string[];
  /** The readable repositories it leaves out (`-repo:`, `-user:`, `-org:`). */
  excluded: string[];
  /** The type a qualifier names (`is:pr`, `type:issue`). */
  type?: GithubRecordType;
  /** Whether a qualifier names a state (`is:closed`, `state:open`, `is:merged`). */
  namesState: boolean;
  /** `482` or `#482`: the first number typed. */
  number?: string;
  /** Whether a qualifier passes through, which the number read directly might not match. */
  qualified: boolean;
};

/** The pieces of a query, split at spaces outside double quotes: `label:"good first issue"` is one. */
const piecesOf = (text: string) => text.match(/(?:[^\s"]+|"[^"]*"?)+/g) ?? [];

/** `repo:`, `user:` and `org:`, which would widen the search past the token's repositories. */
const REPOSITORY_QUALIFIER = /^(-?)(repo|user|org):"?([^"\s]+)"?$/i;
const TYPE_QUALIFIER = /^(?:is|type):(issue|pr|pull-request)$/i;
const STATE_QUALIFIER = /^-?(?:is|state):(?:open|closed|merged|unmerged)$/i;
/** A qualifier with one plain or quoted value, negated or not; never an operator or parentheses. */
const QUALIFIER_PIECE = /^-?[a-z][\w-]*:(?:"[^"()]*"|[^\s"()]+)$/i;
const PHRASE = /^"[^"]+"$/;

/**
 * Reads the text of a search. Every word is searched as text in the dialog's search; the agent's
 * (`qualifiers`) passes GitHub's qualifiers through and quoted phrases as phrases. Either way a
 * word that names a readable repository narrows the search to it, and the scope stays the token's:
 * a `repo:`, `user:` or `org:` outside the readable repositories is dropped, and operators and
 * parentheses are searched as text, so nothing can widen the search past them.
 */
function readText(text: string, qualifiers: boolean, repositories: readonly Repository[]): TextReading {
  const pieces = qualifiers ? piecesOf(text) : text.split(/\s+/).filter(Boolean);
  const reading: TextReading = {
    empty: pieces.length === 0,
    words: [],
    plainWords: 0,
    narrowedTo: [],
    excluded: [],
    namesState: false,
    qualified: false,
  };
  const narrow = (named: readonly Repository[], into: string[]) => {
    for (const repo of named) if (!into.includes(repo.full_name)) into.push(repo.full_name);
  };
  for (const piece of pieces) {
    reading.number ??= numberIn(piece);
    const qualifier = qualifiers ? REPOSITORY_QUALIFIER.exec(piece) : null;
    if (qualifier) {
      const [, negated, kind = "", value = ""] = qualifier;
      const name = value.toLowerCase();
      const named = repositories.filter((repo) =>
        kind.toLowerCase() === "repo"
          ? repo.full_name.toLowerCase() === name
          : repo.owner.login.toLowerCase() === name,
      );
      // Outside the token's repositories: dropped.
      narrow(named, negated ? reading.excluded : reading.narrowedTo);
      continue;
    }
    const type = qualifiers ? TYPE_QUALIFIER.exec(piece)?.[1]?.toLowerCase() : undefined;
    if (type) {
      reading.type = type === "issue" ? "issue" : "pull-request";
      continue;
    }
    if (qualifiers && PHRASE.test(piece)) {
      reading.words.push(piece);
      reading.plainWords += 1;
      continue;
    }
    if (qualifiers && QUALIFIER_PIECE.test(piece)) {
      if (STATE_QUALIFIER.test(piece)) reading.namesState = true;
      else reading.qualified = true;
      reading.words.push(piece);
      continue;
    }
    const named = repositoriesNamed(repositories, piece);
    if (named.length) {
      narrow(named, reading.narrowedTo);
      continue;
    }
    const word = searchWord(piece);
    if (word) {
      reading.words.push(word);
      reading.plainWords += 1;
    }
  }
  return reading;
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

/** How many comments, reviews or changed files a view shows: GitHub's largest page. */
const PAGE_LIMIT = 100;

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

/**
 * `text` with each invisible or bidirectional character written as its code point (`<U+202E>`):
 * for code, where such a character may be the change itself (a Trojan Source edit), so it is shown
 * rather than dropped.
 */
export const codePointsShown = (text: string) =>
  text.replace(
    INVISIBLE,
    (character) => `<U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`,
  );


/** `acme/web#482`: the repository and the number. */
export function parseKey(key: string) {
  const match = /^([\w.-]+\/[\w.-]+)#(\d{1,9})$/.exec(key);
  return match ? { repository: match[1]!, number: Number(match[2]) } : undefined;
}

const userSchema = z.object({ login: z.string() }).nullable();
const login = (user: z.infer<typeof userSchema>) => user?.login ?? "ghost";

/** What `/issues/{n}` and `/pulls/{n}` both answer and a view shows. */
const conversationFields = {
  user: userSchema,
  labels: z.array(
    z.union([
      z.string().transform((name) => ({ name, color: undefined })),
      z.object({ name: z.string(), color: z.string().nullish() }),
    ]),
  ),
  assignees: z.array(z.object({ login: z.string() })).nullish(),
  body: z.string().nullish(),
  /** How many comments the conversation has, review comments aside. */
  comments: z.number(),
  created_at: z.string(),
};

/** An issue's or a pull request's conversation, as `detailOf` reads it. */
type GithubConversation = z.infer<z.ZodObject<typeof conversationFields>> & { number: number };

/** The parts of `GET /repos/{o}/{r}/issues/{n}` a view shows. */
const issueSchema = itemSchema.extend(conversationFields);

/** The parts of `GET /repos/{o}/{r}/pulls/{n}` a view and the diff tool read. */
export const pullSchema = itemSchema.omit({ repository_url: true, pull_request: true }).extend({
  ...conversationFields,
  merged_at: z.string().nullable(),
  merged: z.boolean().nullish(),
  merged_by: userSchema.optional(),
  mergeable_state: z.string().nullish(),
  base: z.object({ ref: z.string() }),
  head: z.object({ ref: z.string(), sha: z.string() }),
  review_comments: z.number(),
  commits: z.number(),
  additions: z.number(),
  deletions: z.number(),
  changed_files: z.number(),
});
type GithubPull = z.infer<typeof pullSchema>;

/** The summary of a pull request of `repository` (`acme/web`), as `/pulls/{n}` answers it. */
export const pullSummary = (connectionId: string, repository: string, pull: GithubPull) =>
  summaryInRepository(connectionId, repository, {
    ...pull,
    pull_request: { merged_at: pull.merged_at },
  });

const commentsSchema = z.array(
  z.object({ id: z.number(), user: userSchema, created_at: z.string(), body: z.string().nullish() }),
);

const reviewsSchema = z.array(
  z.object({
    id: z.number(),
    user: userSchema,
    state: z.string(),
    body: z.string().nullish(),
    submitted_at: z.string().nullish(),
  }),
);

const reviewCommentsSchema = z.array(
  z.object({
    id: z.number(),
    pull_request_review_id: z.number().nullish(),
    user: userSchema,
    path: z.string(),
    line: z.number().nullish(),
    original_line: z.number().nullish(),
    created_at: z.string(),
    body: z.string().nullish(),
  }),
);

/** The changed files; the patch is left out of the schema, so it is never kept. */
const filesSchema = z.array(
  z.object({
    filename: z.string(),
    previous_filename: z.string().nullish(),
    status: z.string(),
    additions: z.number(),
    deletions: z.number(),
  }),
);

/** What a view shows of an issue (or a pull request's conversation) and its first comments. */
function detailOf(
  issue: GithubConversation,
  comments: z.infer<typeof commentsSchema>,
): GithubIssueDetail {
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

/** The pull request's reviews, each with its inline comments. */
function reviewsOf(
  reviews: z.infer<typeof reviewsSchema>,
  comments: z.infer<typeof reviewCommentsSchema>,
): GithubPullRequestDetail["reviews"] {
  return reviews.map((review) => ({
    id: review.id,
    author: login(review.user),
    state: review.state,
    ...(review.submitted_at ? { submittedAt: review.submitted_at } : {}),
    body: visibleText(review.body ?? ""),
    comments: comments
      .filter((comment) => comment.pull_request_review_id === review.id)
      .map((comment) => {
        const line = comment.line ?? comment.original_line;
        return {
          id: comment.id,
          author: login(comment.user),
          createdAt: comment.created_at,
          path: visibleText(comment.path),
          ...(line ? { line } : {}),
          body: visibleText(comment.body ?? ""),
        };
      }),
  }));
}

/** Whether, and where, the pull request merges. */
function mergeOf(pull: GithubPull): GithubPullRequestDetail["merge"] {
  return {
    mergeableState: pull.mergeable_state ?? "unknown",
    draft: pull.draft === true,
    merged: pull.merged ?? pull.merged_at !== null,
    closed: pull.state === "closed",
    ...(pull.merged_at ? { mergedAt: pull.merged_at } : {}),
    ...(pull.merged_by ? { mergedBy: login(pull.merged_by) } : {}),
    base: visibleText(pull.base.ref),
    head: visibleText(pull.head.ref),
    commits: pull.commits,
    additions: pull.additions,
    deletions: pull.deletions,
  };
}

const filesOf = (files: z.infer<typeof filesSchema>): GithubPullRequestDetail["files"] =>
  files.map((file) => ({
    path: visibleText(file.filename),
    ...(file.previous_filename ? { previousPath: visibleText(file.previous_filename) } : {}),
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  }));

const workflowRunsSchema = z.object({
  total_count: z.number(),
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullish(),
      display_title: z.string().nullish(),
      event: z.string(),
      status: z.string().nullish(),
      conclusion: z.string().nullish(),
    }),
  ),
});

const combinedStatusSchema = z.object({
  state: z.string(),
  statuses: z.array(
    z.object({
      id: z.number(),
      context: z.string(),
      state: z.string(),
      description: z.string().nullish(),
    }),
  ),
});

type Ci = GithubPullRequestDetail["ci"];

/**
 * A CI part as read: `readable: false` when the token lacks the permission (403), nothing when
 * GitHub has nothing there (404, e.g. Actions turned off); any other refusal fails the view.
 */
function ciPart<T, P>(
  read: Answer<T, RecordError>,
  shown: (value: T) => P,
  none: P,
): Answer<P | { readable: false }, RecordError> {
  if (read.ok) return ok(shown(read.value));
  if (read.error.kind === "no_access") return ok({ readable: false });
  if (read.error.kind === "not_found") return ok(none);
  return read;
}

/** The head commit's GitHub Actions runs and combined commit status, in parallel. */
async function readCi(
  access: ConnectionAccess,
  repository: string,
  headSha: string,
): Promise<Answer<Ci, RecordError>> {
  const path = `/repos/${repository}`;
  const [runs, status] = await Promise.all([
    getJson(`${path}/actions/runs?head_sha=${headSha}`, access, workflowRunsSchema),
    getJson(`${path}/commits/${headSha}/status`, access, combinedStatusSchema),
  ]);
  const site = siteOf(access.baseUrl);
  const actions = ciPart(
    runs,
    (found): Ci["actions"] => ({
      readable: true,
      total: found.total_count,
      runs: found.workflow_runs.map((run) => ({
        id: run.id,
        name: visibleText(run.name ?? "Workflow"),
        title: visibleText(run.display_title ?? ""),
        event: run.event,
        status: run.status ?? "unknown",
        ...(run.conclusion ? { conclusion: run.conclusion } : {}),
        url: `${site}/${repository}/actions/runs/${run.id}`,
      })),
    }),
    { readable: true, total: 0, runs: [] },
  );
  if (!actions.ok) return actions;
  const statuses = ciPart(
    status,
    (found): Ci["statuses"] => ({
      readable: true,
      state: found.state,
      statuses: found.statuses.map((item) => ({
        id: item.id,
        context: visibleText(item.context),
        state: item.state,
        ...(item.description ? { description: visibleText(item.description) } : {}),
      })),
    }),
    { readable: true, state: "pending", statuses: [] },
  );
  if (!statuses.ok) return statuses;
  return ok({ headSha, actions: actions.value, statuses: statuses.value });
}

type Reader<D> = (
  access: ConnectionAccess,
  key: string,
) => Promise<Answer<{ summary: RecordSummary; detail: D }, RecordError>>;

/**
 * Reads an issue with its first 100 comments, in parallel. A pull request's number is
 * `not_found`, as GitHub answers a missing number.
 */
const readIssue: Reader<GithubIssueDetail> = async (access, key) => {
  const parsed = parseKey(key);
  if (!parsed) return err({ kind: "not_found" });
  const path = `/repos/${parsed.repository}/issues/${parsed.number}`;
  const [issue, comments] = await Promise.all([
    getJson(path, access, issueSchema),
    getJson(`${path}/comments?per_page=${PAGE_LIMIT}`, access, commentsSchema),
  ]);
  if (!issue.ok) return issue;
  if (typeOf(issue.value) !== "issue") return err({ kind: "not_found" });
  if (!comments.ok) return comments;
  return ok({
    summary: summaryOf(access.connectionId, issue.value),
    detail: detailOf(issue.value, comments.value),
  });
};

/**
 * Reads a pull request for review, fanned out in parallel (#61): the pull request, its
 * conversation's first 100 comments, its first 100 reviews and inline review comments, its
 * first 100 changed files and, once the head commit is known, its CI. An issue's number is
 * `not_found`, as `/pulls/{n}` answers it.
 */
const readPullRequest: Reader<GithubPullRequestDetail> = async (access, key) => {
  const parsed = parseKey(key);
  if (!parsed) return err({ kind: "not_found" });
  const repository = `/repos/${parsed.repository}`;
  const path = `${repository}/pulls/${parsed.number}`;
  const page = `?per_page=${PAGE_LIMIT}`;
  const pullRead = getJson(path, access, pullSchema);
  // CI needs the head commit, so it starts as soon as the pull request is read.
  const ciRead = pullRead.then((read) =>
    read.ok ? readCi(access, parsed.repository, read.value.head.sha) : read,
  );
  const [pull, comments, reviews, reviewComments, files, ci] = await Promise.all([
    pullRead,
    getJson(`${repository}/issues/${parsed.number}/comments${page}`, access, commentsSchema),
    getJson(`${path}/reviews${page}`, access, reviewsSchema),
    getJson(`${path}/comments${page}`, access, reviewCommentsSchema),
    getJson(`${path}/files${page}`, access, filesSchema),
    ciRead,
  ]);
  if (!pull.ok) return pull;
  if (!comments.ok) return comments;
  if (!reviews.ok) return reviews;
  if (!reviewComments.ok) return reviewComments;
  if (!files.ok) return files;
  if (!ci.ok) return ci;
  const detail: GithubPullRequestDetail = {
    ...detailOf(pull.value, comments.value),
    merge: mergeOf(pull.value),
    reviews: reviewsOf(reviews.value, reviewComments.value),
    reviewCommentCount: pull.value.review_comments,
    fileCount: pull.value.changed_files,
    files: filesOf(files.value),
    ci: ci.value,
  };
  return ok({ summary: pullSummary(access.connectionId, parsed.repository, pull.value), detail });
};

// --- Trimming a read for the model (`read_record`), within `MODEL_LIMITS`. ---

type IssueComment = GithubIssueDetail["comments"][number];

/** A comment as the model reads it: no id, its body cut. */
const trimComment = ({ author, createdAt, body }: IssueComment) => ({
  author,
  createdAt,
  body: cutText(body, MODEL_LIMITS.commentCharacters),
});

/**
 * An issue (or a pull request's conversation) for the model: label names only, the body's first
 * characters and the newest comments, each cut. `olderComments` says what was left out.
 */
function trimIssue(detail: GithubIssueDetail) {
  const comments = newestEntries(detail.comments, detail.commentCount, "comments");
  return {
    number: detail.number,
    author: detail.author,
    createdAt: detail.createdAt,
    labels: detail.labels.map((label) => label.name),
    assignees: detail.assignees,
    body: cutText(detail.body, MODEL_LIMITS.bodyCharacters),
    commentCount: detail.commentCount,
    ...(comments.note ? { olderComments: comments.note } : {}),
    comments: comments.kept.map(trimComment),
  };
}

type Review = GithubPullRequestDetail["reviews"][number];
type ReviewComment = Review["comments"][number];

/**
 * A pull request for the model: its conversation as an issue's, its newest reviews and, among
 * theirs, its newest inline comments, each cut, with the merge state, the changed files and CI as
 * read. `olderReviews` and `olderReviewComments` say what was left out.
 */
function trimPullRequest(detail: GithubPullRequestDetail) {
  const reviews = newestEntries(detail.reviews, detail.reviews.length, "reviews");
  // The inline comments of every review read, oldest first; the newest of the kept reviews' stay.
  const keptReviewIds = new Set(reviews.kept.map((review) => review.id));
  const readReviewComments = detail.reviews
    .flatMap((review) => review.comments.map((comment) => ({ reviewId: review.id, comment })))
    .sort((a, b) => a.comment.createdAt.localeCompare(b.comment.createdAt));
  const shownCommentIds = new Set(
    readReviewComments
      .filter(({ reviewId }) => keptReviewIds.has(reviewId))
      .slice(-MODEL_LIMITS.comments)
      .map(({ comment }) => comment.id),
  );
  const olderReviewComments = cutNote(
    "review comments",
    readReviewComments.length - shownCommentIds.size,
    detail.reviewCommentCount - readReviewComments.length,
  );
  const trimReviewComment = ({ author, createdAt, path, line, body }: ReviewComment) => ({
    author,
    createdAt,
    path,
    ...(line ? { line } : {}),
    body: cutText(body, MODEL_LIMITS.commentCharacters),
  });
  return {
    ...trimIssue(detail),
    merge: detail.merge,
    ...(reviews.note ? { olderReviews: reviews.note } : {}),
    reviews: reviews.kept.map((review) => ({
      author: review.author,
      state: review.state,
      ...(review.submittedAt ? { submittedAt: review.submittedAt } : {}),
      body: cutText(review.body, MODEL_LIMITS.commentCharacters),
      comments: review.comments
        .filter((comment) => shownCommentIds.has(comment.id))
        .map(trimReviewComment),
    })),
    reviewCommentCount: detail.reviewCommentCount,
    ...(olderReviewComments ? { olderReviewComments } : {}),
    fileCount: detail.fileCount,
    files: detail.files,
    ci: detail.ci,
  };
}

/** The declared types, each with its reader. */
export const githubRecordTypes = {
  issue: recordType(declaredTypes.issue, readIssue, trimIssue),
  "pull-request": recordType(declaredTypes["pull-request"], readPullRequest, trimPullRequest),
} satisfies ProviderRecords["types"];

/**
 * The record's page on GitHub: the API's address without `api.` or `/api/v3` (GitHub Enterprise),
 * then the repository and the number.
 */
export function githubRecordUrl(baseUrl: string, type: string, key: string): string | undefined {
  const parsed = parseKey(key);
  if (!parsed || !isRecordType(type)) return undefined;
  const page = type === "issue" ? "issues" : "pull";
  return `${siteOf(baseUrl)}/${parsed.repository}/${page}/${parsed.number}`;
}

/** GitHub's site for an API base URL: without `api.` or `/api/v3` (GitHub Enterprise). */
function siteOf(baseUrl: string): string {
  const site = new URL(baseUrl);
  if (site.hostname.startsWith("api.")) site.hostname = site.hostname.slice("api.".length);
  return site.origin + site.pathname.replace(/\/api\/v3\/?$/, "").replace(/\/$/, "");
}
