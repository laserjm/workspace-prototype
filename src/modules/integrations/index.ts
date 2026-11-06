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
  RecordReader,
  SourceRef,
  SourceSummary,
} from "./contracts";
export { defineProvider, expiryLabel } from "./contracts";
export { IntegrationsProvider } from "./components/integrations-provider";
export { SourcesSettingsPanel } from "./components/sources-settings-panel";
export { useIntegrations } from "./components/use-integrations";
