// Starter from @conventions/nextjs (isolation: owner) — NX-AUTH-01, adapted to Better Auth.
// The project owns this file. Each signed-in user owns their rows; there are no shared
// workspaces. Shared workspaces would make this `isolation: tenant`, recorded in ARCHITECTURE.md.
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { OwnerId, type OwnerRequester } from "@conventions/nextjs/core";
import { auth } from "./auth";

/** The request's session, read once per request however many callers ask. */
const currentSession = cache(async () => {
  // Headers first: during prerendering this is where rendering stops, before Better Auth is
  // built (and before it fetches Keycloak's discovery document).
  const requestHeaders = await headers();
  return auth().api.getSession({ headers: requestHeaders });
});

/** The signed-in caller from the request's session, or null for a visitor. */
export async function getRequester(): Promise<OwnerRequester | null> {
  const session = await currentSession();
  if (!session) return null;
  const { id } = session.user;
  return { kind: "user", userId: id, ownerId: OwnerId(id), roles: [] };
}

/** Who is signed in, for the UI. Null for a visitor. */
export async function getSignedInUser(): Promise<{
  name: string;
  email: string;
} | null> {
  const session = await currentSession();
  if (!session) return null;
  return { name: session.user.name, email: session.user.email };
}
