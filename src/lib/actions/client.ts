"use client";
// Calling a server action from the browser. `callAction` never throws: a call that does not
// reach the server answers `Unreachable`, and `SignedOut` sends the browser to sign in and back
// to this page, so no component handles an ended session itself.
import { useState, useTransition } from "react";
import type { SignedOut } from "@/lib/errors";
import { err, type Result } from "@/lib/result";
import type { Unreachable } from "./define";

export type CallResult<T, E> = Result<T, E | Unreachable>;

type ServerAction<Input, T, E> = (input: Input) => Promise<Result<T, E>>;

/** Calls `serverAction`. Its `Result`, or `Unreachable` when the call failed on the way. */
export async function callAction<Input, T, E>(
  serverAction: ServerAction<Input, T, E>,
  input: Input,
): Promise<CallResult<T, E>> {
  let result: Result<T, E>;
  try {
    result = await serverAction(input);
  } catch {
    return err({ _tag: "Unreachable" });
  }
  if (!result.ok && isSignedOut(result.error)) signInAgain();
  return result;
}

let signingIn = false;

/** Sends the browser to sign in and back here. Once, however many calls found the session ended. */
function signInAgain() {
  if (signingIn) return;
  signingIn = true;
  const { pathname, search, hash } = window.location;
  window.location.assign(
    `/api/sign-in?returnTo=${encodeURIComponent(pathname + search + hash)}`,
  );
}

function isSignedOut(error: unknown): error is SignedOut {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "SignedOut"
  );
}

/**
 * A server action for a component: `run` calls it in a transition, `pending` is true until it
 * answers, `error` holds the last refusal (null after a success).
 *
 *   const create = useAction(createProjectAction, { onSuccess: onCreated });
 *   create.run({ name });
 */
export function useAction<Input, T, E>(
  serverAction: ServerAction<Input, T, E>,
  {
    onSuccess,
    onError,
  }: {
    onSuccess?: (value: T) => void;
    onError?: (error: E | Unreachable) => void;
  } = {},
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<E | Unreachable | null>(null);

  function run(input: Input): Promise<CallResult<T, E>> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await callAction(serverAction, input);
        startTransition(() => setError(result.ok ? null : result.error));
        if (result.ok) onSuccess?.(result.value);
        else onError?.(result.error);
        resolve(result);
      });
    });
  }

  return { run, pending, error, reset: () => setError(null) };
}
