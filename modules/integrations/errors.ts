import "server-only";
// The facts that stop connecting, testing or disconnecting. The adapters map them to copy; a
// remote refusal while reading records is a value instead (`RecordError`, docs/adr/0006).

/** No provider with this id, or none that offers this way to connect. */
export class ProviderNotFound extends Error {
  override readonly name = "ProviderNotFound";

  constructor(readonly providerId: string) {
    super(`No provider ${providerId} offers this way to connect`);
  }
}

/** Where the workspace will not send requests: an internal address, or a name that resolves nowhere. */
export class BaseUrlRefused extends Error {
  override readonly name = "BaseUrlRefused";

  constructor(
    readonly host: string,
    readonly reason: "missing" | "unresolved" | "loopback" | "private" | "link-local",
    readonly resolvedTo?: string,
  ) {
    super(`The base URL ${host} is refused: ${reason}`);
  }
}

/** The provider answered that the credential is not valid. */
export class CredentialRejected extends Error {
  override readonly name = "CredentialRejected";

  constructor(readonly providerName: string) {
    super(`${providerName} rejected the credential`);
  }
}

/** The provider could not be reached, or answered with something unexpected. */
export class ProviderUnreachable extends Error {
  override readonly name = "ProviderUnreachable";

  constructor(
    readonly providerName: string,
    readonly baseUrl: string,
    readonly status?: number,
  ) {
    super(`${providerName} at ${baseUrl} could not be reached (${status ?? "no answer"})`);
  }
}

/** The provider's rate limit is reached; the credential was not judged. `retryAt` is ISO 8601. */
export class ProviderRateLimited extends Error {
  override readonly name = "ProviderRateLimited";

  constructor(
    readonly providerName: string,
    readonly retryAt: string,
  ) {
    super(`${providerName}'s rate limit is reached until ${retryAt}`);
  }
}

/** Missing and not-owned look the same, so ownership isn't leaked. */
export class ConnectionNotFound extends Error {
  override readonly name = "ConnectionNotFound";

  constructor(readonly connectionId: string) {
    super(`Connection ${connectionId} not found`);
  }
}

/**
 * Every fact that stops connecting, testing or disconnecting. An adapter maps them with a
 * `switch` on `name` that ends in a `never` check, so a new class here fails to compile until
 * every adapter has said what it means. test/errors.test.ts checks that the list is complete.
 */
export const integrationErrors = [
  ProviderNotFound,
  BaseUrlRefused,
  CredentialRejected,
  ProviderUnreachable,
  ProviderRateLimited,
  ConnectionNotFound,
] as const;
export type IntegrationError = InstanceType<(typeof integrationErrors)[number]>;

/** Whether `error` is one of integrationErrors; anything else an adapter rethrows as a bug. */
export function isIntegrationError(error: unknown): error is IntegrationError {
  return integrationErrors.some((type) => error instanceof type);
}
