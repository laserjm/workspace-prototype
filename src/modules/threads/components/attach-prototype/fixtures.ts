// PROTOTYPE, throwaway (wayfinder: "How the attach dialog filters and picks GitHub issues and
// pull requests"). Canned connections and records, and a filter model that only uses what
// GitHub's `GET /search/issues` supports (see the research ticket "GitHub's REST and search APIs
// for picking and viewing issues and pull requests"). Nothing here is fetched.

export const VIEWER = "mira-k";
/** Items one message may attach. */
export const LIMIT = 10;

export type Connection = {
  id: string;
  provider: "github" | "confluence";
  name: string;
  /** Who the token reaches: one owner plus public repos for a fine-grained PAT. */
  reach: string;
  /** The search is always scoped to this (`org:` / `user:`), or public GitHub leaks in. */
  scope: string;
  repos: string[];
};

export const CONNECTIONS: Connection[] = [
  {
    id: "gh-acme",
    provider: "github",
    name: "GitHub · acme",
    reach: "Organisation acme, 4 repositories",
    scope: "org:acme",
    repos: ["acme/web", "acme/api", "acme/infra", "acme/design-system"],
  },
  {
    id: "gh-personal",
    provider: "github",
    name: "GitHub · mira-k",
    reach: "Your account, 2 repositories",
    scope: "user:mira-k",
    repos: ["mira-k/dotfiles", "mira-k/notes-app"],
  },
  {
    id: "cf-acme",
    provider: "confluence",
    name: "Confluence · Acme",
    reach: "acme.atlassian.net, 3 spaces",
    scope: "",
    repos: ["ENG", "PRODUCT", "OPS"],
  },
];

export type ItemState = "open" | "closed" | "merged" | "draft" | "current";

export type Item = {
  connectionId: string;
  /** Stable reference, as a chip and a view id would use it. */
  key: string;
  kind: "issue" | "pr" | "page";
  /** Repository, or the Confluence space. */
  repo: string;
  number: number;
  title: string;
  state: ItemState;
  author: string;
  assignees: string[];
  reviewRequested: string[];
  labels: string[];
  /** Days since the last update. */
  updated: number;
  comments: number;
};

type Row = [
  repo: string,
  kind: "issue" | "pr",
  number: number,
  title: string,
  state: ItemState,
  author: string,
  labels: string,
  assignees: string,
  updated: number,
  comments: number,
  reviewRequested?: string,
];

const ACME: Row[] = [
  ["acme/web", "pr", 482, "Checkout: retry the payment intent once on a 409", "open", "jonas-b", "payments,bug", "", 0, 7, "mira-k"],
  ["acme/web", "issue", 479, "Checkout button stays disabled after a declined card", "open", "support-bot", "bug,payments,p1", "mira-k", 1, 12],
  ["acme/web", "pr", 476, "Move the cart drawer to the new sheet component", "draft", "mira-k", "ui", "", 2, 3],
  ["acme/web", "issue", 471, "Order history paginates past the last page", "open", "lea-w", "bug", "jonas-b", 3, 4],
  ["acme/web", "pr", 468, "Bump Next.js and fix the proxy matcher", "merged", "renovate", "dependencies", "", 4, 1],
  ["acme/web", "issue", 455, "Dark mode: price badges unreadable", "closed", "mira-k", "ui,a11y", "mira-k", 9, 6],
  ["acme/web", "issue", 450, "Add Apple Pay to checkout", "open", "product-team", "payments,enhancement", "", 14, 21],
  ["acme/web", "pr", 449, "Lazy-load the product carousel", "closed", "tim-o", "performance", "", 15, 2],
  ["acme/api", "pr", 1203, "Idempotency keys for POST /orders", "open", "mira-k", "payments,api", "", 0, 9, "jonas-b,lea-w"],
  ["acme/api", "issue", 1199, "Webhook signature check fails for retried events", "open", "jonas-b", "bug,payments,p1", "mira-k", 1, 15],
  ["acme/api", "issue", 1194, "Rate-limit the search endpoint per tenant", "open", "lea-w", "enhancement,api", "", 5, 3],
  ["acme/api", "pr", 1190, "Drop the v1 orders endpoints", "open", "lea-w", "api,breaking", "", 6, 18, "mira-k"],
  ["acme/api", "pr", 1185, "Trace ids in every log line", "merged", "tim-o", "observability", "", 8, 4],
  ["acme/api", "issue", 1170, "Postgres connection pool exhausted under load test", "closed", "tim-o", "bug,performance", "tim-o", 20, 27],
  ["acme/api", "issue", 1166, "Document the refund flow", "open", "product-team", "docs,payments", "mira-k", 22, 2],
  ["acme/infra", "pr", 310, "Terraform: split the staging VPC", "open", "ops-anna", "infra", "", 2, 5, "mira-k"],
  ["acme/infra", "issue", 305, "Nightly backup job silently skips the orders DB", "open", "ops-anna", "bug,p1,ops", "ops-anna", 3, 8],
  ["acme/infra", "pr", 301, "Renovate: pin GitHub Actions by SHA", "merged", "renovate", "dependencies,security", "", 10, 0],
  ["acme/infra", "issue", 296, "Rotate the CI deploy key", "closed", "mira-k", "security", "mira-k", 30, 3],
  ["acme/design-system", "pr", 88, "Sheet component with focus trap", "open", "mira-k", "ui,a11y", "", 2, 11, "tim-o"],
  ["acme/design-system", "issue", 85, "Tokens: badge colours fail contrast in dark mode", "open", "lea-w", "a11y,ui", "mira-k", 7, 5],
  ["acme/design-system", "issue", 79, "Publish the icons package", "closed", "tim-o", "enhancement", "", 40, 1],
];

