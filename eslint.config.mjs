import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import conventions from "@conventions/nextjs";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // app root, legacy folders and rulesets come from ARCHITECTURE.md
  ...conventions.createConfig(),
  // project overrides below — every override needs a Deviations row in ARCHITECTURE.md (NX-MIG-04)
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
