import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

// The compose Postgres (`pnpm stack:up`); test/global-setup.ts creates the database.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://workspace:workspace@localhost:5433/workspace_test";

// A fixed key for the vault in tests: what it encrypts never leaves the test database.
const TEST_INTEGRATION_KEYS = `1:${"A".repeat(43)}=`;

/** Imports a .md file as its text, as Turbopack's `text` module type does in the app. */
const markdownAsText: Plugin = {
  name: "markdown-as-text",
  transform(code, id) {
    if (!id.endsWith(".md")) return undefined;
    return { code: `export default ${JSON.stringify(code)};`, map: null };
  },
};

export default defineConfig({
  plugins: [markdownAsText],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(
        import.meta.dirname,
        "test/support/server-only.ts",
      ),
    },
  },
  test: {
    include: ["{app,lib,modules,components,test}/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Wins over the shell's environment; the tests read nothing else from it.
    env: { DATABASE_URL: TEST_DATABASE_URL, INTEGRATION_KEYS: TEST_INTEGRATION_KEYS },
    exclude: ["node_modules/**", "test/browser/**"],
  },
});