const PERSONAL: Row[] = [
  ["mira-k/notes-app", "issue", 14, "Sync conflicts duplicate the note title", "open", "mira-k", "bug", "mira-k", 4, 2],
  ["mira-k/notes-app", "pr", 15, "Store notes in IndexedDB instead of localStorage", "draft", "mira-k", "", "", 4, 0],
  ["mira-k/notes-app", "issue", 11, "Export to Markdown", "closed", "a-friend", "enhancement", "", 60, 4],
  ["mira-k/dotfiles", "pr", 3, "zsh: lazy-load nvm", "merged", "mira-k", "", "", 90, 0],
];

const list = (value?: string) => (value ? value.split(",") : []);

function rows(connectionId: string, data: Row[]): Item[] {
  return data.map(([repo, kind, number, title, state, author, labels, assignees, updated, comments, review]) => ({
    connectionId,
    key: `${repo}#${number}`,
    kind,
    repo,
    number,
    title,
    state,
    author,
    labels: list(labels),
    assignees: list(assignees),
    reviewRequested: list(review),
    updated,
    comments,
  }));
}

const PAGES: [space: string, id: number, title: string, author: string, updated: number][] = [
  ["ENG", 9001, "Payments architecture", "jonas-b", 3],
  ["ENG", 9002, "Runbook: failed payment webhooks", "ops-anna", 12],
  ["PRODUCT", 9010, "Checkout redesign, Q4", "product-team", 1],
  ["OPS", 9020, "Backup and restore policy", "ops-anna", 30],
];

export const ITEMS: Item[] = [
  ...rows("gh-acme", ACME),
  ...rows("gh-personal", PERSONAL),
  ...PAGES.map(([space, id, title, author, updated]): Item => ({
    connectionId: "cf-acme",
    key: `${space}/${id}`,
    kind: "page",
    repo: space,
    number: id,
    title,
    state: "current",
    author,
    assignees: [],
    reviewRequested: [],
    labels: [],
    updated,
    comments: 0,
  })),
];

export const itemByKey = (connectionId: string, key: string) =>
  ITEMS.find((item) => item.connectionId === connectionId && item.key === key);

export const connectionById = (id: string) =>
  CONNECTIONS.find((connection) => connection.id === id) ?? CONNECTIONS[0];

/** The short label a chip shows: `web#482`, or the page title for Confluence. */
export const shortRef = (item: Item) =>
  item.kind === "page" ? item.title : `${item.repo.split("/")[1]}#${item.number}`;

