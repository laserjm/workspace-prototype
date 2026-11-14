// drizzle-kit configuration. The schema is code-first (ARCHITECTURE.md, "Schema source"): tables are
// declared in lib/db/schema.ts and `pnpm db:generate --name <verb>-<what>` writes the SQL
// migrations to lib/db/migrations/, which `pnpm db:migrate` applies to DATABASE_URL.
import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read Next.js env files; values already in the environment win.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
