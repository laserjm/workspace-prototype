// Browser-safe public API of the sources module.
export type {
  GetRecordInput,
  GetRecordOutput,
  RecordComment,
  RecordMatch,
  RecordPage,
  RecordPriority,
  RecordQuery,
  RecordScope,
  RecordStatus,
  SearchRecordsInput,
  SearchRecordsOutput,
  Source,
  SourceAvailability,
  SourceRecord,
} from "./contracts";
export {
  MAX_SCOPE_RECORDS,
  RECORD_PRIORITIES,
  RECORD_STATUSES,
  getRecordInputSchema,
  getRecordOutputSchema,
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
  sourceAccessLabel,
  sourceIdOf,
  sourceOriginLabel,
  sourceRefOf,
  sourcesByOrigin,
  truncate,
  unavailableSource,
  updatedLabel,
} from "./contracts";
export { RecordReadCall } from "./components/record-read-call";
export { RecordSearchCall } from "./components/record-search-call";
export { RecordStatusBadge } from "./components/record-status-badge";
export { SourceChoiceList } from "./components/source-choice-list";
export { SourceExplorer } from "./components/source-explorer";
export { SourceIcon } from "./components/source-icon";
export { SourcePicker } from "./components/source-picker";
export { SourceScopeDialog } from "./components/source-scope-dialog";
export { SourceScopeSummary } from "./components/source-scope-summary";
export { SourcesProvider } from "./components/sources-provider";
export {
  useScopedRecords,
  useSourceRecords,
  useSources,
} from "./components/use-sources";
