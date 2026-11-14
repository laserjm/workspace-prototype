// Vitest setup: the settings Next.js reads from `.env.local` (DATABASE_URL for integration tests).
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
