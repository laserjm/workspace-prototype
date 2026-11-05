// The HTTP side of sign-in: Better Auth's own endpoints (the Keycloak callback) and the two
// routes the app links to. Each answers with Better Auth's Set-Cookie headers.
import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { auth, KEYCLOAK_PROVIDER_ID } from "./auth";
import { sameOriginPath } from "./return-path";

/** What Better Auth's sign-in and sign-out endpoints answer with `disableRedirect`. */
const providerRedirectSchema = z.object({ url: z.url().optional() });

/** GET and POST /api/auth/*: the OAuth callback and session endpoints. */
export function handleAuthRequest(request: Request) {
  return auth().handler(request);
}

function redirectWithCookies(location: string, from: Response, status = 302) {
  const response = new Response(null, {
    status,
    headers: { Location: location },
  });
  for (const cookie of from.headers.getSetCookie())
    response.headers.append("Set-Cookie", cookie);
  return response;
}

/** GET /sign-in?returnTo=/path: starts the code flow and sends the browser to Keycloak. */
export async function startSignIn(request: Request) {
  const returnTo = sameOriginPath(
    new URL(request.url).searchParams.get("returnTo"),
    env.BETTER_AUTH_URL,
  );
  const response = await auth().api.signInSocial({
    body: {
      provider: KEYCLOAK_PROVIDER_ID,
      callbackURL: returnTo,
      disableRedirect: true,
    },
    headers: request.headers,
    asResponse: true,
  });
  const { url } = providerRedirectSchema.parse(
    await response.json().catch(() => ({})),
  );
  if (!response.ok || !url)
    return new Response("Sign-in is unavailable.", { status: 502 });
  return redirectWithCookies(url, response);
}

/**
 * POST /sign-out: deletes the session, then ends the Keycloak session (RP-initiated logout),
 * which returns the browser to "/" and so to a fresh sign-in.
 */
export async function signOut(request: Request) {
  const response = await auth().api.signOut({
    body: { callbackURL: "/", disableRedirect: true },
    headers: request.headers,
    asResponse: true,
  });
  const { url } = providerRedirectSchema.parse(
    await response.json().catch(() => ({})),
  );
  // No Keycloak session to end (already signed out): back to the start page.
  return redirectWithCookies(
    url ?? new URL("/", env.BETTER_AUTH_URL).toString(),
    response,
    303,
  );
}
