// Reads a Postgres error for the actions: postgres.js puts the code and the constraint on the
// error, and Drizzle wraps it in `cause`.
import "server-only";

const CONSTRAINT_CODES = new Set(["23505", "23503", "23514", "23502", "23P01"]); // unique, fk, check, not-null, exclusion

type DriverError = { code: string; constraint?: unknown; constraint_name?: unknown };

/** The violated constraint's name, or undefined when the error is not a constraint violation. */
export function violatedConstraint(error: unknown): string | undefined {
  const e = driverError(error);
  if (!e || !CONSTRAINT_CODES.has(e.code)) return undefined;
  const name = e.constraint ?? e.constraint_name;
  return typeof name === "string" ? name : e.code;
}

function driverError(error: unknown, depth = 0): DriverError | undefined {
  if (!error || typeof error !== "object" || depth > 3) return undefined;
  if (
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code)
  )
    return error as DriverError;
  return "cause" in error ? driverError(error.cause, depth + 1) : undefined;
}
