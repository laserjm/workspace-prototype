// The optimistic check `proxy.ts` makes (Next.js: no database in Proxy). It only says whether a
// session cookie is present; `getUser()` decides whether the session is real.
import "server-only";
import { getSessionCookie } from "better-auth/cookies";

export function hasSessionCookie(request: Request): boolean {
  return getSessionCookie(request) !== null;
}
