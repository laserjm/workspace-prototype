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
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(
        import.meta.dirname,
        "test/support/server-only.ts",
      ),
    },
  },
  test: {
    include: ["{app,lib,modules,components,test}/**/*.test.ts"],
    setupFiles: ["test/support/env.ts"],
    exclude: ["node_modules/**", "test/browser/**"],
  },
});
