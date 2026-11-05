import { describe, expect, it } from "vitest";
import { sameOriginPath } from "./return-path";

const app = "http://localhost:3000";

describe("sameOriginPath", () => {
  it("keeps a path on the app's origin, with its query and hash", () => {
    expect(sameOriginPath("/threads/t-1?view=board#r2", app)).toBe(
      "/threads/t-1?view=board#r2",
    );
  });

  it("falls back to the start page when there is nothing to return to", () => {
    expect(sameOriginPath(null, app)).toBe("/");
    expect(sameOriginPath("", app)).toBe("/");
  });

  it.each([
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "http://localhost:3001/",
  ])("refuses %s, which would leave the app", (value) => {
    expect(sameOriginPath(value, app)).toBe("/");
  });

  it("accepts an absolute URL on the app's own origin", () => {
    expect(sameOriginPath("http://localhost:3000/a?b=1", app)).toBe("/a?b=1");
  });
});
