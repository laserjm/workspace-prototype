// The user's connections for unit tests that read sources without the compose Postgres. Swap it
// in for the integrations module's queries at the top of the test file:
//
//   vi.mock("@/modules/integrations/queries", () => import("@/tests/support/connections"));
//
// Every user then has the built-in sample connection and nothing stored, as before they connect
// anything. Connecting is tested against Postgres (integrations/actions.integration.test.ts).
import type { Connection } from "@/modules/integrations";

/** The same export as integrations/queries.ts: the sample connection alone. */
export async function listConnections(): Promise<Connection[]> {
  return [
    {
      id: "sample",
      providerId: "sample",
      accountLabel: "Sample data",
      builtIn: true,
      status: "active",
      baseUrl: "",
      scopes: [],
      expiresAt: null,
      lastVerifiedAt: null,
    },
  ];
}
