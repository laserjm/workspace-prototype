// Browser-safe public API of the integrations module.
export type {
  AuthMethod,
  Connection,
  ExternalRecord,
  ProductPresentation,
  Provider,
  RecordPage,
  RecordPriority,
  RecordQuery,
  RecordReader,
  RecordStatus,
  SourceRef,
  SourceSummary,
} from "./contracts";
export {
  RECORD_PRIORITIES,
  RECORD_STATUSES,
  defineProvider,
  recordQuerySchema,
} from "./contracts";
