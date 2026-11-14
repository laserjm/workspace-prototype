// Connecting, testing and disconnecting, against the test database, with GitHub's `GET /user`
// answered by recorded answers and name resolution answered here.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { connectionSecretsTable } from "@/lib/db/schema";
import { readSecret } from "@/lib/db/vault";
import { insertConnection, insertUser } from "@/test/factories";
import { useRecordedGithub, type RecordedAnswer } from "@/test/support/recorded-github";
import { connect, disconnect, testConnection } from "./commands";
import {
  BaseUrlRefused,
  ConnectionNotFound,
  CredentialRejected,
  ProviderNotFound,
  ProviderRateLimited,
  ProviderUnreachable,
} from "./errors";
import { getConnections } from "./queries";

/** Name resolution as the test sees it: which addresses a hostname resolves to. */
const names = vi.hoisted(() => new Map<string, string[]>());
vi.mock("node:dns/promises", () => {
  const lookup = async (hostname: string) => {
    const addresses = names.get(hostname);
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { lookup, default: { lookup } };
});

beforeEach(() => {
  names.clear();
  names.set("api.github.com", ["140.82.121.6"]);
  names.set("github.acme.test", ["198.51.100.7", "2001:db8::7"]);
  names.set("loop.acme.test", ["127.0.0.2"]);
  names.set("git.acme.test", ["10.0.0.7"]);
  names.set("meta.acme.test", ["fe80::a9fe:a9fe"]);
  names.set("mixed.acme.test", ["198.51.100.7", "fd00::7"]);
});

const USER = "GET /user";

/** GitHub's answer to `GET /user` for an account, with the token's expiry. */
const account = (id: number, login: string): RecordedAnswer => ({
  status: 200,
  headers: { "github-authentication-token-expiration": "2027-01-31 12:00:00 UTC" },
  body: { id, login },
});
const BAD_CREDENTIALS = { status: 401, body: { message: "Bad credentials" } };

const token = (value: string) => ({ kind: "token" as const, token: value });
const github = (value: string, baseUrl?: string) => ({
  providerId: "github",
  credential: token(value),
  ...(baseUrl ? { baseUrl } : {}),
});

/**
 * The stored secret row. Read directly: no use case answers a credential, so only the table shows
 * that it is kept encrypted.
 */
const secretRows = (connectionId: string) =>
  db()
    .select()
    .from(connectionSecretsTable)
    .where(eq(connectionSecretsTable.connectionId, connectionId));

describe("connect", () => {
  it("connects with a token, lists the account and keeps the token only encrypted", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    useRecordedGithub({ [USER]: account(1001, "ana") });

    const connection = await connect(owner, github("tok-ana"));

    expect(connection).toEqual({
      id: expect.any(String),
      providerId: "github",
      accountLabel: "@ana",
      status: "active",
      baseUrl: "https://api.github.com",
      scopes: [],
      expiresAt: new Date("2027-01-31T12:00:00Z"),
      lastVerifiedAt: expect.any(Date),
    });
    expect(await getConnections(owner)).toEqual([connection]);
    expect(JSON.stringify(connection)).not.toContain("tok-ana");
    const [secret] = await secretRows(connection.id);
    expect(secret).toMatchObject({ userId: owner.id, keyVersion: expect.any(Number) });
    expect(JSON.stringify(secret)).not.toContain("tok-ana");
    expect(await readSecret(owner.id, connection.id)).toEqual(token("tok-ana"));
    // Bound to its owner: the same row read for another user is no credential at all.
    expect(await readSecret(other.id, connection.id)).toBeUndefined();
  });

  it("asks GitHub with the token it was given", async () => {
    const owner = await insertUser();
    useRecordedGithub({ [USER]: account(1001, "ana") });

    await connect(owner, github("tok-ana"));

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok-ana" }),
      }),
    );
  });

  it("updates the connection when the same account connects again, with the new token", async () => {
    const owner = await insertUser();
    useRecordedGithub({ [USER]: account(1001, "ana") });
    const first = await connect(owner, github("tok-ana"));

    useRecordedGithub({ [USER]: account(1001, "ana-renamed") });
    const again = await connect(owner, github("tok-ana-2"));

    expect(again).toMatchObject({ id: first.id, accountLabel: "@ana-renamed" });
    expect(await getConnections(owner)).toEqual([again]);
    useRecordedGithub({ [USER]: account(1001, "ana-renamed") });
    await testConnection(owner, first.id);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok-ana-2" }),
      }),
    );
  });

  it("marks a connection that needed reconnecting active again", async () => {
    const owner = await insertUser();
    useRecordedGithub({ [USER]: account(1001, "ana") });
    const first = await connect(owner, github("tok-ana"));
    useRecordedGithub({ [USER]: BAD_CREDENTIALS });
    expect(await testConnection(owner, first.id)).toMatchObject({ status: "needs_reconnect" });

    useRecordedGithub({ [USER]: account(1001, "ana") });
    const again = await connect(owner, github("tok-ana-2"));

    expect(again).toMatchObject({ id: first.id, status: "active" });
  });

  it("gives someone else connecting the same account their own connection", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    useRecordedGithub({ [USER]: account(1001, "ana") });
    const mine = await connect(owner, github("tok-ana"));

    useRecordedGithub({ [USER]: account(1001, "ana") });
    const theirs = await connect(other, github("tok-ana-elsewhere"));

    expect(theirs.id).not.toBe(mine.id);
    expect(await getConnections(owner)).toEqual([mine]);
    expect(await readSecret(owner.id, mine.id)).toEqual(token("tok-ana"));
  });

  it("refuses a token GitHub does not accept, and stores nothing", async () => {
    const owner = await insertUser();
    useRecordedGithub({ [USER]: BAD_CREDENTIALS });

    await expect(connect(owner, github("tok-wrong"))).rejects.toThrow(CredentialRejected);
    expect(await getConnections(owner)).toEqual([]);
  });

  it("says when GitHub cannot be reached, and stores nothing", async () => {
    const owner = await insertUser();
    useRecordedGithub({ [USER]: new TypeError("fetch failed") });

    await expect(connect(owner, github("tok-ana"))).rejects.toThrow(ProviderUnreachable);
    expect(await getConnections(owner)).toEqual([]);
  });

  it("says when GitHub's rate limit is reached, and stores nothing", async () => {
    const owner = await insertUser();
    useRecordedGithub({
      [USER]: { status: 429, headers: { "retry-after": "30" }, body: { message: "Too many requests" } },
    });

    const refusal = connect(owner, github("tok-ana"));

    await expect(refusal).rejects.toThrow(ProviderRateLimited);
    await expect(refusal).rejects.toMatchObject({ retryAt: expect.any(String) });
    expect(await getConnections(owner)).toEqual([]);
  });

  it("refuses an unknown provider", async () => {
    const owner = await insertUser();
    const { requests } = useRecordedGithub({});

    await expect(
      connect(owner, { providerId: "sharepoint", credential: token("tok-ana") }),
    ).rejects.toThrow(ProviderNotFound);
    expect(requests).toEqual([]);
  });

  it("refuses a sign-in method the provider does not offer", async () => {
    const owner = await insertUser();
    const { requests } = useRecordedGithub({});

    await expect(
      connect(owner, {
        providerId: "github",
        credential: { kind: "basic", username: "ana", password: "secret" },
      }),
    ).rejects.toThrow(ProviderNotFound);
    expect(requests).toEqual([]);
    expect(await getConnections(owner)).toEqual([]);
  });

  it.each([
    { name: "localhost", baseUrl: "https://localhost/api/v3", reason: "loopback" },
    { name: "a loopback IPv4 address", baseUrl: "https://127.0.0.1/api/v3", reason: "loopback" },
    { name: "a loopback IPv6 address", baseUrl: "https://[::1]/api/v3", reason: "loopback" },
    { name: "an RFC 1918 address (10/8)", baseUrl: "https://10.1.2.3", reason: "private" },
    { name: "an RFC 1918 address (172.16/12)", baseUrl: "https://172.20.0.1", reason: "private" },
    { name: "an RFC 1918 address (192.168/16)", baseUrl: "https://192.168.1.10", reason: "private" },
    { name: "a unique local IPv6 address", baseUrl: "https://[fd12:3456::1]", reason: "private" },
    { name: "a link-local IPv4 address", baseUrl: "https://169.254.169.254", reason: "link-local" },
    { name: "a link-local IPv6 address", baseUrl: "https://[fe80::1]", reason: "link-local" },
    { name: "an IPv4-mapped IPv6 loopback", baseUrl: "https://[::ffff:127.0.0.1]", reason: "loopback" },
    { name: "a hostname resolving to a loopback address", baseUrl: "https://loop.acme.test", reason: "loopback" },
    { name: "a hostname resolving to a private address", baseUrl: "https://git.acme.test", reason: "private" },
    { name: "a hostname resolving to a link-local address", baseUrl: "https://meta.acme.test", reason: "link-local" },
    {
      name: "a hostname with one private address among public ones",
      baseUrl: "https://mixed.acme.test/api/v3",
      reason: "private",
    },
    { name: "a hostname that does not resolve", baseUrl: "https://nowhere.acme.test", reason: "unresolved" },
  ])("refuses $name as the address, and stores nothing", async ({ baseUrl, reason }) => {
    const owner = await insertUser();
    const { requests } = useRecordedGithub({});

    const refusal = connect(owner, github("tok-ana", baseUrl));

    await expect(refusal).rejects.toThrow(BaseUrlRefused);
    await expect(refusal).rejects.toMatchObject({ reason });
    expect(requests).toEqual([]);
    expect(await getConnections(owner)).toEqual([]);
  });

  describe("at a host on the internet", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("connects there, without following redirects", async () => {
      const owner = await insertUser();
      // Not GitHub's own address, which the recorded answers are for.
      const answer = vi.fn(async () => Response.json({ id: 1001, login: "ana" }));
      vi.stubGlobal("fetch", answer);

      const connection = await connect(owner, github("tok-ana", "https://github.acme.test/api/v3/"));

      expect(connection).toMatchObject({ baseUrl: "https://github.acme.test/api/v3" });
      expect(answer).toHaveBeenCalledWith(
        "https://github.acme.test/api/v3/user",
        expect.objectContaining({ redirect: "error" }),
      );
    });
  });
});

