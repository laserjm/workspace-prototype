export const RECORD_STATUSES = [
  "To do",
  "In progress",
  "In review",
  "Done",
] as const;

export type RecordStatus = (typeof RECORD_STATUSES)[number];
export type RecordPriority = "High" | "Medium" | "Low";

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
