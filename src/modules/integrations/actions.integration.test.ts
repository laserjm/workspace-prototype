import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assertIsolation,
  describeIntegration,
} from "@/tests/support/integration";
import type { User } from "@/lib/auth/user";
import { db } from "@/lib/db/client";
import { connectionSecretsTable } from "@/lib/db/schema";
import { callAs } from "@/tests/support/session";
import { withUsers } from "@/tests/support/users";
import { aUser } from "@/tests/factories/user";
import { accessFor } from "./access";
import {
  connectAction,
  disconnectAction,
  testConnectionAction,
} from "./actions";
import { listConnections } from "./queries";

vi.mock("@/lib/auth/session", () => import("@/tests/support/session"));

/** Name resolution as the test sees it: which addresses a hostname resolves to. */
const names = vi.hoisted(() => new Map<string, string[]>());
vi.mock("node:dns/promises", () => {
  const lookup = async (hostname: string) => {
    const addresses = names.get(hostname);
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    return addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
  };
  return { lookup, default: { lookup } };
});

/** GitHub as the test sees it: which token belongs to whom, and whether it answers at all. */
const github = {
  accounts: new Map<string, { id: number; login: string }>(),
  down: false,
};

const token = (value: string) => ({ kind: "token" as const, token: value });
const connectGithub = (user: User | null, value: string, baseUrl?: string) =>
  callAs(user, connectAction, {
    providerId: "github",
    credential: token(value),
    ...(baseUrl ? { baseUrl } : {}),
  });
const stored = async (user: User) =>
  (await listConnections(user)).filter((connection) => !connection.builtIn);
const secretRows = (connectionId: string) =>
  db()
    .select()
    .from(connectionSecretsTable)
    .where(eq(connectionSecretsTable.connectionId, connectionId));

