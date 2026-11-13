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
  Provider,
  RateLimited,
  RecordDeclarations,
  RecordError,
  RecordFilter,
  RecordRead,
  RecordSearchHint,
  RecordSearchPage,
  RecordSearchQuery,
  RecordSummary,
  RecordTone,
  RecordTypeDeclaration,
} from "./contracts";
export {
  defineProvider,
  expiryLabel,
  pluralLabels,
  RECORD_TONES,
  toneOf,
  viewKindOf,
  waitLabel,
} from "./contracts";
export { IntegrationsProvider } from "./components/integrations-provider";
export { ProviderMark, RecordKindMark, RecordStateBadge } from "./components/record-marks";
export { RecordViewBody } from "./components/record-view-body";
export { SourcesSettingsPanel } from "./components/sources-settings-panel";
export { useIntegrations } from "./components/use-integrations";
