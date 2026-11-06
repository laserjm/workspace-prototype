import { z } from "zod";
import type { SourceRef } from "@/modules/integrations";

export const RECORD_STATUSES = [
  "To do",
  "In progress",
  "In review",
  "Done",
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const RECORD_PRIORITIES = ["High", "Medium", "Low"] as const;
export type RecordPriority = (typeof RECORD_PRIORITIES)[number];

/**
 * A record of a source: a ticket, an issue, a page, a test case. A provider's reader produces it
 * (integrations module, which imports this as a type). Only what every system has is required.
 */
export type SourceRecord = {
  /** Unique within its source, and how it is cited: "PLAT-124", "#42". */
  id: string;
  title: string;
  /** "Story", "Issue", "Pull request". */
  type: string;
  /** The system's status mapped onto the workspace's four categories. */
  status: RecordStatus;
  /** The system's own status, where it says more than the category: "Merged", "Draft". */
  statusLabel?: string;
  priority?: RecordPriority;
  owner?: string;
  /** Plain text or Markdown, as the system holds it. */
  description: string;
  /** The record in its own system. */
  url?: string;
  /** When it last changed: an ISO timestamp, or the sample data's label ("Today, 10:42"). */
  updated: string;
  /** Further facts the system has, by label: "Author", "Labels". Shown and given to the agent. */
  fields?: Readonly<Record<string, string>>;
  /** Written by hand for the sample data; a live system has none of these three. */
  summary?: string;
  risk?: string;
  nextStep?: string;
};

/** A comment on a record, oldest first. */
export type RecordComment = { author: string; body: string; created: string };

/** What a page of a source's records is asked for. Every field is optional. */
export const recordQuerySchema = z.object({
  text: z.string().max(200).optional(),
  /** The `nextCursor` of the page before. */
  cursor: z.string().max(500).optional(),
});
export type RecordQuery = z.infer<typeof recordQuerySchema>;

export type RecordPage = {
  records: SourceRecord[];
  /** Set when there are more records; ask again with it as `cursor`. */
  nextCursor?: string;
};

/**
 * How a source's records are read: a bundled `snapshot` (the sample), `live` from the system with
 * the user's connection, or `unavailable` because the connection is gone or cannot be reached.
 */
export type SourceAvailability = "snapshot" | "live" | "unavailable";

/** A collection of records in one of the user's connections, which a thread can attach. */
export type Source = {
  /** `<connectionId>:<sourceKey>`; see `sourceIdOf`. Threads store it. */
  id: string;
  connectionId: string;
  /** The provider's name: "GitHub", "Sample data". */
  system: string;
  /** Who the connection is: "@micha"; the sample's is "Sample data". */
  account: string;
  availability: SourceAvailability;
  /** The mark `SourceIcon` draws, from the product's presentation. */
  icon: string;
  name: string;
  description: string;
  workspace: string;
  location: string;
  collection: string;
  /** Breadcrumb above the collection in the explorer, e.g. "SPACE / PLATFORM". */
  collectionPath: string;
  /** Label of the explorer's list view, e.g. "Pages". */
  listLabel: string;
  /** Whether the explorer offers a board grouped by status. */
  hasBoard: boolean;
  singular: string;
  plural: string;
};

/**
 * What a thread shows for a source the user no longer has: its connection was removed, or its
 * system did not answer when the page loaded. The thread keeps its scope; nothing is read.
 */
export function unavailableSource(id: string): Source {
  return {
    id,
    connectionId: sourceRefOf(id)?.connectionId ?? "",
    system: "",
    account: "",
    availability: "unavailable",
    icon: "unavailable",
    name: "Unavailable source",
    description: "Its connection was removed or could not be reached.",
    workspace: "Not connected",
    location: "",
    collection: "Unavailable source",
    collectionPath: "",
    listLabel: "List",
    hasBoard: false,
    singular: "record",
    plural: "records",
  };
}

/** Where a source comes from, for a badge or a group heading: "GitHub · @micha", "Sample data". */
export function sourceOriginLabel(source: Source) {
  if (source.availability === "live")
    return `${source.system} · ${source.account}`;
  return source.availability === "snapshot" ? source.system : "Not connected";
}

/** How the thread reads the records: "Read live from GitHub", "Read-only sample snapshot". */
export function sourceAccessLabel(source: Source) {
  if (source.availability === "live") return `Read live from ${source.system}`;
  return source.availability === "snapshot"
    ? "Read-only sample snapshot"
    : "Source no longer connected";
}

/** The sources in groups of one connection each, in the order they come. */
export function sourcesByOrigin(sources: readonly Source[]) {
  const groups = new Map<string, { origin: string; sources: Source[] }>();
  for (const source of sources) {
    const group = groups.get(source.connectionId) ?? {
      origin: sourceOriginLabel(source),
      sources: [],
    };
    group.sources.push(source);
    groups.set(source.connectionId, group);
  }
  return [...groups.values()];
}

/** "Today, 10:42" stays as it is; an ISO timestamp becomes "6 Nov 2026, 08:30" in the reader's zone. */
export function updatedLabel(updated: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(updated)) return updated;
  const date = new Date(updated);
  return Number.isNaN(date.getTime())
    ? updated
    : date.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** A source's id: its connection and its key there, e.g. "sample:jira". */
export function sourceIdOf({ connectionId, sourceKey }: SourceRef) {
  return `${connectionId}:${sourceKey}`;
}

/** The connection and key a source id names; `undefined` for an id that names neither. */
export function sourceRefOf(sourceId: string): SourceRef | undefined {
  const colon = sourceId.indexOf(":");
  if (colon <= 0 || colon === sourceId.length - 1) return undefined;
  return {
    connectionId: sourceId.slice(0, colon),
    sourceKey: sourceId.slice(colon + 1),
  };
}

export function findSource(sources: readonly Source[], id: string) {
  return sources.find((source) => source.id === id);
}

/** The records whose ids are listed, in the records' order. */
export function recordsIn(
  records: readonly SourceRecord[],
  recordIds: readonly string[],
) {
  return records.filter((record) => recordIds.includes(record.id));
}

export function allRecordIds(records: readonly SourceRecord[]) {
  return records.map((record) => record.id);
}

/** "1 ticket", "5 tickets". */
export function recordCountLabel(source: Source, count: number) {
  return `${count} ${count === 1 ? source.singular : source.plural}`;
}

export function hasRisk(record: SourceRecord) {
  return Boolean(record.risk);
}

export function countByStatus(records: readonly SourceRecord[]) {
  return RECORD_STATUSES.map((status) => ({
    status,
    count: records.filter((record) => record.status === status).length,
  }));
}

/** The most records one thread attaches; what a message's options allow. */
export const MAX_SCOPE_RECORDS = 100;

/** Records a thread attached, by id: what the `search_records` tool may read. */
export const recordScopeSchema = z.object({
  sourceId: z.string(),
  recordIds: z.array(z.string()),
});
export type RecordScope = z.infer<typeof recordScopeSchema>;

/** What the model may ask `search_records` for. Every filter is optional; all given must match. */
export const searchRecordsInputSchema = z.object({
  status: z.enum(RECORD_STATUSES).optional(),
  priority: z.enum(RECORD_PRIORITIES).optional(),
  owner: z
    .string()
    .max(100)
    .optional()
    .describe("Part of the owner's name, any case."),
  text: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Words to find in the id, title, status, description, fields, summary, risk or next step, any case.",
    ),
});
export type SearchRecordsInput = z.infer<typeof searchRecordsInputSchema>;