describe("testConnection", () => {
  it("records that the credential works, with what GitHub says of it now", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner, { accountLabel: "@old-name" });
    useRecordedGithub({ [USER]: account(1001, "laserjm") });

    const tested = await testConnection(owner, connection.id);

    expect(tested).toEqual({
      ...connection,
      accountLabel: "@laserjm",
      status: "active",
      expiresAt: new Date("2027-01-31T12:00:00Z"),
      lastVerifiedAt: expect.any(Date),
    });
    expect(tested.lastVerifiedAt).not.toEqual(connection.lastVerifiedAt);
    expect(await getConnections(owner)).toEqual([tested]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer github_pat_test" }),
      }),
    );
  });

  it("marks the connection needs_reconnect once GitHub refuses the token", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);
    useRecordedGithub({ [USER]: BAD_CREDENTIALS });

    expect(await testConnection(owner, connection.id)).toMatchObject({ status: "needs_reconnect" });
    expect(await getConnections(owner)).toMatchObject([{ status: "needs_reconnect" }]);
  });

  it("throws and changes nothing when GitHub cannot be reached", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);
    useRecordedGithub({ [USER]: new TypeError("fetch failed") });

    await expect(testConnection(owner, connection.id)).rejects.toThrow(ProviderUnreachable);
    expect(await getConnections(owner)).toEqual([connection]);
  });

  it("throws and changes nothing when GitHub's rate limit is reached", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);
    useRecordedGithub({
      [USER]: {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1794830440" },
        body: { message: "API rate limit exceeded" },
      },
    });

    await expect(testConnection(owner, connection.id)).rejects.toThrow(ProviderRateLimited);
    expect(await getConnections(owner)).toEqual([connection]);
  });

  it("refuses someone else's connection, without asking GitHub, and changes nothing", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const connection = await insertConnection(owner);
    const { requests } = useRecordedGithub({});

    await expect(testConnection(other, connection.id)).rejects.toThrow(ConnectionNotFound);
    expect(requests).toEqual([]);
    expect(await getConnections(owner)).toEqual([connection]);
  });

  it.each(["no-such-connection", "00000000-0000-4000-8000-000000000000"])(
    "refuses the id %s as not found",
    async (connectionId) => {
      const owner = await insertUser();
      await insertConnection(owner);

      await expect(testConnection(owner, connectionId)).rejects.toThrow(ConnectionNotFound);
    },
  );
});

describe("disconnect", () => {
  it("removes the connection and its credential", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);

    expect(await disconnect(owner, connection.id)).toEqual({ id: connection.id });
    expect(await getConnections(owner)).toEqual([]);
    expect(await secretRows(connection.id)).toEqual([]);
  });

  it("refuses a connection already removed", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);
    await disconnect(owner, connection.id);

    await expect(disconnect(owner, connection.id)).rejects.toThrow(ConnectionNotFound);
  });

  it("refuses someone else's connection, and changes nothing", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const connection = await insertConnection(owner);

    await expect(disconnect(other, connection.id)).rejects.toThrow(ConnectionNotFound);
    expect(await getConnections(owner)).toEqual([connection]);
    expect(await readSecret(owner.id, connection.id)).toEqual(token("github_pat_test"));
  });

  it("refuses a malformed id", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);

    await expect(disconnect(owner, "no-such-connection")).rejects.toThrow(ConnectionNotFound);
    expect(await getConnections(owner)).toEqual([connection]);
  });
});
