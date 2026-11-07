// GitHub's REST API, with every response parsed before it is used. Given a ProviderAccess; never
// reads a secret, an env var or the database (ADR 0002, "The pattern a provider author follows").
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  credentialRejected,
  providerUnreachable,
  type CredentialRejected,
  type ProviderAccess,
  type ProviderUnreachable,
  type VerifiedAccount,
} from "../../contracts";

const TIMEOUT_MS = 10_000;

/** GET from the API with the connection's credential. */
export function githubGet(path: string, { baseUrl, authorization }: ProviderAccess) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "workspace-prototype",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
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
): Promise<Result<VerifiedAccount, CredentialRejected | ProviderUnreachable>> {
  let response: Response;
  try {
    response = await githubGet("/user", access);
  } catch {
    return err(providerUnreachable(`GitHub at ${access.baseUrl} could not be reached.`));
  }
  if (response.status === 401 || response.status === 403)
    return err(
      credentialRejected(
        "GitHub did not accept this token. Check that it is complete and has not expired.",
      ),
    );
  if (!response.ok)
    return err(providerUnreachable(`GitHub answered with HTTP ${response.status}.`));
  const user = userSchema.safeParse(await response.json().catch(() => undefined));
  if (!user.success)
    return err(providerUnreachable("GitHub answered with something unexpected."));
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
