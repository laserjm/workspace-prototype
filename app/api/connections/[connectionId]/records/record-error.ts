// How the record routes answer a `RecordError`: a status, and `{ error: { kind, message, retryAt?, url? } }`
// with a message the browser can show as it is.
import type { RecordError } from "@/modules/integrations";

const STATUS: Record<RecordError["kind"], number> = {
  not_found: 404,
  no_access: 403,
  // Not 401, which here means the user's own session has ended.
  needs_reconnect: 409,
  rate_limited: 429,
  unreachable: 502,
  invalid_query: 422,
};

const MESSAGE: Record<Exclude<RecordError["kind"], "invalid_query">, string> = {
  not_found: "That is not there, or this connection cannot see it.",
  no_access: "This connection's token is not allowed to read that.",
  needs_reconnect: "The token was refused. Connect it again in Settings.",
  rate_limited: "The rate limit is reached. Try again shortly.",
  unreachable: "The provider could not be reached. Try again.",
};

/** The answer for `error`; `url`, the record's page, goes along when the refusal names one. */
export function recordErrorResponse(error: RecordError & { url?: string }): Response {
  const message = error.kind === "invalid_query" ? error.message : MESSAGE[error.kind];
  const retryAt = error.kind === "rate_limited" ? error.retryAt : undefined;
  const seconds = retryAt && Math.max(1, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000));
  return Response.json(
    {
      error: {
        kind: error.kind,
        message,
        ...(retryAt ? { retryAt } : {}),
        ...(error.url ? { url: error.url } : {}),
      },
    },
    {
      status: STATUS[error.kind],
      headers: {
        "Cache-Control": "private, no-store",
        ...(seconds ? { "Retry-After": String(seconds) } : {}),
      },
    },
  );
}
