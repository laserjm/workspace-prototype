import { describe, expect, it } from "vitest";
import { changeReferenceOf, fileNameOf, filePathOf } from "./links";

describe("changeReferenceOf", () => {
  it.each([
    ["https://github.com/laserjm/workspace-prototype/pull/20", "pull-request", "laserjm/workspace-prototype#20"],
    ["https://github.com/laserjm/workspace-prototype/pull/20/files#diff-1", "pull-request", "laserjm/workspace-prototype#20"],
    ["https://github.com/vercel/next.js/issues/42?x=1", "issue", "vercel/next.js#42"],
    ["https://gitlab.com/group/sub/project/-/merge_requests/7", "pull-request", "project!7"],
  ])("reads %s", (href, kind, label) => {
    expect(changeReferenceOf(href)).toEqual({ kind, label });
  });

  it.each([
    undefined,
    "https://github.com/laserjm/workspace-prototype",
    "https://github.com/laserjm/workspace-prototype/pulls",
    "http://github.com/a/b/pull/1",
    "https://github.com.evil.example/a/b/pull/1",
  ])("ignores %s", (href) => {
    expect(changeReferenceOf(href)).toBeNull();
  });
});

describe("filePathOf", () => {
  it.each([
    ["src/app/page.tsx", "src/app/page.tsx"],
    ["./README.md#setup", "./README.md"],
    ["/etc/hosts.conf", "/etc/hosts.conf"],
    ["file:///Users/me/My%20Notes.md", "/Users/me/My Notes.md"],
  ])("reads %s", (href, path) => {
    expect(filePathOf(href)).toBe(path);
  });

  it.each([
    undefined,
    "",
    "https://example.com/a.ts",
    "mailto:a@example.com",
    "//cdn.example.com/a.js",
    "#section",
    "/threads/123",
  ])("ignores %s", (href) => {
    expect(filePathOf(href)).toBeNull();
  });

  it("names a file by its last segment", () => {
    expect(fileNameOf("src/app/page.tsx")).toBe("page.tsx");
    expect(fileNameOf("/a/b/")).toBe("b");
  });
});
