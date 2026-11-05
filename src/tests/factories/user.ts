import { UserId, type User } from "@/lib/auth/user";

/** A signed-in user whose id (their Keycloak `sub`, `users.id`) is `id`. */
export function aUser(id = "user-a"): User {
  return { id: UserId(id), name: id, email: `${id}@test.invalid` };
}
