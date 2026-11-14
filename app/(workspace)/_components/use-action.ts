"use client";
// Calling a server action from the browser. `callAction` never throws: a call that fails on the
// way, or a bug on the server, answers with copy, and a refusal that asks to sign in sends the
// browser to sign in and back to this page, so no component handles an ended session itself.
import { useState, useTransition } from "react";
import type { Refusal } from "../actions";

type ServerAction<Input, T> = (input: Input) => Promise<T | Refusal>;

const UNREACHABLE: Refusal = {
  error: "The server could not be answered. Check your connection and try again.",
};

/** True for an action's refusal. A DTO never carries an `error` string. */
export function isRefusal(answer: unknown): answer is Refusal {
  return (
    typeof answer === "object" &&
    answer !== null &&
    "error" in answer &&
    typeof answer.error === "string"
  );
}

/** Calls `serverAction`: its answer, or a refusal when the call failed on the way. */
export async function callAction<Input, T>(
  serverAction: ServerAction<Input, T>,
  input: Input,
): Promise<T | Refusal> {
  let answer: T | Refusal;
  try {
    answer = await serverAction(input);
  } catch {
    return UNREACHABLE;
  }
  if (isRefusal(answer) && answer.signIn) signInAgain();
  return answer;
}

let signingIn = false;

/** Sends the browser to sign in and back here. Once, however many calls found the session ended. */
function signInAgain() {
  if (signingIn) return;
  signingIn = true;
  const { pathname, search, hash } = window.location;
  // A full load on purpose: /api/sign-in is a route handler that redirects to Keycloak, not a
  // page, which the location rule cannot know (docs/adr/0004).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(
    `/api/sign-in?returnTo=${encodeURIComponent(pathname + search + hash)}`,
  );
}

/**
 * A server action for a component: `run` calls it in a transition, `pending` is true until it
 * answers, `refusal` holds the last refusal (null after a success).
 *
 *   const create = useAction(createProjectAction, { onSuccess: onCreated });
 *   create.run({ name });
 */
export function useAction<Input, T>(
  serverAction: ServerAction<Input, T>,
  {
    onSuccess,
    onRefusal,
  }: { onSuccess?: (value: T) => void; onRefusal?: (refusal: Refusal) => void } = {},
) {
  const [pending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  function run(input: Input): Promise<T | Refusal> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const answer = await callAction(serverAction, input);
        const refused = isRefusal(answer) ? answer : null;
        startTransition(() => setRefusal(refused));
        if (refused) onRefusal?.(refused);
        else if (!isRefusal(answer)) onSuccess?.(answer);
        resolve(answer);
      });
    });
  }

  return { run, pending, refusal, reset: () => setRefusal(null) };
}
