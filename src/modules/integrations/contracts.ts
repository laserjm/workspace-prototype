// The provider contract (docs/adr/0002): what a provider folder in ./providers/ declares, and the
// record vocabulary its reader produces. Browser-safe: types, constants and schemas only.
import { z } from "zod";

export const RECORD_STATUSES = [
  "To do",
  "In progress",
  "In review",
  "Done",
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const RECORD_PRIORITIES = ["High", "Medium", "Low"] as const;
export type RecordPriority = (typeof RECORD_PRIORITIES)[number];

/** A record as a provider reads it: a ticket, a page, a test case. */
export type ExternalRecord = {
  /** Unique within its source; the provider reads it back by this id. */
  id: string;
  title: string;
  type: string;
  /** The system's status mapped onto the workspace's four categories. */
  status: RecordStatus;
  priority: RecordPriority;
  owner: string;
  description: string;
  summary: string;
  risk?: string;
  nextStep: string;
  updated: string;
};

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

/** What a page of a source's records is asked for. Every field is optional. */
export const recordQuerySchema = z.object({
  text: z.string().max(200).optional(),
  /** The `nextCursor` of the page before. */
  cursor: z.string().max(500).optional(),
});
export type RecordQuery = z.infer<typeof recordQuerySchema>;

export type RecordPage = {
  records: ExternalRecord[];
  /** Set when there are more records; ask again with it as `cursor`. */
  nextCursor?: string;
};

/**
 * What a provider's code gets to reach its system for one connection, built per request on the
 * server. Phase 2 adds the API base URL and the `Authorization` header value from the vault; a
 * provider never reads a secret, an env var or the database itself.
 */
export type ConnectionAccess = { connectionId: string };

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
  ): Promise<ExternalRecord[]>;
};

/** How a user connects. Phase 2 adds `token` and `basic`, phase 5 `oauth`. */
export type AuthMethod = { kind: "none" };

/**
 * A system the workspace can connect to. Code, not rows: one folder in ./providers/ and one line
 * in ../providers.ts. Capabilities are optional, so a provider has records, tools or both.
 */
export type Provider = {
  id: string;
  name: string;
  description: string;
  auth: readonly AuthMethod[];
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

/** One user's link to one provider account or site. Never holds a secret. */
export type Connection = {
  id: string;
  providerId: string;
  /** Who or what it is connected as: "@micha", "acme.atlassian.net", "Sample data". */
  accountLabel: string;
};
