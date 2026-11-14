// The signed-in user as the app passes them around: the `User` type and the `UserId` brand, so
// any layer (and any test) can name them. Reading the session is `getUser()` in ./session.ts.
import { z } from "zod";

const userIdSchema = z.string().min(1).brand<"UserId">();

/**
 * A user's id: their Keycloak `sub`, which is `users.id` and the `user_id` of every row they own.
 * Branded so a query on owned data cannot be handed a plain string, such as an id from the
 * request body: it comes from `getUser()`, a stored row or a test.
 */
export type UserId = z.infer<typeof userIdSchema>;

/** Brands a stored or verified id. Used by ./session.ts, mappers and tests, never on input. */
export function UserId(id: string): UserId {
  return userIdSchema.parse(id);
}

/** The signed-in user. Queries and actions scope every row they touch to `id`. */
export type User = {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
};
