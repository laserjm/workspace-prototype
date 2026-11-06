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
  /** Label of the explorer's list view, e.g. "Pages". */
  listLabel: string;
  /** Whether the explorer offers a board grouped by status. */
  hasBoard: boolean;
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
  ) => Promise<Result<VerifiedAccount, CredentialRejected | ProviderUnreachable>>;
  /** Sources and records a thread can browse and attach. */
  records?: {
    /** Each product's presentation, by the `product` its sources name. */
    products: Readonly<Record<string, ProductPresentation>>;
    reader: RecordReader;
  };
};

/** Declares a provider; only checks it against the contract. */
export function defineProvider<const P extends Provider>(provider: P): P {
  return provider;
}

/** What a provider offers the connect form: the provider without its code. */
export type ProviderChoice = Pick<
  Provider,
  "id" | "name" | "description" | "auth" | "baseUrl"
>;

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
  /** The provider's default when left out. HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  credential: credentialSchema,
});
export type ConnectInput = z.infer<typeof connectInputSchema>;

/** Names one of the user's stored connections. */
export const connectionInputSchema = z.object({ connectionId: z.uuid() });
