// What to tell the user when an action refused. The standard errors have their message here;
// a module names its own errors' messages where it shows them, and the compiler asks for every
// one the action can answer with.
import type {
  Conflict,
  NotFound,
  SignedOut,
  Unexpected,
  ValidationFailed,
} from "@/lib/errors";
import type { Unreachable } from "./define";

type StandardError =
  | ValidationFailed
  | SignedOut
  | Unexpected
  | Unreachable
  | Conflict
  | NotFound;
type StandardTag = StandardError["_tag"];

const STANDARD_TAGS: ReadonlySet<string> = new Set<StandardTag>([
  "ValidationFailed",
  "SignedOut",
  "Unexpected",
  "Unreachable",
  "Conflict",
  "NotFound",
]);

type Tagged = { readonly _tag: string };

/** A message for each of the module's own errors, and optionally a better one for a standard error. */
export type ErrorMessages<E extends Tagged> = {
  [Tag in Exclude<E["_tag"], StandardTag>]: string;
} & { [Tag in Extract<E["_tag"], StandardTag>]?: string };

/**
 * The message for `error`. Pass a message for each of the action's own errors; the standard
 * ones have one already:
 *
 *   errorMessage(create.error, {
 *     ProjectNameMissing: "Give the project a name.",
 *     Conflict: "A project with this name was just added. Try again.",
 *   })
 */
export function errorMessage<E extends Tagged>(
  error: E,
  ...[messages]: [Exclude<E["_tag"], StandardTag>] extends [never]
    ? [messages?: ErrorMessages<E>]
    : [messages: ErrorMessages<E>]
): string {
  const own: Partial<Record<string, string>> = messages ?? {};
  const message = own[error._tag];
  if (message !== undefined) return message;
  if (isStandard(error)) return standardMessage(error);
  // Only reachable if a caller cast its way past the types.
  return "Something went wrong. Try again.";
}

function isStandard(error: Tagged): error is StandardError {
  return STANDARD_TAGS.has(error._tag);
}

function standardMessage(error: StandardError): string {
  switch (error._tag) {
    case "ValidationFailed":
      return "Check what you entered and try again.";
    case "SignedOut":
      return "Your session has ended. Taking you to sign in…";
    case "Unexpected":
      return `Something went wrong on our side. Try again. (Reference ${error.traceId.slice(0, 8)})`;
    case "Unreachable":
      return "The server could not be reached. Check your connection and try again.";
    case "Conflict":
      return "That changed somewhere else at the same time. Try again.";
    case "NotFound":
      return "That no longer exists.";
  }
}
