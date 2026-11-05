import { describe, expect, it } from "vitest";
import type { Conflict, SignedOut, Unexpected } from "@/lib/errors";
import type { Unreachable } from "./define";
import { errorMessage } from "./messages";

type NameMissing = { readonly _tag: "NameMissing" };
type CreateError = NameMissing | Conflict | SignedOut | Unexpected | Unreachable;

const own = { NameMissing: "Give it a name." };

describe("errorMessage", () => {
  it("uses the module's message for its own error", () => {
    const error: CreateError = { _tag: "NameMissing" };
    expect(errorMessage(error, own)).toBe("Give it a name.");
  });

  it("has a message for each standard error", () => {
    const errors: CreateError[] = [
      { _tag: "Conflict", constraint: "projects_owner_id_name_key" },
      { _tag: "SignedOut" },
      { _tag: "Unreachable" },
    ];
    for (const error of errors)
      expect(errorMessage(error, own)).toMatch(/\w/);
  });

  it("names the trace id's start for Unexpected, so a report can be found in the log", () => {
    const error: CreateError = {
      _tag: "Unexpected",
      traceId: "9f86d081-884c-4d63-a5c2-0d6a4b3c1e2f",
    };
    expect(errorMessage(error, own)).toContain("9f86d081");
  });

  it("lets the module say it better for a standard error", () => {
    const error: CreateError = { _tag: "Conflict", constraint: "x" };
    expect(errorMessage(error, { ...own, Conflict: "Just added. Try again." })).toBe(
      "Just added. Try again.",
    );
  });

  it("needs no messages when every error is standard", () => {
    const error = { _tag: "SignedOut" } as SignedOut | Unreachable;
    expect(errorMessage(error)).toMatch(/sign in/);
  });

  it("asks the compiler for a message for each of the module's own errors", () => {
    const error: CreateError = { _tag: "NameMissing" };
    // @ts-expect-error NameMissing has no message
    errorMessage(error);
    // @ts-expect-error NameMissing has no message
    errorMessage(error, { Conflict: "Just added." });
    // @ts-expect-error Typo is not an error this action answers with
    errorMessage(error, { ...own, Typo: "?" });
  });
});