// The actions as the browser calls them, against the compose Postgres, with GitHub's /user
// answered here (ARCHITECTURE.md "Integration tests").
describeIntegration(
  "integrations actions",
  () => {
    const ana = aUser("test-integrations-ana");
    const ben = aUser("test-integrations-ben");
    withUsers(ana.id, ben.id);

    beforeEach(() => {
      github.accounts = new Map([
        ["tok-ana", { id: 1001, login: "ana" }],
        ["tok-ana-2", { id: 1001, login: "ana" }],
        ["tok-ben", { id: 2002, login: "ben" }],
      ]);
      github.down = false;
      names.clear();
      names.set("api.github.com", ["140.82.121.6"]);
      names.set("github.acme.test", ["198.51.100.7", "2001:db8::7"]);
      names.set("loop.acme.test", ["127.0.0.2"]);
      names.set("git.acme.test", ["10.0.0.7"]);
      names.set("meta.acme.test", ["fe80::a9fe:a9fe"]);
      names.set("mixed.acme.test", ["198.51.100.7", "fd00::7"]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          if (github.down) throw new TypeError("fetch failed");
          const authorization = new Headers(init.headers).get("authorization");
          const account = github.accounts.get(
            authorization?.replace("Bearer ", "") ?? "",
          );
          return account
            ? Response.json(account, {
                headers: {
                  "github-authentication-token-expiration":
                    "2027-01-31 12:00:00 UTC",
                },
              })
            : Response.json({ message: "Bad credentials" }, { status: 401 });
        }),
      );
    });

    afterEach(async () => {
      vi.unstubAllGlobals();
      for (const user of [ana, ben])
        for (const connection of await stored(user))
          await callAs(user, disconnectAction, { connectionId: connection.id });
    });

    it("connects with a token, lists the account and keeps the token only encrypted", async () => {
      const result = await connectGithub(ana, "tok-ana");
      expect(result).toEqual({
        ok: true,
        value: {
          id: expect.any(String),
          providerId: "github",
          accountLabel: "@ana",
          builtIn: false,
          status: "active",
          baseUrl: "https://api.github.com",
          scopes: [],
          expiresAt: new Date("2027-01-31T12:00:00Z"),
          lastVerifiedAt: expect.any(Date),
        },
      });
      const connection = result.ok ? result.value : undefined;
      expect(await stored(ana)).toEqual([connection]);
      expect(JSON.stringify(result)).not.toContain("tok-ana");

      const [secret] = await secretRows(connection!.id);
      expect(secret).toMatchObject({ userId: ana.id, keyVersion: expect.any(Number) });
      expect(JSON.stringify(secret)).not.toContain("tok-ana");
      expect(await accessFor(ana, connection!)).toEqual({
        connectionId: connection!.id,
        baseUrl: "https://api.github.com",
        authorization: "Bearer tok-ana",
      });
      // Bound to its owner: the same row read for another user is no credential at all.
      expect(await accessFor(ben, connection!)).toBeUndefined();
    });

    it("updates the connection when the same account connects again, with the new token", async () => {
      const first = await connectGithub(ana, "tok-ana");
      const again = await connectGithub(ana, "tok-ana-2");
      expect(again.ok && again.value.id).toBe(first.ok && first.value.id);
      const connections = await stored(ana);
      expect(connections).toHaveLength(1);
      expect(await accessFor(ana, connections[0]!)).toMatchObject({
        authorization: "Bearer tok-ana-2",
      });
    });

    it("refuses a token GitHub does not accept, and stores nothing", async () => {
      expect(await connectGithub(ana, "tok-wrong")).toEqual({
        ok: false,
        error: { _tag: "CredentialRejected", message: expect.any(String) },
      });
      expect(await stored(ana)).toEqual([]);
    });

    it("says when GitHub cannot be reached, and stores nothing", async () => {
      github.down = true;
      expect(await connectGithub(ana, "tok-ana")).toMatchObject({
        ok: false,
        error: { _tag: "ProviderUnreachable" },
      });
      expect(await stored(ana)).toEqual([]);
    });

    it.each([
      { name: "an unknown provider", providerId: "sharepoint" },
      { name: "the built-in sample", providerId: "sample" },
    ])("refuses $name", async ({ providerId }) => {
      expect(
        await callAs(ana, connectAction, { providerId, credential: token("tok-ana") }),
      ).toMatchObject({ ok: false, error: { _tag: "NotFound", entity: "Provider" } });
    });

    it("refuses a sign-in method the provider does not offer", async () => {
      expect(
        await callAs(ana, connectAction, {
          providerId: "github",
          credential: { kind: "basic", username: "ana", password: "secret" },
        }),
      ).toMatchObject({ ok: false, error: { _tag: "NotFound", entity: "Sign-in method" } });
    });

    it("refuses an address that is not HTTPS", async () => {
      expect(
        await connectGithub(ana, "tok-ana", "http://github.example.com/api/v3"),
      ).toMatchObject({
        ok: false,
        error: { _tag: "ValidationFailed", issues: [{ path: "baseUrl" }] },
      });
    });

    it.each([
      { name: "localhost", baseUrl: "https://localhost/api/v3" },
      { name: "a loopback IPv4 address", baseUrl: "https://127.0.0.1/api/v3" },
      { name: "a loopback IPv6 address", baseUrl: "https://[::1]/api/v3" },
      { name: "an RFC 1918 address (10/8)", baseUrl: "https://10.1.2.3" },
      { name: "an RFC 1918 address (172.16/12)", baseUrl: "https://172.20.0.1" },
      { name: "an RFC 1918 address (192.168/16)", baseUrl: "https://192.168.1.10" },
      { name: "a unique local IPv6 address", baseUrl: "https://[fd12:3456::1]" },
      { name: "a link-local IPv4 address", baseUrl: "https://169.254.169.254" },
      { name: "a link-local IPv6 address", baseUrl: "https://[fe80::1]" },
      { name: "an IPv4-mapped IPv6 loopback", baseUrl: "https://[::ffff:127.0.0.1]" },
      { name: "a hostname resolving to a loopback address", baseUrl: "https://loop.acme.test" },
      { name: "a hostname resolving to a private address", baseUrl: "https://git.acme.test" },
      { name: "a hostname resolving to a link-local address", baseUrl: "https://meta.acme.test" },
      {
        name: "a hostname with one private address among public ones",
        baseUrl: "https://mixed.acme.test/api/v3",
      },
      { name: "a hostname that does not resolve", baseUrl: "https://nowhere.acme.test" },
    ])("refuses $name as the address, and stores nothing", async ({ baseUrl }) => {
      expect(await connectGithub(ana, "tok-ana", baseUrl)).toEqual({
        ok: false,
        error: {
          _tag: "ValidationFailed",
          issues: [{ path: "baseUrl", message: expect.any(String) }],
        },
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(await stored(ana)).toEqual([]);
    });

    it("connects at a host on the internet, without following redirects", async () => {
      expect(
        await connectGithub(ana, "tok-ana", "https://github.acme.test/api/v3/"),
      ).toMatchObject({ ok: true, value: { baseUrl: "https://github.acme.test/api/v3" } });
      expect(fetch).toHaveBeenCalledWith(
        "https://github.acme.test/api/v3/user",
        expect.objectContaining({ redirect: "error" }),
      );
    });

    it("tests a connection: works, then needs reconnecting once GitHub refuses the token", async () => {
      const connected = await connectGithub(ana, "tok-ana");
      const connectionId = connected.ok ? connected.value.id : "";
      expect(await callAs(ana, testConnectionAction, { connectionId })).toMatchObject({
        ok: true,
        value: { status: "active" },
      });

      github.down = true;
      expect(await callAs(ana, testConnectionAction, { connectionId })).toMatchObject({
        ok: false,
        error: { _tag: "ProviderUnreachable" },
      });
      expect((await stored(ana))[0]?.status).toBe("active");

      github.down = false;
      github.accounts.delete("tok-ana");
      expect(await callAs(ana, testConnectionAction, { connectionId })).toMatchObject({
        ok: true,
        value: { status: "needs_reconnect" },
      });
    });

    it("disconnects: the connection and its credential are gone", async () => {
      const connected = await connectGithub(ana, "tok-ana");
      const connectionId = connected.ok ? connected.value.id : "";
      expect(await callAs(ana, disconnectAction, { connectionId })).toEqual({
        ok: true,
        value: { id: connectionId },
      });
      expect(await stored(ana)).toEqual([]);
      expect(await secretRows(connectionId)).toEqual([]);
      expect(await callAs(ana, disconnectAction, { connectionId })).toMatchObject({
        ok: false,
        error: { _tag: "NotFound" },
      });
    });

    it("refuses a visitor and stores nothing", async () => {
      expect(await connectGithub(null, "tok-ana")).toEqual({
        ok: false,
        error: { _tag: "SignedOut" },
      });
      expect(await stored(ana)).toEqual([]);
    });

    // Ben can neither see Ana's connection, nor test or disconnect it by its id.
    assertIsolation({
      name: "connectAction, listConnections, testConnectionAction, disconnectAction",
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: (owner) =>
        connectGithub(aUser(owner), owner === ana.id ? "tok-ana" : "tok-ben"),
      read: (owner) => stored(aUser(owner)),
      change: async (owner) => {
        for (const connection of await stored(ana)) {
          await callAs(aUser(owner), testConnectionAction, {
            connectionId: connection.id,
          });
          await callAs(aUser(owner), disconnectAction, {
            connectionId: connection.id,
          });
        }
      },
    });
  },
);
