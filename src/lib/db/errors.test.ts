import { describe, expect, it } from "vitest";
import { violatedConstraint } from "./errors";

// postgres.js puts the code and the constraint's name on its error; Drizzle wraps it in `cause`.
const unique = { code: "23505", constraint_name: "projects_owner_id_name_key" };

describe("violatedConstraint", () => {
  it.each([
    { case: "a postgres.js error", error: unique },
    { case: "Drizzle's wrapper", error: { message: "Failed query", cause: unique } },
    {
      case: "an error that names it `constraint`",
      error: { code: "23505", constraint: "projects_owner_id_name_key" },
    },
  ])("names the constraint from $case", ({ error }) => {
    expect(violatedConstraint(error)).toBe("projects_owner_id_name_key");
  });

  it("falls back to the code when the driver names no constraint", () => {
    expect(violatedConstraint({ code: "23502" })).toBe("23502");
  });

  it.each([
    { case: "another Postgres error", error: { code: "42P01" } },
    { case: "an error without a code", error: new Error("connection refused") },
    { case: "a value that is not an error", error: undefined },
  ])("answers undefined for $case", ({ error }) => {
    expect(violatedConstraint(error)).toBeUndefined();
  });
});
