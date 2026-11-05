// How a server action runs: sign the caller in, validate the input, run the handler, and turn
// anything thrown into `Unexpected`. Plain TypeScript with the user passed in, so the
// tests run it without a request; `server.ts` binds it to the session (ARCHITECTURE.md,
// "Server actions").
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import type { SignedOut, Unexpected, ValidationFailed } from "@/lib/errors";
import { err, ok, type Err, type Ok, type Result } from "@/lib/result";

/** What any action can answer with besides its own errors. */
export type ActionError = ValidationFailed | SignedOut | Unexpected;

/** The browser's own: the call never reached the server, or its answer never came back. */
export type Unreachable = { readonly _tag: "Unreachable" };

/** What a signed-in action answers: the handler's `Result`, or one of the action errors. */
export type ActionResult<T, E> = Result<T, E | ActionError>;

/** What a public action answers: like `ActionResult`, but it never needs a session. */
export type PublicActionResult<T, E> = Result<
  T,
  E | ValidationFailed | Unexpected
>;

// The value and error a handler answers with, read off its whole return type, so a command
// typed `Result<Thread, NotFound> | Err<Conflict>` keeps every error.
type AnyResult = Result<unknown, unknown>;
type ValueOf<R> = R extends Ok<infer T> ? T : never;
type ErrorOf<R> = R extends Err<infer E> ? E : never;

type Log = (traceId: string, error: unknown) => void;

const logToConsole: Log = (traceId, error) =>
  console.error(`[action] ${traceId}`, error);

export function createActions<User>({
  getUser,
  log = logToConsole,
}: {
  /** The signed-in caller, or null for a visitor. */
  getUser: () => Promise<User | null>;
  log?: Log;
}) {
  /** Logs what was thrown and answers `Unexpected`; Next.js's redirect and notFound pass. */
  function unexpected(error: unknown): Result<never, Unexpected> {
    unstable_rethrow(error);
    const traceId = crypto.randomUUID();
    log(traceId, error);
    return err({ _tag: "Unexpected", traceId });
  }

  /**
   * A server action for signed-in users. A visitor gets `SignedOut` before the input is read;
   * input that does not match `schema` gets `ValidationFailed`; the handler gets the parsed
   * input and the user and answers with a `Result`, which reaches the caller as is.
   *
   *   export const createProjectAction = action(createProjectInputSchema, (input, { user }) =>
   *     createProject(user, input),
   *   );
   */
  function action<Schema extends z.ZodType, R extends AnyResult>(
    schema: Schema,
    handler: (
      input: z.output<Schema>,
      context: { user: User },
    ) => Promise<R>,
  ): (input: z.input<Schema>) => Promise<ActionResult<ValueOf<R>, ErrorOf<R>>>;
  function action(
    schema: z.ZodType,
    handler: (input: unknown, context: { user: User }) => Promise<AnyResult>,
  ): (input: unknown) => Promise<AnyResult> {
    return async (input) => {
      try {
        const user = await getUser();
        if (!user) return err({ _tag: "SignedOut" });
        const parsed = validate(schema, input);
        if (!parsed.ok) return parsed;
        return await handler(parsed.value, { user });
      } catch (error) {
        return unexpected(error);
      }
    };
  }

  /** A server action anyone may call, visitors included. Name why it is public where it is used. */
  function publicAction<Schema extends z.ZodType, R extends AnyResult>(
    schema: Schema,
    handler: (input: z.output<Schema>) => Promise<R>,
  ): (
    input: z.input<Schema>,
  ) => Promise<PublicActionResult<ValueOf<R>, ErrorOf<R>>>;
  function publicAction(
    schema: z.ZodType,
    handler: (input: unknown) => Promise<AnyResult>,
  ): (input: unknown) => Promise<AnyResult> {
    return async (input) => {
      try {
        const parsed = validate(schema, input);
        if (!parsed.ok) return parsed;
        return await handler(parsed.value);
      } catch (error) {
        return unexpected(error);
      }
    };
  }

  return { action, publicAction };
}

function validate<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): Result<z.output<Schema>, ValidationFailed> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err({
    _tag: "ValidationFailed",
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}
