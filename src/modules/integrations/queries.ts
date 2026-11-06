import "server-only";
import type { User } from "@/lib/auth/user";
import type { Connection } from "./contracts";

/** The built-in connection to the sample provider, which every user has. Stored nowhere. */
const sampleConnection: Connection = {
  id: "sample",
  providerId: "sample",
  accountLabel: "Sample data",
};

/**
 * The user's connections. Until connections are stored (ADR 0002, phase 2) that is the sample
 * connection alone, the same for everyone; the user is already the first argument, as for every
 * query on owned data.
 */
export async function listConnections(user: User): Promise<Connection[]> {
  void user;
  return [sampleConnection];
}
