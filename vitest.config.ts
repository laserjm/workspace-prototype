import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
    exclude: ["node_modules/**", "src/tests/browser/**"],
  },
});
