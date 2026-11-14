import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyGithubToken } from "./api";

const access = {
  baseUrl: "https://api.github.com",
  authorization: "Bearer github_pat_test",
};

function answer(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyGithubToken", () => {
  it("asks GET /user with the token and names the account", async () => {
    const fetch = answer(
      200,
      { id: 583231, login: "octocat", name: "The Octocat" },
      { "github-authentication-token-expiration": "2026-12-05 10:31:01 UTC" },
    );
    expect(await verifyGithubToken(access)).toEqual({
      ok: true,
      value: {
        accountRef: "583231",
        accountLabel: "@octocat",
        scopes: [],
        expiresAt: new Date("2026-12-05T10:31:01Z"),
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer github_pat_test",
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      }),
    );
  });

  it("reads a classic token's scopes and an expiry with an offset", async () => {
    answer(
      200,
      { id: 1, login: "ana" },
      {
        "x-oauth-scopes": "repo, read:org",
        "github-authentication-token-expiration": "2026-12-05 10:31:01 +0100",
      },
    );
    const result = await verifyGithubToken(access);
    expect(result.ok && result.value).toMatchObject({
      scopes: ["repo", "read:org"],
      expiresAt: new Date("2026-12-05T09:31:01Z"),
    });
  });

  it("leaves out the expiry of a token that does not expire", async () => {
    answer(200, { id: 1, login: "ana" });
    const result = await verifyGithubToken(access);
    expect(result.ok && result.value).not.toHaveProperty("expiresAt");
  });

  it.each([401, 403])("refuses a token GitHub answers %i to", async (status) => {
    answer(status, { message: "Bad credentials" });
    expect(await verifyGithubToken(access)).toEqual({
      ok: false,
      error: { kind: "credential_rejected" },
    });
  });

  it.each<{ status: number; headers: Record<string, string> }>([
    { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1794830440" } },
    { status: 429, headers: { "retry-after": "40" } },
  ])("reports a rate limit ($status) as rate_limited, not as a refused token", async ({ status, headers }) => {
    answer(status, { message: "API rate limit exceeded" }, headers);
    expect(await verifyGithubToken(access)).toEqual({
      ok: false,
      error: { kind: "rate_limited", retryAt: expect.any(String) },
    });
  });

  it("says GitHub is unreachable on a server error, an odd answer or no answer", async () => {
    answer(502, {});
    expect(await verifyGithubToken(access)).toEqual({
      ok: false,
      error: { kind: "unreachable", status: 502 },
    });
    answer(200, { login: "no id" });
    expect(await verifyGithubToken(access)).toEqual({
      ok: false,
      error: { kind: "unreachable", status: 200 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await verifyGithubToken(access)).toEqual({
      ok: false,
      error: { kind: "unreachable" },
    });
  });
});
