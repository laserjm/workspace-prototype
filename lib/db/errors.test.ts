import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "./errors";

// postgres.js puts the code and the constraint's name on its error; Drizzle wraps it in `cause`.
const unique = { code: "23505", constraint_name: "projects_user_id_name_key" };

describe("isUniqueViolation", () => {
  it.each([
    { case: "a postgres.js error", error: unique },
    { case: "Drizzle's wrapper", error: { message: "Failed query", cause: unique } },
    {
      case: "an error that names it `constraint`",
      error: { code: "23505", constraint: "projects_user_id_name_key" },
    },
  ])("recognizes $case", ({ error }) => {
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, "projects_user_id_name_key")).toBe(true);
    expect(isUniqueViolation(error, "threads_pkey")).toBe(false);
  });

  it.each([
    { case: "a foreign key violation", error: { code: "23503" } },
    { case: "another Postgres error", error: { code: "42P01" } },
    { case: "an error without a code", error: new Error("connection refused") },
    { case: "a value that is not an error", error: undefined },
  ])("is false for $case", ({ error }) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("recognizes 23503 and its constraint", () => {
    const error = { cause: { code: "23503", constraint_name: "threads_project_fk" } };
    expect(isForeignKeyViolation(error)).toBe(true);
    expect(isForeignKeyViolation(error, "threads_project_fk")).toBe(true);
    expect(isUniqueViolation(error)).toBe(false);
  });
});
