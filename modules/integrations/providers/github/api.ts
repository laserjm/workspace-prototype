// GitHub's REST API, with every response parsed before it is used. Given a ProviderAccess; never
// reads a secret, an env var or the database (ADR 0002, "The pattern a provider author follows").
import "server-only";
import { z } from "zod";
import {
  type RecordError,
} from "../../contracts";
import {
  type ProviderAccess,
  type VerifiedAccount,
  err,
  ok,
  type VerifyRefusal,
  type Answer,
} from "../../provider";

const TIMEOUT_MS = 10_000;
/** GitHub asks to wait at least a minute after a secondary rate limit without `retry-after`. */
const SECONDARY_LIMIT_WAIT_MS = 60_000;

/** GET from the API with the connection's credential. */
export function githubGet(path: string, { baseUrl, authorization }: ProviderAccess) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "workspace-prototype",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    // A redirect could lead to an address the connect check refused, so none is followed.
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * What a GitHub answer that is not OK means (ADR 0003 §3): 401 is a refused token, a 403 or 429
 * that says so is a rate limit, any other 403 a missing permission, 404 nothing there, 422 a
 * query GitHub could not run. Anything else is GitHub not answering properly.
 */
export async function classifyGithubAnswer(
  response: Response,
  now = Date.now(),
): Promise<RecordError> {
  const { status, headers } = response;
  if (status === 401) return { kind: "needs_reconnect" };
  if (status === 403 || status === 429) {
    const message = await messageOf(response);
    const retryAfter = Number(headers.get("retry-after"));
    const reset = Number(headers.get("x-ratelimit-reset"));
    if (headers.has("retry-after") && Number.isFinite(retryAfter))
      return rateLimitedUntil(now + retryAfter * 1000);
    if (headers.get("x-ratelimit-remaining") === "0")
      return rateLimitedUntil(
        Number.isFinite(reset) && reset > 0 ? reset * 1000 : now + SECONDARY_LIMIT_WAIT_MS,
      );
    if (status === 429 || /secondary rate limit/i.test(message))
      return rateLimitedUntil(now + SECONDARY_LIMIT_WAIT_MS);
    return { kind: "no_access" };
  }
  if (status === 404) return { kind: "not_found" };
  if (status === 422)
    return { kind: "invalid_query", message: (await messageOf(response)) || "GitHub could not run this search." };
  return { kind: "unreachable" };
}

const rateLimitedUntil = (time: number): RecordError => ({
  kind: "rate_limited",
  retryAt: new Date(time).toISOString(),
});

/** GitHub's `message`, and the first error's, when it sends them. */
async function messageOf(response: Response): Promise<string> {
  const body = z
    .object({
      message: z.string().optional(),
      errors: z.array(z.object({ message: z.string().optional() })).optional(),
    })
    .safeParse(await response.clone().json().catch(() => undefined));
  if (!body.success) return "";
  return [body.data.message, body.data.errors?.[0]?.message].filter(Boolean).join(": ");
}

const userSchema = z.object({ id: z.number(), login: z.string() });

/** `x-oauth-scopes: repo, read:org`: classic tokens only; a fine-grained token sends none. */
function scopesOf(header: string | null) {
  return (header ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

/** `github-authentication-token-expiration: 2026-12-05 10:31:01 UTC` (or `+0100`). */
function expiryOf(header: string | null): Date | undefined {
  const match = header?.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{2})(\d{2})?$/,
  );
  if (!match) return undefined;
  const [, day, time, zone, minutes] = match;
  const offset = zone === "UTC" ? "Z" : `${zone}:${minutes ?? "00"}`;
  const date = new Date(`${day}T${time}${offset}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Who the token belongs to (`GET /user`), its classic scopes and when it expires. */
export async function verifyGithubToken(
  access: ProviderAccess,
): Promise<Answer<VerifiedAccount, VerifyRefusal>> {
  let response: Response;
  try {
    response = await githubGet("/user", access);
  } catch {
    return err({ kind: "unreachable" });
  }
  if (!response.ok) {
    const error = await classifyGithubAnswer(response);
    if (error.kind === "needs_reconnect" || error.kind === "no_access")
      return err({ kind: "credential_rejected" });
    if (error.kind === "rate_limited") return err({ kind: "rate_limited", retryAt: error.retryAt });
    return err({ kind: "unreachable", status: response.status });
  }
  const user = userSchema.safeParse(await response.json().catch(() => undefined));
  if (!user.success) return err({ kind: "unreachable", status: response.status });
  const expiresAt = expiryOf(
    response.headers.get("github-authentication-token-expiration"),
  );
  return ok({
    accountRef: String(user.data.id),
    accountLabel: `@${user.data.login}`,
    scopes: scopesOf(response.headers.get("x-oauth-scopes")),
    ...(expiresAt ? { expiresAt } : {}),
  });
}
