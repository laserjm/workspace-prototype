// Starter from @conventions/nextjs (binding: drizzle) — NX-TYPE-06. The project owns this file:
// adapt the driver and pool to its hosting. Keep `db()` lazy, so importing a module needs no
// DATABASE_URL, and keep `withTransaction` here so only infra/ reaches it (NX-DB-06).
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createTransactionRunner } from "@conventions/nextjs/drizzle";
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

export const withTransaction = createTransactionRunner(() => db());
