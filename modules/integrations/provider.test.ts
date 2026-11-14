import { describe, expect, it } from "vitest";
import { authorizationOf } from "./provider";

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
