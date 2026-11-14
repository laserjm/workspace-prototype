// What the integrations module takes and gives (docs/adr/0002, 0003, 0006): the record vocabulary
// every provider answers in, what the browser gets of a provider and a connection, the inputs of
// connecting. Browser-safe: zod and types, and the pure rules the browser runs too
// (docs/adr/0007). A provider's own browser shapes are in its folder (providers/<id>/contracts.ts,
// docs/adr/0011); the provider SPI, which is server-only, is ./provider.ts.
import { z } from "zod";
import type { User } from "@/lib/auth";

/** How a user connects. Phase 5 adds `oauth`. */
export type AuthMethod =
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
export type CredentialKind = AuthMethod["kind"];

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

/** Where a provider's API lives, when a user may say: GitHub Enterprise, a codebeamer instance. */
export type BaseUrlSetting = {
  label: string;
  /** The public service's address, prefilled; none for a system that is always self-hosted. */
  default?: string;
  placeholder?: string;
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

/** A `RecordSummary` as a tool answers it: the model reads each field's meaning. */
export const recordSummarySchema = z.object({
  connectionId: z.string(),
  type: z.string().describe("The provider's record type, e.g. issue or pull-request."),
  key: z
    .string()
    .describe("The record's reference within its connection, as the provider's guide writes keys."),
  label: z.string().describe("A short name to cite it by."),
  title: z.string(),
  state: z.string().describe("Its state now, as the provider's guide names them."),
  updatedAt: z.string().describe("When it last changed, ISO 8601."),
  where: z.string().describe("Where it lives, such as its repository and number."),
}) satisfies z.ZodType<RecordSummary>;

/** A `RecordError` as a tool answers it, as data. */
export const recordErrorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("no_access") }),
  z.object({ kind: z.literal("needs_reconnect") }),
  z.object({ kind: z.literal("rate_limited"), retryAt: z.string() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("invalid_query"), message: z.string() }),
]) satisfies z.ZodType<RecordError>;

/** A refusal to read a record, with the record's page when the provider can say where it is. */
export type RecordReadRefusal = RecordError & { url?: string };

/** A `RecordReadRefusal` as a tool answers it. */
export const recordReadRefusalSchema = recordErrorSchema.and(
  z.object({ url: z.string().optional().describe("The record's page, to point the user to.") }),
);

export type RecordStateDeclaration = { label: string; tone: RecordTone };

/** One kind of record a provider holds, e.g. GitHub's pull requests. */
export type RecordTypeDeclaration = {
  /** "pull request", "pull requests": the dialog's title and type toggle are built from them. */
  singular: string;
  plural: string;
  states: Readonly<Record<string, RecordStateDeclaration>>;
};

/** What the detail route answers: the detail, and where the record is on its provider's site. */
export type RecordRead = { summary: RecordSummary & { url: string }; detail: unknown };

/** A `RecordRead` as the browser parses the detail route's answer. */
export const recordReadSchema = z.object({
  summary: recordSummarySchema.extend({ url: z.string() }),
  detail: z.unknown(),
}) satisfies z.ZodType<RecordRead>;

/** What the record routes answer when they refuse: the copy, and the refusal as data. */
export const recordRefusalBodySchema = z.object({
  error: z.string(),
  refusal: recordReadRefusalSchema,
});

/** The generic filters the attach dialog offers; a provider says which its search supports. */
export type RecordFilter = "type" | "includeClosed";

/** What the attach dialog asks a provider's search for. */
export type RecordSearchQuery = {
  /** The words typed; none before typing. */
  text?: string;
  /**
   * The text may hold the provider's own qualifiers, which pass through (the agent's search).
   * Otherwise every word is searched as text (the attach dialog's).
   */
  qualifiers?: boolean;
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

/** A `RecordSearchPage` as the browser parses the search route's answer. */
export const recordSearchPageSchema = z.object({
  results: z.array(recordSummarySchema),
  next: z.string().optional(),
  total: z.number().optional(),
  reach: z.string().optional(),
  narrowedTo: z.array(z.string()).optional(),
}) satisfies z.ZodType<RecordSearchPage>;

/** The line under the attach dialog's search field: what the provider's search makes of the text. */
export type RecordSearchHint = {
  /** Before typing: what is listed, and what one can type. */
  idle: string;
  /** While typing: how the words match. */
  typing: string;
};

/** The records declaration as the browser gets it: no code. */
export type RecordDeclarations = {
  types: Readonly<Record<string, RecordTypeDeclaration>>;
  filters: readonly RecordFilter[];
  hint: RecordSearchHint;
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

/** What a provider offers the browser: the provider without its code. */
export type ProviderChoice = {
  id: string;
  name: string;
  description: string;
  auth: readonly AuthMethod[];
  baseUrl: BaseUrlSetting;
  records?: RecordDeclarations;
};

/**
 * The provider a user with nothing connected is invited to connect: the first that holds records.
 * The new-thread page and the attach dialog name it.
 */
export function invitedProvider(
  providers: readonly ProviderChoice[],
): (ProviderChoice & { records: RecordDeclarations }) | undefined {
  return providers.find(
    (provider): provider is ProviderChoice & { records: RecordDeclarations } =>
      provider.records !== undefined,
  );
}

export type ConnectionStatus = "active" | "needs_reconnect";

/** One user's link to one provider account or site. Never holds a secret. */
export type ConnectionListItem = {
  id: string;
  providerId: string;
  /** Who or what it is connected as: "@micha", "acme.atlassian.net". */
  accountLabel: string;
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
export const connectInput = z.object({
  providerId: z.string().min(1).max(100),
  /** The provider's default when left out. HTTPS only; `connect` also refuses an internal address. */
  baseUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  credential: credentialSchema,
});
export type ConnectInput = z.infer<typeof connectInput>;

/** Names one of the user's stored connections. */
export const connectionInput = z.object({ connectionId: z.uuid() });
export type ConnectionInput = z.infer<typeof connectionInput>;

// --- What a tool that reads connections is given (docs/adr/0005). ---

/**
 * What a tool that reads connections may see: the requester and the connections the server
 * allowed for this answer (for a provider tool, only its provider's: `integrationToolsFor`).
 * Never from the model. The record tools share it.
 */
export const connectionToolContextSchema = z.object({
  user: z.custom<User>().optional(),
  connectionIds: z.array(z.string()),
});
export type ConnectionToolContext = z.infer<typeof connectionToolContextSchema>;
