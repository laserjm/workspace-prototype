import { describe, expect, it } from "vitest";
import { authorizationOf, credentialSchema, expiryLabel } from "./contracts";

describe("authorizationOf", () => {
  it("sends a token as Bearer", () => {
    expect(authorizationOf({ kind: "token", token: "github_pat_1" })).toBe(
      "Bearer github_pat_1",
    );
  });

  it("sends a username and password as HTTP Basic, UTF-8 encoded", () => {
    expect(
      authorizationOf({ kind: "basic", username: "jürgen", password: "pässword" }),
    ).toBe(`Basic ${Buffer.from("jürgen:pässword", "utf8").toString("base64")}`);
  });
});

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
