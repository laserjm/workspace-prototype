// Who is calling, resolved in one place (Rule 1). Pages and adapters never pass a user: a
// module's index.ts binds it with `withUser`, and everything below takes `requester`.
import "server-only";
import { getUser } from "./session";
import type { User } from "./user";

export { getUser } from "./session";
export { UserId, type User } from "./user";

/** No signed-in user: the session ended or never existed. Adapters answer it with sign-in. */
export class SignedOut extends Error {
  constructor() {
    super("No signed-in user");
    this.name = "SignedOut";
  }
}

/** The signed-in user; throws `SignedOut` for a visitor. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new SignedOut();
  return user;
}

/**
 * Binds the current user to a function that takes it as `requester`. Modules use this in their
 * index.ts only, so their internals stay free of request context and testable without Next.
 */
export function withUser<A extends unknown[], R>(
  fn: (requester: User, ...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R> => fn(await requireUser(), ...args);
}
