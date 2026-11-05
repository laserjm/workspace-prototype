import { afterAll, beforeAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { usersTable } from "@/lib/db/schema";

/**
 * Signs up users with these ids for the file's tests, as a first sign-in would, and deletes them
 * (and everything they own) afterwards. Give each test file its own ids: files run in parallel.
 */
export function withUsers(...ids: string[]) {
  beforeAll(async () => {
    await db()
      .insert(usersTable)
      .values(
        ids.map((id) => ({
          id,
          keycloakSub: id,
          name: id,
          email: `${id}@test.invalid`,
        })),
      )
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await db().delete(usersTable).where(inArray(usersTable.id, ids));
  });
}
