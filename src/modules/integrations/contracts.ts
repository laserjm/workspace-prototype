// The provider contract (docs/adr/0002): what a provider folder in ./providers/ declares.
// Browser-safe: types, constants and schemas only. The records a reader produces are the sources
// module's vocabulary, imported as types only, so nothing here loads that module.
import { z } from "zod";
import type { Result } from "@/lib/result";
import type { RecordPage, RecordQuery, SourceRecord } from "@/modules/sources";

/** How a product's sources look in the workspace: data, never a branch on an id. */
export type ProductPresentation = {
  /** The mark `SourceIcon` draws, e.g. "jira". */
  icon: string;
  /** "ticket", "tickets". */
  singular: string;
  plural: string;
};

/** A collection of records in a connection, as its provider lists it. */
export type SourceSummary = {
  /** Unique within the connection; the provider reads it back, e.g. "laserjm/workspace-prototype". */
  key: string;
  /** Which of the provider's products it belongs to, which gives its presentation. */
  product: string;
  name: string;
  description: string;
  workspace: string;
  location: string;
  collection: string;
  /** Breadcrumb above the collection in the explorer, e.g. "SPACE / PLATFORM". */
  collectionPath: string;
  /** Heading of an overview built from this source's records. */
  overviewTitle: string;
};

/** Names one source of one connection. */
export type SourceRef = { connectionId: string; sourceKey: string };

/**
 * What a provider's code gets to reach its system: the API address and the `Authorization` header
 * value, built per request on the server from the vault. A provider never reads a secret, an env
 * var or the database itself.
 */
export type ProviderAccess = { baseUrl: string; authorization?: string };

/** `ProviderAccess` for one stored connection. */
export type ConnectionAccess = ProviderAccess & { connectionId: string };

/** Reads a provider's sources and records for one connection. */
export type RecordReader = {
  listSources(access: ConnectionAccess): Promise<SourceSummary[]>;
  /** A page of the source's records; `undefined` when the connection has no such source. */
  searchRecords(
    access: ConnectionAccess,
    sourceKey: string,
    query: RecordQuery,
  ): Promise<RecordPage | undefined>;
  /** The records with these ids that exist, in the source's order. */
  getRecords(
    access: ConnectionAccess,
    sourceKey: string,
    ids: readonly string[],
  ): Promise<SourceRecord[]>;
};

/** How a user connects. Phase 5 adds `oauth`. */
export type AuthMethod =
  /** Nothing to enter: the built-in sample. */
  | { kind: "none" }
  /** An API key or personal access token, sent as `Bearer <token>`. */
  | { kind: "token"; label: string; help: string; placeholder?: string }
  /**
   * A username and password (or an email and API token), sent as HTTP Basic: legacy systems,
   * Atlassian API tokens.
   */
  | {
      kind: "basic";
      label: string;
      help: string;
      usernameLabel: string;
      passwordLabel: string;
    };

/** The kinds a user enters something for, and so the kinds a stored connection has. */
export type CredentialKind = Exclude<AuthMethod["kind"], "none">;

/** What a user enters to connect. Only the vault stores it, encrypted; nobody else keeps it. */
export const credentialSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("token"),
    token: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("basic"),
    username: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(2000),
  }),
]);
export type Credential = z.infer<typeof credentialSchema>;

