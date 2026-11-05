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

export type SourceRecord = {
  id: string;
  title: string;
  type: string;
  status: RecordStatus;
  priority: RecordPriority;
  owner: string;
  description: string;
  summary: string;
  risk?: string;
  nextStep: string;
  updated: string;
};

/** An enterprise system and the records it exposes to a thread. */
export type Source = {
  id: string;
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
  records: SourceRecord[];
};

export function findSource(sources: readonly Source[], id: string) {
  return sources.find((source) => source.id === id);
}

/** The source's records whose ids are listed, in the source's order. */
export function recordsIn(source: Source, recordIds: readonly string[]) {
  return source.records.filter((record) => recordIds.includes(record.id));
}

export function allRecordIds(source: Source) {
  return source.records.map((record) => record.id);
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
