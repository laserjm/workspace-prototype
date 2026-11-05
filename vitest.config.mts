import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

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
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(
        import.meta.dirname,
        "src/tests/support/server-only.ts",
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/tests/support/env.ts"],
    exclude: ["node_modules/**", "src/tests/browser/**"],
  },
});
