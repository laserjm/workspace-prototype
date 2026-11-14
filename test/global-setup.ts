// Runs once per `vitest` run, before any test file: creates the test database if it is missing,
// brings it to the latest schema and starts from empty tables. It refuses any database whose name
// does not end in `_test`, so a run can never truncate the development data.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL;
  const name = url ? new URL(url).pathname.slice(1) : "";
  if (!url || !name.endsWith("_test"))
    throw new Error(
      `Refusing to run tests against database "${name}": its name must end with _test.`,
    );

  await createIfMissing(url, name);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./lib/db/migrations" });
    // Every owned row hangs off a user, so this empties the app's tables.
    await db.execute(sql`TRUNCATE users, verifications CASCADE`);
  } finally {
    await client.end();
  }
}

async function createIfMissing(url: string, name: string) {
  const server = new URL(url);
  server.pathname = "/postgres";
  const client = postgres(server.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await client`select 1 from pg_database where datname = ${name}`;
    if (!exists) await client.unsafe(`create database "${name}"`);
  } finally {
    await client.end();
  }
}