export const recordMatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(RECORD_STATUSES),
  priority: z.enum(RECORD_PRIORITIES).optional(),
  owner: z.string().optional(),
  updated: z.string(),
});
export type RecordMatch = z.infer<typeof recordMatchSchema>;

export const searchRecordsOutputSchema = z.object({
  /** How many records the search looked at: the thread's attached ones. */
  searched: z.number(),
  matches: z.array(recordMatchSchema),
});
export type SearchRecordsOutput = z.infer<typeof searchRecordsOutputSchema>;

const contains = (value: string | undefined, part: string) =>
  value?.toLowerCase().includes(part.toLowerCase()) ?? false;

/** The records that match every filter given, in the records' order. */
export function searchRecords(
  records: readonly SourceRecord[],
  { status, priority, owner, text }: SearchRecordsInput,
): SearchRecordsOutput {
  const matches = records.filter(
    (record) =>
      (!status || record.status === status) &&
      (!priority || record.priority === priority) &&
      (!owner?.trim() || contains(record.owner, owner.trim())) &&
      (!text?.trim() ||
        [
          record.id,
          record.title,
          record.statusLabel,
          record.description,
          ...Object.values(record.fields ?? {}),
          record.summary,
          record.risk,
          record.nextStep,
        ].some((field) => contains(field, text.trim()))),
  );
  return {
    searched: records.length,
    matches: matches.map(({ id, title, status, priority, owner, updated }) => ({
      id,
      title,
      status,
      ...(priority ? { priority } : {}),
      ...(owner ? { owner } : {}),
      updated,
    })),
  };
}

/** The longest description and comment `get_record` hands the model; the rest is cut. */
export const RECORD_TEXT_LIMIT = 20_000;
export const COMMENT_TEXT_LIMIT = 4_000;
/** How many of the latest comments `get_record` reads. */
export const COMMENT_LIMIT = 20;

/** `text` cut to `limit` characters, saying so. */
export function truncate(text: string, limit: number) {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n\n[… cut after ${limit} characters]`;
}

/** What the model asks `get_record` for: one attached record. */
export const getRecordInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .describe("The id of an attached record, as the context lists it, e.g. #42."),
});
export type GetRecordInput = z.infer<typeof getRecordInputSchema>;

/** One attached record in full, with its latest comments. */
export const getRecordOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.enum(RECORD_STATUSES),
  statusLabel: z.string().optional(),
  priority: z.enum(RECORD_PRIORITIES).optional(),
  owner: z.string().optional(),
  url: z.string().optional(),
  updated: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
  description: z.string(),
  comments: z.array(
    z.object({ author: z.string(), body: z.string(), created: z.string() }),
  ),
});
export type GetRecordOutput = z.infer<typeof getRecordOutputSchema>;
