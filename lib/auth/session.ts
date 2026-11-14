// Who is signed in, from the request's session (ARCHITECTURE.md "Sign-in"). The only place that
// reads it: actions get the user from `action(…)`, pages and route handlers call `getUser()`,
// and queries and writes take the user as their first argument.
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { UserId, type User } from "./user";

/**
 * The signed-in user, or null for a visitor. Better Auth checks the session against the
 * database; `cache` makes that one lookup per request however many callers ask.
 */
export const getUser = cache(async (): Promise<User | null> => {
  // Headers first: during prerendering this is where rendering stops, before Better Auth is
  // built (and before it fetches Keycloak's discovery document).
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id: UserId(id), name, email };
});
