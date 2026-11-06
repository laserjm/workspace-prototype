import { z } from "zod";
import {
  RECORD_PRIORITIES,
  RECORD_STATUSES,
  type ExternalRecord,
  type SourceRef,
} from "@/modules/integrations";

// The record vocabulary is the integrations module's: its providers produce the records.
export { RECORD_PRIORITIES, RECORD_STATUSES };
export type { RecordPriority, RecordStatus } from "@/modules/integrations";
export type SourceRecord = ExternalRecord;

/** A collection of records in one of the user's connections, which a thread can attach. */
export type Source = {
  /** `<connectionId>:<sourceKey>`; see `sourceIdOf`. Threads store it. */
  id: string;
  connectionId: string;
  /** The mark `SourceIcon` draws, from the product's presentation. */
  icon: string;
  name: string;
  description: string;
  workspace: string;
  location: string;
  collection: string;
  /** Breadcrumb above the collection in the explorer, e.g. "SPACE / PLATFORM". */
  collectionPath: string;
  /** Heading of an overview built from this source's records. */
  overviewTitle: string;
  /** Label of the explorer's list view, e.g. "Pages". */
  listLabel: string;
  /** Whether the explorer offers a board grouped by status. */
  hasBoard: boolean;
  singular: string;
  plural: string;
};

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
      "Words to find in the id, title, description, summary, risk or next step, any case.",
    ),
});
export type SearchRecordsInput = z.infer<typeof searchRecordsInputSchema>;

export const recordMatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(RECORD_STATUSES),
  priority: z.enum(RECORD_PRIORITIES),
  owner: z.string(),
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
          record.description,
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
      priority,
      owner,
      updated,
    })),
  };
}
