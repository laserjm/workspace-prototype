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
  RecordReadRefusal,
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
  invitedProvider,
  pluralLabels,
  RECORD_TONES,
  toneOf,
  viewKindOf,
  waitLabel,
} from "./contracts";
export type {
  GithubPullRequestDiffInput,
  GithubPullRequestDiffOutput,
} from "./providers/github/diff";
