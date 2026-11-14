// The import boundaries this app adds to the conventions' ESLint config (ARCHITECTURE.md,
// "Modules" and "Integrations are provider folders"). They live here, not in eslint.config.mjs:
// that file is the conventions' unchanged copy, and for `no-restricted-imports` a later block
// replaces an earlier one's options instead of adding to them, so a project block would drop the
// conventions' own patterns for the same files.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

const sources = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => /\.(ts|tsx|mts)$/.test(file) && !file.startsWith("node_modules/"));

type Import = { file: string; spec: string; target: string; typeOnly: boolean };

// `import … from "x"`, `export … from "x"`, `import "x"`, `import("x")`, `vi.mock("x")`.
const IMPORT =
  /(?:^|\n)\s*(import|export)(\s+type)?\b[^;"']*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\b(?:import|vi\.mock)\(\s*["']([^"']+)["']/g;

/** Every import in the repository, with the repo-relative path it points at (or the package). */
const imports: Import[] = sources.flatMap((file) => {
  const text = readFileSync(path.join(root, file), "utf8");
  return [...text.matchAll(IMPORT)].map((match) => {
    const spec = match[3] ?? match[4] ?? match[5] ?? "";
    const target = spec.startsWith("@/")
      ? spec.slice(2)
      : spec.startsWith(".")
        ? path.relative(root, path.resolve(root, path.dirname(file), spec))
        : spec;
    return { file, spec, target, typeOnly: Boolean(match[2]) };
  });
});

const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const under = (dir: string) => (file: string) => file.startsWith(`${dir}/`);
/** The module a repo-relative path belongs to, if it is under modules/. */
const moduleOf = (target: string) => /^modules\/([^/]+)/.exec(target)?.[1];

function violations(
  from: (file: string) => boolean,
  refused: (entry: Import) => boolean,
): string[] {
  return imports
    .filter((entry) => from(entry.file) && refused(entry))
    .map((entry) => `${entry.file}: "${entry.spec}"`);
}

describe("module boundaries", () => {
  it("integrations is a leaf: it imports no other module", () => {
    expect(
      violations(under("modules/integrations"), (entry) => {
        const target = moduleOf(entry.target);
        return target !== undefined && target !== "integrations";
      }),
    ).toEqual([]);
  });

  it("records builds on integrations alone", () => {
    expect(
      violations(under("modules/records"), (entry) => {
        const target = moduleOf(entry.target);
        return target !== undefined && target !== "records" && target !== "integrations";
      }),
    ).toEqual([]);
  });
});

describe("integrations' providers", () => {
  const providerOf = (target: string) =>
    /^modules\/integrations\/providers\/([^/]+)/.exec(target)?.[1];
  // The two registries: providers.ts (the provider) and tools.ts (its agent tools).
  const registries = new Set(["modules/integrations/providers.ts", "modules/integrations/tools.ts"]);

  it("a provider folder imports no other provider", () => {
    expect(
      violations(
        (file) => providerOf(file) !== undefined,
        (entry) => {
          const target = providerOf(entry.target);
          return target !== undefined && target !== providerOf(entry.file);
        },
      ),
    ).toEqual([]);
  });

  it("outside its folder, a provider is reached through the registries or its contracts.ts", () => {
    expect(
      violations(
        (file) => !isTest(file) && !file.startsWith("test/") && !registries.has(file),
        (entry) => {
          const provider = providerOf(entry.target);
          if (provider === undefined || providerOf(entry.file) === provider) return false;
          return entry.target !== `modules/integrations/providers/${provider}/contracts`;
        },
      ),
    ).toEqual([]);
  });

  it("a provider's contracts.ts is browser-safe: zod, types and the module's contracts.ts", () => {
    expect(
      violations(
        (file) => /^modules\/integrations\/providers\/[^/]+\/contracts\.ts$/.test(file),
        (entry) =>
          !entry.typeOnly &&
          entry.target !== "zod" &&
          entry.target !== "modules/integrations/contracts",
      ),
    ).toEqual([]);
  });
});

describe("one place per secret", () => {
  it("only integrations' repo.ts and commands.ts use the vault, besides tests", () => {
    const allowed = new Set([
      "modules/integrations/repo.ts",
      "modules/integrations/commands.ts",
      "test/factories.ts",
    ]);
    expect(
      violations(
        (file) => !allowed.has(file) && !(isTest(file) && under("modules/integrations")(file)),
        (entry) => entry.target === "lib/db/vault",
      ),
    ).toEqual([]);
  });

  it("only lib/auth imports better-auth", () => {
    expect(
      violations(
        (file) => !under("lib/auth")(file),
        (entry) => entry.target === "better-auth" || entry.target.startsWith("better-auth/"),
      ),
    ).toEqual([]);
  });
});

describe("the scan", () => {
  it("sees the imports it checks", () => {
    // A regex that stopped matching would pass every check above.
    expect(imports.some((entry) => entry.target === "lib/db/vault")).toBe(true);
    expect(imports.some((entry) => entry.target.startsWith("better-auth"))).toBe(true);
    expect(
      imports.some((entry) => entry.target === "modules/integrations/providers/github/contracts"),
    ).toBe(true);
  });
});
