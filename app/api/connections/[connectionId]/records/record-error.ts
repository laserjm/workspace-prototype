import "server-only";
// How the record routes answer: a refusal as a status with `{ error, refusal }` (the copy, and the
// `RecordReadRefusal` the view draws from, docs/adr/0006), and the session and bug cases every
// route handler answers.
import { SignedOut } from "@/lib/auth";
import type { RecordReadRefusal } from "@/modules/integrations/contracts";

const STATUS: Record<RecordReadRefusal["kind"], number> = {
  not_found: 404,
  no_access: 403,
  // Not 401, which here means the user's own session has ended.
  needs_reconnect: 409,
  rate_limited: 429,
  unreachable: 502,
  invalid_query: 422,
};

const MESSAGE: Record<Exclude<RecordReadRefusal["kind"], "invalid_query">, string> = {
  not_found: "That is not there, or this connection cannot see it.",
  no_access: "This connection's token is not allowed to read that.",
  needs_reconnect: "The token was refused. Connect it again in Settings.",
  rate_limited: "The rate limit is reached. Try again shortly.",
  unreachable: "The provider could not be reached. Try again.",
};

const noStore = { "Cache-Control": "private, no-store" };

/** The answer for a refusal; `url`, the record's page, goes along when the refusal names one. */
export function recordErrorResponse(refusal: RecordReadRefusal): Response {
  const error = refusal.kind === "invalid_query" ? refusal.message : MESSAGE[refusal.kind];
  const retryAt = refusal.kind === "rate_limited" ? refusal.retryAt : undefined;
  const seconds = retryAt && Math.max(1, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000));
  return Response.json(
    { error, refusal },
    {
      status: STATUS[refusal.kind],
      headers: { ...noStore, ...(seconds ? { "Retry-After": String(seconds) } : {}) },
    },
  );
}

/** A record the route read, never cached. */
export function recordResponse(value: unknown): Response {
  return Response.json(value, { headers: noStore });
}

/** What was thrown: a visitor is told to sign in, anything else is a bug, logged. */
export function thrownResponse(error: unknown): Response {
  if (error instanceof SignedOut)
    return Response.json({ error: "Sign in to continue." }, { status: 401, headers: noStore });
  console.error("[api/connections/records]", error);
  return Response.json(
    { error: "Something went wrong on the server. Try again in a moment." },
    { status: 500, headers: noStore },
  );
}
