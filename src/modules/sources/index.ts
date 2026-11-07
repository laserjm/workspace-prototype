// Browser-safe public API of the sources module.
export type {
  RecordMatch,
  RecordPage,
  RecordPriority,
  RecordQuery,
  RecordScope,
  RecordStatus,
  SearchRecordsInput,
  SearchRecordsOutput,
  Source,
  SourceRecord,
} from "./contracts";
export {
  RECORD_PRIORITIES,
  RECORD_STATUSES,
  recordQuerySchema,
  recordScopeSchema,
  searchRecordsInputSchema,
  searchRecordsOutputSchema,
  allRecordIds,
  countByStatus,
  findSource,
  hasRisk,
  recordCountLabel,
  recordsIn,
  sourceIdOf,
  sourceRefOf,
} from "./contracts";
export { RecordSearchCall } from "./components/record-search-call";
export { RecordStatusBadge } from "./components/record-status-badge";
export { SourceChoiceList } from "./components/source-choice-list";
export { SourceExplorer } from "./components/source-explorer";
export { SourceIcon } from "./components/source-icon";
export { SourcePicker } from "./components/source-picker";
export { SourceScopeDialog } from "./components/source-scope-dialog";
export { SourceScopeSummary } from "./components/source-scope-summary";
export { SourcesProvider } from "./components/sources-provider";
export { useSourceRecords, useSources } from "./components/use-sources";
