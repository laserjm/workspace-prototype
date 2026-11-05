import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Another module is reached only through its index.ts (browser-safe) or server.ts (server-only).
const moduleEntryPoints = {
  regex: "^@/modules/[^/]+/(?!(index|server)$).+",
  message:
    "Import another module through its index.ts or server.ts (ARCHITECTURE.md, \"Modules\").",
};

// The auth library stays behind lib/auth/ (ARCHITECTURE.md, "Sign-in").
const authLibrary = {
  group: ["better-auth", "better-auth/*"],
  message: "Only lib/auth/ imports better-auth; use getUser() from @/lib/auth/session.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [moduleEntryPoints, authLibrary] },
      ],
    },
  },
  {
    files: ["src/lib/auth/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [moduleEntryPoints] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
