import "server-only";
// The facts that stop connecting, testing or disconnecting. The adapters map them to copy; a
// remote refusal while reading records is a value instead (`RecordError`, docs/adr/0006).

/** No provider with this id, or none that offers this way to connect. */
export class ProviderNotFound extends Error {
  constructor(readonly providerId: string) {
    super(`No provider ${providerId} offers this way to connect`);
    this.name = "ProviderNotFound";
  }
}

/** Where the workspace will not send requests: an internal address, or a name that resolves nowhere. */
export class BaseUrlRefused extends Error {
  constructor(
    readonly host: string,
    readonly reason: "missing" | "unresolved" | "loopback" | "private" | "link-local",
    readonly resolvedTo?: string,
  ) {
    super(`The base URL ${host} is refused: ${reason}`);
    this.name = "BaseUrlRefused";
  }
}

/** The provider answered that the credential is not valid. */
export class CredentialRejected extends Error {
  constructor(readonly providerName: string) {
    super(`${providerName} rejected the credential`);
    this.name = "CredentialRejected";
  }
}

/** The provider could not be reached, or answered with something unexpected. */
export class ProviderUnreachable extends Error {
  constructor(
    readonly providerName: string,
    readonly baseUrl: string,
    readonly status?: number,
  ) {
    super(`${providerName} at ${baseUrl} could not be reached (${status ?? "no answer"})`);
    this.name = "ProviderUnreachable";
  }
}

/** The provider's rate limit is reached; the credential was not judged. `retryAt` is ISO 8601. */
export class ProviderRateLimited extends Error {
  constructor(
    readonly providerName: string,
    readonly retryAt: string,
  ) {
    super(`${providerName}'s rate limit is reached until ${retryAt}`);
    this.name = "ProviderRateLimited";
  }
}

/** Missing and not-owned look the same, so ownership isn't leaked. */
export class ConnectionNotFound extends Error {
  constructor(readonly connectionId: string) {
    super(`Connection ${connectionId} not found`);
    this.name = "ConnectionNotFound";
  }
}