export const ago = (days: number) => (days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`);

// ---------------------------------------------------------------------------------------------
// Filters: each maps onto one search qualifier, so the query can always be shown and edited.

export type Filter = {
  type: "any" | "issue" | "pr";
  /** `is:open` etc.; "any" adds no qualifier. */
  state: "any" | "open" | "closed" | "merged" | "draft";
  /** OR, in the legacy dialect: `repo:a repo:b`. Empty means the connection's whole scope. */
  repos: string[];
  author: string;
  assignee: string;
  /** `review-requested:` */
  reviewRequested: string;
  /** AND: `label:a label:b`. */
  labels: string[];
  text: string;
  sort: "updated" | "created" | "comments";
};

export const EMPTY_FILTER: Filter = {
  type: "any",
  state: "open",
  repos: [],
  author: "",
  assignee: "",
  reviewRequested: "",
  labels: [],
  text: "",
  sort: "updated",
};

/** The `q` GitHub would receive. Always scoped to the connection. */
export function toQuery(filter: Filter, connection: Connection): string {
  if (connection.provider === "confluence") {
    const parts = [filter.repos.length ? `space in (${filter.repos.join(", ")})` : "", filter.text ? `text ~ "${filter.text}"` : ""];
    return ["type = page", ...parts.filter(Boolean)].join(" AND ") + " ORDER BY lastmodified DESC";
  }
  const parts: string[] = [];
  if (filter.type !== "any") parts.push(`is:${filter.type}`);
  if (filter.state === "draft") parts.push("is:pr", "draft:true", "is:open");
  else if (filter.state !== "any") parts.push(`is:${filter.state}`);
  if (filter.repos.length) parts.push(...filter.repos.map((repo) => `repo:${repo}`));
  else parts.push(connection.scope);
  if (filter.author) parts.push(`author:${filter.author}`);
  if (filter.assignee) parts.push(`assignee:${filter.assignee}`);
  if (filter.reviewRequested) parts.push(`review-requested:${filter.reviewRequested}`);
  parts.push(...filter.labels.map((label) => `label:${label}`));
  if (filter.text) parts.push(filter.text, "in:title,body");
  parts.push(`sort:${filter.sort}-desc`);
  return [...new Set(parts)].join(" ");
}

/** Reads a typed query back into a filter (variant B). Unknown words become text. */
export function parseQuery(raw: string, base: Filter = EMPTY_FILTER): Filter {
  const filter: Filter = { ...base, type: "any", state: "any", repos: [], author: "", assignee: "", reviewRequested: "", labels: [], text: "" };
  const words: string[] = [];
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const [qualifier, ...rest] = token.split(":");
    const value = rest.join(":");
    if (!value) {
      words.push(token);
      continue;
    }
    switch (qualifier) {
      case "is":
        if (value === "issue" || value === "pr") filter.type = value;
        else if (["open", "closed", "merged"].includes(value)) filter.state = value as Filter["state"];
        break;
      case "draft":
        filter.state = "draft";
        break;
      case "repo":
        filter.repos.push(value);
        break;
      case "author":
        filter.author = value;
        break;
      case "assignee":
        filter.assignee = value;
        break;
      case "review-requested":
        filter.reviewRequested = value;
        break;
      case "label":
        filter.labels.push(...value.split(","));
        break;
      case "sort":
        filter.sort = (value.replace("-desc", "") as Filter["sort"]) ?? "updated";
        break;
      default:
        // org:, user:, in: and the rest: scope or noise the prototype ignores.
        break;
    }
  }
  filter.text = words.join(" ");
  return filter;
}

const resolve = (value: string) => (value === "@me" ? VIEWER : value);

export function search(connectionId: string, filter: Filter): Item[] {
  const text = filter.text.toLowerCase();
  return ITEMS.filter((item) => {
    if (item.connectionId !== connectionId) return false;
    if (filter.type !== "any" && item.kind !== filter.type) return false;
    if (filter.state === "open" && !(item.state === "open" || item.state === "draft" || item.state === "current")) return false;
    if (filter.state === "closed" && !(item.state === "closed" || item.state === "merged")) return false;
    if (filter.state === "merged" && item.state !== "merged") return false;
    if (filter.state === "draft" && item.state !== "draft") return false;
    if (filter.repos.length && !filter.repos.includes(item.repo)) return false;
    if (filter.author && item.author !== resolve(filter.author)) return false;
    if (filter.assignee && !item.assignees.includes(resolve(filter.assignee))) return false;
    if (filter.reviewRequested && !item.reviewRequested.includes(resolve(filter.reviewRequested))) return false;
    if (filter.labels.some((label) => !item.labels.includes(label))) return false;
    if (text && !`${item.title} ${item.key}`.toLowerCase().includes(text) && !(text.startsWith("#") && `#${item.number}`.startsWith(text))) return false;
    return true;
  }).sort((a, b) => (filter.sort === "comments" ? b.comments - a.comments : filter.sort === "created" ? b.number - a.number : a.updated - b.updated));
}

/** Facet values for a connection, as the dialog would get them (labels from `GET /repos/{r}/labels`). */
export function facets(connectionId: string) {
  const items = ITEMS.filter((item) => item.connectionId === connectionId);
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    labels: unique(items.flatMap((item) => item.labels)),
    people: unique(items.flatMap((item) => [item.author, ...item.assignees])),
  };
}

/** GitHub's dashboard queries, as presets. */
export const PRESETS: { id: string; label: string; filter: Partial<Filter> }[] = [
  { id: "assigned", label: "Assigned to me", filter: { assignee: "@me" } },
  { id: "review", label: "Review requested", filter: { type: "pr", reviewRequested: "@me" } },
  { id: "created", label: "Created by me", filter: { author: "@me" } },
  { id: "recent", label: "Recently updated", filter: {} },
];
