// The user's connections for unit tests, without the compose Postgres. Swap it in for the
// integrations module's queries (and, for tests that reach a provider, its vault) at the top of
// the test file:
//
//   vi.mock("@/modules/integrations/queries", () => import("@/tests/support/connections"));
//   vi.mock("@/modules/integrations/vault", () => import("@/tests/support/connections"));
//
// Every user has the built-in sample connection. `connectedUser` also has one ordinary GitHub
// connection, `githubConnection`, whose credential is a fake token; answer its requests with
// `useRecordedGithub`. Connecting is tested against Postgres (integrations/actions.integration.test.ts).
import type { User } from "@/lib/auth/user";
import type { Connection, Credential } from "@/modules/integrations";
import { aUser } from "@/tests/factories/user";

export const connectedUser = aUser("ana");

const sampleConnection: Connection = {
  id: "sample",
  providerId: "sample",
  accountLabel: "Sample data",
  builtIn: true,
  status: "active",
  baseUrl: "",
  scopes: [],
  expiresAt: null,
  lastVerifiedAt: null,
};

const GITHUB_CONNECTION: Connection = {
  id: "8f0e1c5a-4b9d-4e2f-9a37-2c6d1e0b7f41",
  providerId: "github",
  accountLabel: "@laserjm",
  builtIn: false,
  status: "active",
  baseUrl: "https://api.github.com",
  scopes: [],
  expiresAt: null,
  lastVerifiedAt: new Date("2026-11-13T09:00:00Z"),
};

/** `connectedUser`'s GitHub connection, as stored now. */
export let githubConnection: Connection = GITHUB_CONNECTION;

/** Puts the GitHub connection back as it was; for tests that change it. */
export function resetConnections() {
  githubConnection = GITHUB_CONNECTION;
}

const ownsGithub = (user: User) => user.id === connectedUser.id;

/** The same export as integrations/queries.ts. */
export async function listConnections(user: User): Promise<Connection[]> {
  return ownsGithub(user) ? [sampleConnection, githubConnection] : [sampleConnection];
}

/** The same export as integrations/queries.ts. */
export async function markNeedsReconnect(user: User, connectionId: string) {
  if (ownsGithub(user) && connectionId === githubConnection.id)
    githubConnection = { ...githubConnection, status: "needs_reconnect" };
}

/** The same export as integrations/vault.ts: a fake token for the GitHub connection. */
export async function readCredential(
  userId: User["id"],
  connectionId: string,
): Promise<Credential | undefined> {
  return userId === connectedUser.id && connectionId === githubConnection.id
    ? { kind: "token", token: "github_pat_test" }
    : undefined;
}
