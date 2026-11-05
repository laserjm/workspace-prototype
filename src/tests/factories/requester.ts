import { OwnerId, type OwnerRequester } from "@conventions/nextjs/core";

/** A signed-in user; `ownerId` and `userId` are their Keycloak `sub`, which is `users.id`. */
export function aRequester(id = "owner-a"): OwnerRequester {
  return { kind: "user", userId: id, ownerId: OwnerId(id), roles: [] };
}
