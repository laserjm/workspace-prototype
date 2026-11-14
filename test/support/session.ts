// A session for tests that call server actions. Swap it in for the real one, which reads the
// request's cookie, at the top of the test file:
//
//   vi.mock("@/lib/auth/session", () => import("@/test/support/session"));
//
// then call an action as a user, or as a visitor with `null`:
//
//   await callAs(ana, createProjectAction, { name: "battery management" });
import type { User } from "@/lib/auth/user";

let current: User | null = null;

/** Calls `serverAction` with `input` as `user` would through the app. Null calls as a visitor. */
export async function callAs<Input, Output>(
  user: User | null,
  serverAction: (input: Input) => Promise<Output>,
  input: Input,
): Promise<Output> {
  const previous = current;
  current = user;
  try {
    return await serverAction(input);
  } finally {
    current = previous;
  }
}

/** The same export as lib/auth/session.ts, answering from `callAs`. */
export async function getUser(): Promise<User | null> {
  return current;
}
