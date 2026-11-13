import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Another module is reached only through its index.ts (browser-safe) or server.ts (server-only).
const moduleEntryPoints = {
  regex: "^@/modules/[^/]+/(?!(index|server)$).+",
  message:
    "Import another module through its index.ts or server.ts (ARCHITECTURE.md, \"Modules\").",
};

// `records` builds on `integrations` and on no other module (ARCHITECTURE.md, "Modules").
const recordsDependencies = {
  regex: "^@/modules/(?!integrations(/server)?$).+",
  message:
    "The records module imports only @/modules/integrations and @/modules/integrations/server (ARCHITECTURE.md, \"Modules\").",
};

// The auth library stays behind lib/auth/ (ARCHITECTURE.md, "Sign-in").
const authLibrary = {
  group: ["better-auth", "better-auth/*"],
  message: "Only lib/auth/ imports better-auth; use getUser() from @/lib/auth/session.",
};

// Connection credentials are read and written only by the vault (ARCHITECTURE.md, "Connection
// credentials live in the vault").
const secretsTable = {
  name: "@/lib/db/schema",
  importNames: ["connectionSecretsTable"],
  message:
    "Only modules/integrations/vault.ts reads or writes connection_secrets; use accessFor() in the integrations module.",
};
const vaultFiles = [
  "src/modules/integrations/vault.ts",
  "src/modules/integrations/*.integration.test.ts",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/**", ...vaultFiles],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [moduleEntryPoints, authLibrary], paths: [secretsTable] },
      ],
    },
  },
  {
    files: ["src/lib/auth/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [moduleEntryPoints], paths: [secretsTable] },
      ],
    },
  },
  {
    files: vaultFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [moduleEntryPoints, authLibrary] },
      ],
    },
  },
  {
    files: ["src/modules/records/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [moduleEntryPoints, authLibrary, recordsDependencies],
          paths: [secretsTable],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
