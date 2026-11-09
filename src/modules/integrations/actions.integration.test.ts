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
