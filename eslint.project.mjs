// The import boundaries this app adds to the conventions (ARCHITECTURE.md, "Modules", "Sign-in",
// "Connection credentials live in the vault"). eslint.config.mjs spreads this file after its own
// blocks and refuses a rule it sets itself, so these use `import/no-restricted-paths` and
// `no-restricted-syntax`. Each rule is set by one block per file: a later block would replace an
// earlier one's options, so files that need fewer checks get their own block with disjoint `files`.

const modules = [
  {
    target: "./modules/integrations",
    from: "./modules",
    except: ["./integrations"],
    message: "integrations is a leaf: it imports no other module (ARCHITECTURE.md, \"Modules\").",
  },
  {
    target: "./modules/records",
    from: "./modules",
    except: ["./records", "./integrations"],
    message: "records builds on integrations alone (ARCHITECTURE.md, \"Modules\").",
  },
  {
    target: "./modules/integrations/providers/github",
    from: "./modules/integrations/providers",
    except: ["./github"],
    message: "A provider imports no other provider (ADR 0006).",
  },
];
const vault = {
  target: "./",
  from: "./lib/db/vault.ts",
  message:
    "Only integrations' repo.ts and commands.ts use the vault (ARCHITECTURE.md, \"Connection credentials live in the vault\").",
};
const vaultUsers = [
  "modules/integrations/repo.ts",
  "modules/integrations/commands.ts",
  "modules/integrations/**/*.test.ts",
  "test/factories.ts",
];

const betterAuth = {
  selector: "ImportDeclaration[source.value=/^better-auth(\\u002F|$)/]",
  message: "Only lib/auth/ imports better-auth (ARCHITECTURE.md, \"Sign-in\").",
};
const secretsTable = {
  selector:
    "ImportDeclaration[source.value=/lib\\u002Fdb\\u002Fschema$/] ImportSpecifier[imported.name='connectionSecretsTable']",
  message:
    "Only lib/db/vault.ts reads or writes connection_secrets; use accessFor() in the integrations module.",
};
// commands.test.ts reads the row to check that it holds no token in the clear.
const secretsReaders = ["lib/db/vault.ts", "modules/integrations/commands.test.ts"];

const projectConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: vaultUsers,
    rules: { "import/no-restricted-paths": ["error", { zones: [...modules, vault] }] },
  },
  {
    files: vaultUsers,
    rules: { "import/no-restricted-paths": ["error", { zones: modules }] },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/auth/**", ...secretsReaders],
    rules: { "no-restricted-syntax": ["error", betterAuth, secretsTable] },
  },
  {
    files: ["lib/auth/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", secretsTable] },
  },
  {
    files: secretsReaders,
    rules: { "no-restricted-syntax": ["error", betterAuth] },
  },
];

export default projectConfig;
