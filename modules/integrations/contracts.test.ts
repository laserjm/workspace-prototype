import { describe, expect, it } from "vitest";
import {
  connectInput,
  connectionInput,
  credentialSchema,
  expiryLabel,
  invitedProvider,
  type ProviderChoice,
} from "./contracts";

describe("credentialSchema", () => {
  it("trims a token and refuses an empty one", () => {
    expect(credentialSchema.parse({ kind: "token", token: "  abc \n" })).toEqual({
      kind: "token",
      token: "abc",
    });
    expect(credentialSchema.safeParse({ kind: "token", token: "   " }).success).toBe(
      false,
    );
  });
});

describe("expiryLabel", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  it.each([
    { expiresAt: "2026-11-29T12:00:00Z", label: "Expires in 23 days" },
    { expiresAt: "2026-11-07T09:00:00Z", label: "Expires today" },
    { expiresAt: "2026-11-06T11:00:00Z", label: "Expired" },
  ])("says $label", ({ expiresAt, label }) => {
    expect(expiryLabel(new Date(expiresAt), now)).toBe(label);
  });
});

describe("invitedProvider", () => {
  const choice = (id: string, withRecords: boolean): ProviderChoice => ({
    id,
    name: id,
    description: "",
    auth: [{ kind: "token", label: "Token", help: "" }],
    baseUrl: { label: "API URL" },
    ...(withRecords
      ? { records: { types: {}, filters: [], hint: { idle: "", typing: "" } } }
      : {}),
  });

  it("invites the first provider that holds records", () => {
    expect(
      invitedProvider([choice("stripe", false), choice("github", true), choice("jira", true)])
        ?.id,
    ).toBe("github");
  });

  it("invites none when no provider holds records", () => {
    expect(invitedProvider([choice("stripe", false)])).toBeUndefined();
  });
});

describe("connectInput", () => {
  const token = { kind: "token", token: "github_pat_1" } as const;

  it("takes an HTTPS address, or none for the provider's default", () => {
    expect(
      connectInput.safeParse({ providerId: "github", baseUrl: "https://github.example.com/api/v3", credential: token })
        .success,
    ).toBe(true);
    expect(connectInput.safeParse({ providerId: "github", credential: token }).success).toBe(true);
  });

  it("refuses an address that is not HTTPS", () => {
    const parsed = connectInput.safeParse({
      providerId: "github",
      baseUrl: "http://github.example.com/api/v3",
      credential: token,
    });
    expect(parsed.error?.issues).toMatchObject([{ path: ["baseUrl"] }]);
  });
});

describe("connectionInput", () => {
  it("refuses an id that is not a UUID", () => {
    expect(connectionInput.safeParse({ connectionId: "no-such-connection" }).success).toBe(false);
  });
});
