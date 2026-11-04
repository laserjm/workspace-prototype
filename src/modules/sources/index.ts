// Browser-safe public API of the sources module.
export type {
  RecordPriority,
  RecordStatus,
  Source,
  SourceRecord,
} from "./domain/source";
export {
  RECORD_STATUSES,
  allRecordIds,
  countByStatus,
  findSource,
  hasRisk,
  recordCountLabel,
  recordsIn,
} from "./domain/source";
export { RecordStatusBadge } from "./components/record-status-badge";
export { SourceChoiceList } from "./components/source-choice-list";
export { SourceExplorer } from "./components/source-explorer";
export { SourceIcon } from "./components/source-icon";
export { SourcePicker } from "./components/source-picker";
export { SourceScopeDialog } from "./components/source-scope-dialog";
export { SourceScopeSummary } from "./components/source-scope-summary";
export { SourcesProvider } from "./components/sources-provider";
export { useSources } from "./components/use-sources";