/** The `Authorization` header value a credential is sent as. */
export function authorizationOf(credential: Credential): string {
  if (credential.kind === "token") return `Bearer ${credential.token}`;
  const pair = `${credential.username}:${credential.password}`;
  const bytes = new TextEncoder().encode(pair);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/** Where a provider's API lives, when a user may say: GitHub Enterprise, a codebeamer instance. */
export type BaseUrlSetting = {
  label: string;
  /** The public service's address, prefilled; none for a system that is always self-hosted. */
  default?: string;
  placeholder?: string;
};

/** Who a credential belongs to, as its provider answered. */
export type VerifiedAccount = {
  /** The provider's stable id for the account, e.g. GitHub's numeric user id. */
  accountRef: string;
  /** "@micha", "ana@acme.com". */
  accountLabel: string;
  scopes: string[];
  /** When the credential stops working, if the provider says. */
  expiresAt?: Date;
};

/** The provider answered that the credential is not valid. `message` is for the user. */
export type CredentialRejected = {
  readonly _tag: "CredentialRejected";
  readonly message: string;
};
export const credentialRejected = (message: string): CredentialRejected => ({
  _tag: "CredentialRejected",
  message,
});

/** The provider could not be reached, or answered with something unexpected. */
export type ProviderUnreachable = {
  readonly _tag: "ProviderUnreachable";
  readonly message: string;
};
export const providerUnreachable = (message: string): ProviderUnreachable => ({
  _tag: "ProviderUnreachable",
  message,
});

/** The provider's rate limit is reached; the credential was not judged. `message` is for the user. */
export type RateLimited = {
  readonly _tag: "RateLimited";
  readonly message: string;
  /** ISO 8601. */
  readonly retryAt: string;
};
export const rateLimited = (message: string, retryAt: string): RateLimited => ({
  _tag: "RateLimited",
  message,
  retryAt,
});

/**
 * A system the workspace can connect to. Code, not rows: one folder in ./providers/ and one line
 * in ../providers.ts. Capabilities are optional, so a provider has records, tools or both.
 */
export type Provider = {
  id: string;
  name: string;
  description: string;
  auth: readonly AuthMethod[];
  /** Where its API lives; asked for when connecting. Required for a provider one connects to. */
  baseUrl?: BaseUrlSetting;
  /** Checks a credential and says whose it is. Required for a provider one connects to. */
  verify?: (
    access: ProviderAccess,
  ) => Promise<
    Result<VerifiedAccount, CredentialRejected | ProviderUnreachable | RateLimited>
  >;
  /** Sources a thread can browse and fix as its scope (ADR 0002; ADR 0003 retires them). */
  sources?: {
    /** Each product's presentation, by the `product` its sources name. */
    products: Readonly<Record<string, ProductPresentation>>;
    reader: RecordReader;
  };
  /** The records a user can find and attach to a question (ADR 0003 §3). */
  records?: ProviderRecords;
  /**
   * What the agent should know to use one of its connections: what its records and states mean
   * and how its search reads. Markdown imported as text (`guide.md`), in the system prompt while
   * one of its connections is allowed. Server-only: never on `ProviderChoice`.
   */
  guide?: string;
};

// --- Records (ADR 0003): what a provider holds that a question can be about. ---

/** How a record's state is drawn. An unknown state draws `neutral`, so an old snapshot never breaks. */
export const RECORD_TONES = ["open", "draft", "done", "closed", "neutral"] as const;
export type RecordTone = (typeof RECORD_TONES)[number];

/** One record as a search lists it; an attached item's snapshot is `{ label, title, state }` of it. */
export type RecordSummary = {
  connectionId: string;
  /** One of the provider's declared record types, e.g. "pull-request". */
  type: string;
  /** The provider's own reference, parsed only by the provider, e.g. "acme/web#482". */
  key: string;
  /** Short, e.g. "web#482". */
  label: string;
  title: string;
  /** One of the type's declared states, e.g. "merged". */
  state: string;
  /** ISO 8601. */
  updatedAt: string;
  /** Where it lives, e.g. "acme/web #482". */
  where: string;
};

/** Why a provider could not answer about records. Providers return it, never throw it. */
export type RecordError =
  | { kind: "not_found" }
  | { kind: "no_access" }
  | { kind: "needs_reconnect" }
  /** `retryAt` is ISO 8601. */
  | { kind: "rate_limited"; retryAt: string }
  | { kind: "unreachable" }
  | { kind: "invalid_query"; message: string };

export type RecordStateDeclaration = { label: string; tone: RecordTone };

/** One kind of record a provider holds, e.g. GitHub's pull requests. */
export type RecordTypeDeclaration = {
  /** "pull request", "pull requests": the dialog's title and type toggle are built from them. */
  singular: string;
  plural: string;
  states: Readonly<Record<string, RecordStateDeclaration>>;
};

/**
 * One record as its view shows it: the live summary, and the provider's own detail (such as
 * `GithubIssueDetail`), which only that provider's view reads. There is no generic detail type.
 */
export type RecordDetail = { summary: RecordSummary; detail: unknown };

/** What the detail route answers: the detail, and where the record is on its provider's site. */
export type RecordRead = { summary: RecordSummary & { url: string }; detail: unknown };

/** A declared record type with its reader: server-side, never on `ProviderChoice`. */
export type RecordType = RecordTypeDeclaration & {
  /** Reads one record by its key, which only this provider parses; never throws. */
  read: (access: ConnectionAccess, key: string) => Promise<Result<RecordDetail, RecordError>>;
};

/** The generic filters the attach dialog offers; a provider says which its search supports. */
export type RecordFilter = "type" | "includeClosed";

/** What the attach dialog asks a provider's search for. */
export type RecordSearchQuery = {
  /** The words typed; none before typing. */
  text?: string;
  /** One declared type; all of them when left out. */
  type?: string;
  includeClosed?: boolean;
  /** The `next` of the page before, opaque to everyone but the provider. */
  cursor?: string;
};

export type RecordSearchPage = {
  results: RecordSummary[];
  /** The cursor of the next page, when there is one. */
  next?: string;
  total?: number;
  /** What the connection reaches, e.g. "Organisation acme, 4 repositories". */
  reach?: string;
  /** Where the typed text narrowed the search to, e.g. ["acme/web"]; the dialog shows it. */
  narrowedTo?: string[];
};

/** The line under the attach dialog's search field: what the provider's search makes of the text. */
export type RecordSearchHint = {
  /** Before typing: what is listed, and what one can type. */
  idle: string;
  /** While typing: how the words match. */
  typing: string;
};

/** The records part of a provider's manifest. */
export type ProviderRecords = {
  types: Readonly<Record<string, RecordType>>;
  filters: readonly RecordFilter[];
  hint: RecordSearchHint;
  search: (
    access: ConnectionAccess,
    query: RecordSearchQuery,
  ) => Promise<Result<RecordSearchPage, RecordError>>;
  /**
   * Where a record is on the provider's site, built from the connection's base URL and the key
   * without asking the provider; nothing for a key it cannot parse.
   */
  url: (baseUrl: string, type: string, key: string) => string | undefined;
};

/** The records declaration as the browser gets it: no code. */
export type RecordDeclarations = Pick<ProviderRecords, "filters" | "hint"> & {
  types: Readonly<Record<string, RecordTypeDeclaration>>;
};

/**
 * The view kind a record of `type` opens in, derived and never declared (ADR 0003 §3):
 * `github.pull-request-view`.
 */
export const viewKindOf = (providerId: string, type: string) => `${providerId}.${type}-view`;

/** The tone a record in `state` is drawn in; `neutral` for anything undeclared. */
export function toneOf(
  declarations: RecordDeclarations | undefined,
  type: string,
  state: string,
): RecordTone {
  return declarations?.types[type]?.states[state]?.tone ?? "neutral";
}

/** "issues and pull requests": the declared types' plural labels, for a title. */
export function pluralLabels(declarations: RecordDeclarations): string {
  const plurals = Object.values(declarations.types).map((type) => type.plural);
  if (plurals.length <= 1) return plurals.join("");
  return `${plurals.slice(0, -1).join(", ")} and ${plurals.at(-1)}`;
}

/** "40 s", "3 min": how long until `retryAt`, at least a second. */
export function waitLabel(retryAt: string, now = Date.now()): string {
  const seconds = Math.max(1, Math.ceil((Date.parse(retryAt) - now) / 1000));
  return seconds < 90 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

/** Declares a provider; only checks it against the contract. */
export function defineProvider<const P extends Provider>(provider: P): P {
  return provider;
}

/** What a provider offers the browser: the provider without its code. */
export type ProviderChoice = Pick<
  Provider,
  "id" | "name" | "description" | "auth" | "baseUrl"
> & { records?: RecordDeclarations };

export type ConnectionStatus = "active" | "needs_reconnect";

/** One user's link to one provider account or site. Never holds a secret. */
export type Connection = {
  id: string;
  providerId: string;
  /** Who or what it is connected as: "@micha", "acme.atlassian.net", "Sample data". */
  accountLabel: string;
  /** Part of the workspace (the sample): every user has it, nothing to test or disconnect. */
  builtIn: boolean;
  status: ConnectionStatus;
  baseUrl: string;
  scopes: string[];
  expiresAt: Date | null;
  lastVerifiedAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Expires in 23 days", "Expires today", "Expired": what the Sources view says of a credential. */
export function expiryLabel(expiresAt: Date, now: Date): string {
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (expiresAt.getTime() <= now.getTime()) return "Expired";
  if (days <= 1) return "Expires today";
  return `Expires in ${days} days`;
}

/** Connects to a provider with a credential; connecting the same account again updates it. */
export const connectInputSchema = z.object({
  providerId: z.string().min(1).max(100),
  /**
   * The provider's default when left out. HTTPS only; `connectAction` also refuses an internal
   * address. The messages are the form's field error.
   */
  baseUrl: z
    .url({ protocol: /^https$/, error: "Enter an address that starts with https://." })
    .max(500, "That address is too long.")
    .optional(),
  credential: credentialSchema,
});
export type ConnectInput = z.infer<typeof connectInputSchema>;

/** Names one of the user's stored connections. */
export const connectionInputSchema = z.object({ connectionId: z.uuid() });
