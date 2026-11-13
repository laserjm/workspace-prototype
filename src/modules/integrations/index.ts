// Browser-safe public API of the integrations module.
export type {
  AuthMethod,
  ConnectInput,
  Connection,
  ConnectionStatus,
  Credential,
  CredentialKind,
  CredentialRejected,
  ProviderChoice,
  ProviderUnreachable,
  ProductPresentation,
  Provider,
  RateLimited,
  RecordDeclarations,
  RecordError,
  RecordFilter,
  RecordReader,
  RecordSearchHint,
  RecordSearchPage,
  RecordSearchQuery,
  RecordSummary,
  RecordTone,
  RecordTypeDeclaration,
  SourceRef,
  SourceSummary,
} from "./contracts";
export {
  defineProvider,
  expiryLabel,
  pluralLabels,
  RECORD_TONES,
  toneOf,
  waitLabel,
} from "./contracts";
export { IntegrationsProvider } from "./components/integrations-provider";
export { ProviderMark, RecordKindMark } from "./components/record-marks";
export { SourcesSettingsPanel } from "./components/sources-settings-panel";
export { useIntegrations } from "./components/use-integrations";
