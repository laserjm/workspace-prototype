// Arrange helpers: raw inserts, so a test never depends on a command it isn't testing. Every
// call makes fresh rows; tests never share data (Testing §3, §4).
import { randomUUID } from "node:crypto";
import { UserId, type User } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { projectsTable, usersTable } from "@/lib/db/schema";

/** A signed-up user, as their first sign-in stores them: the id is their Keycloak `sub`. */
export async function insertUser(): Promise<User> {
  const id = `test-${randomUUID()}`;
  const [user] = await db()
    .insert(usersTable)
    .values({ id, keycloakSub: id, name: id, email: `${id}@test.invalid` })
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
  if (!user) throw new Error("The insert returned no user");
  return { ...user, id: UserId(user.id) };
}

export async function insertProject(owner: User, values: { name?: string } = {}) {
  const [project] = await db()
    .insert(projectsTable)
    .values({ userId: owner.id, name: values.name ?? `project-${randomUUID()}` })
    .returning({ id: projectsTable.id, name: projectsTable.name });
  if (!project) throw new Error("The insert returned no project");
  return project;
}
