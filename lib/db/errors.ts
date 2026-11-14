// The one place that knows the driver's error codes. postgres.js puts the code and the
// constraint's name on its error, and Drizzle wraps it in `cause`. A command asks here and throws
// the fact that blocked the write; nothing else reads a driver error.
import "server-only";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

type DriverError = { code: string; constraint?: string };

/** A unique index or key refused the write; `constraint` narrows it to that one. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return violates(error, UNIQUE_VIOLATION, constraint);
}

/** A foreign key refused the write; `constraint` narrows it to that one. */
export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  return violates(error, FOREIGN_KEY_VIOLATION, constraint);
}

function violates(error: unknown, code: string, constraint?: string) {
  const e = driverError(error);
  return e?.code === code && (constraint === undefined || e.constraint === constraint);
}

function driverError(error: unknown, depth = 0): DriverError | undefined {
  if (!error || typeof error !== "object" || depth > 3) return undefined;
  if ("code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) {
    const name =
      ("constraint_name" in error && error.constraint_name) ||
      ("constraint" in error && error.constraint);
    return { code: error.code, constraint: typeof name === "string" ? name : undefined };
  }
  return "cause" in error ? driverError(error.cause, depth + 1) : undefined;
}

