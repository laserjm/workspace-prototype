import "server-only";
import type { User } from "@/lib/auth/user";
import {
  authorizationOf,
  type Connection,
  type ConnectionAccess,
} from "./contracts";
import { readCredential } from "./vault";

/**
 * What a connection's provider code is given for one request: the API address and the
 * `Authorization` header value, from the vault. None when the stored credential is missing.
 */
export async function accessFor(
  user: User,
  connection: Connection,
): Promise<ConnectionAccess | undefined> {
  const access = { connectionId: connection.id, baseUrl: connection.baseUrl };
  if (connection.builtIn) return access;
  const credential = await readCredential(user.id, connection.id);
  return credential && { ...access, authorization: authorizationOf(credential) };
}
