// A session for tests that call server actions. Swap it in for the real one, which reads the
// request's cookie, at the top of the test file:
//
//   vi.mock("@/lib/auth/requester", () => import("@/tests/support/session"));
//
// then call an action as a user, or as a visitor with `null`:
//
//   await callAs(ana, createProjectAction, { name: "battery management" });
import type { OwnerRequester } from "@conventions/nextjs/core";

let current: OwnerRequester | null = null;

/** Calls `serverAction` with `input` as `requester` would through the app. Null calls as a visitor. */
export async function callAs<Input, Output>(
  requester: OwnerRequester | null,
  serverAction: (input: Input) => Promise<Output>,
  input: Input,
): Promise<Output> {
  const previous = current;
  current = requester;
  try {
    return await serverAction(input);
  } finally {
    current = previous;
  }
}

// The same exports as lib/auth/requester.ts, answering from `callAs`.

export async function getRequester(): Promise<OwnerRequester | null> {
  return current;
}

export async function getSignedInUser(): Promise<{
  name: string;
  email: string;
} | null> {
  return current && { name: current.userId, email: `${current.userId}@test.invalid` };
}
