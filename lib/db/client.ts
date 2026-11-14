// Adapt the driver and pool to the hosting. Keep `db()` lazy, so importing a module needs no
// DATABASE_URL, and keep `withTransaction` here beside it.
import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // A direct connection to the compose Postgres, so prepared statements are fine. Behind a
  // transaction pooler (PgBouncer, Supavisor) pass `prepare: false`.
  return drizzle(postgres(url), { schema });
}

let database: ReturnType<typeof connect> | undefined;

/** Connects on first use. */
export function db() {
  database ??= connect();
  return database;
}

export type Database = ReturnType<typeof db>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** How long one statement of a request's transaction may run. */
const STATEMENT_TIMEOUT = "8s";

/**
 * Runs `fn` in a transaction: commits when it returns, rolls back when it throws. The timeout is
 * set with `set_config(…, true)`, so it ends with the transaction and never reaches the next
 * client of a pooled connection.
 */
export function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)`);
    return fn(tx);
  });
}
