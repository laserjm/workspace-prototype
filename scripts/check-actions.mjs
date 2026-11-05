#!/usr/bin/env node
// Keeps every server action behind the sign-in check. See "Server actions" in ARCHITECTURE.md.
//
//   ACTION-01  "use server" appears only in src/modules/*/actions.ts (no inline server functions)
//   ACTION-02  every export of an actions.ts is `export const <name>Action = action(…)` or
//              `publicAction(…)` imported from @/lib/actions/server; a publicAction has a comment
//              above it that says why visitors may call it
//   ACTION-03  only src/lib/actions/server.ts, src/lib/auth/ and src/app/ import the requester

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();

const ACTIONS_FILE = /^src\/modules\/[^/]+\/actions\.ts$/;
const USE_SERVER = /^\s*["']use server["'];?\s*$/;
const ACTION_EXPORT = /^export const ([a-z][A-Za-z0-9]*Action) = (action|publicAction)\(/;
const IMPORTS_ACTION =
  /import\s*\{[^}]*\b(?:action|publicAction)\b[^}]*\}\s*from\s*["']@\/lib\/actions\/server["']/;
const IMPORTS_REQUESTER = /from\s*["'](?:@\/lib\/auth\/requester|(?:\.\.?\/)+(?:lib\/)?auth\/requester)["']/;
const MAY_IMPORT_REQUESTER = [/^src\/lib\/actions\/server\.ts$/, /^src\/lib\/auth\//, /^src\/app\//];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Comments may mention "use server" or the requester without breaking a rule.
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (match, before) =>
      before + " ".repeat(match.length - before.length),
    );
}

const findings = [];
const report = (path, line, rule, message) =>
  findings.push(`${path}:${line}  ${rule}  ${message}`);

for (const file of walk(join(root, "src"))) {
  const path = relative(root, file).split(sep).join("/");
  if (!/\.(tsx?|mts)$/.test(path)) continue;
  const raw = readFileSync(file, "utf8");
  const source = withoutComments(raw);
  const lines = source.split("\n");
  const rawLines = raw.split("\n");
  const isActions = ACTIONS_FILE.test(path);

  lines.forEach((line, index) => {
    if (!isActions && USE_SERVER.test(line))
      report(path, index + 1, "ACTION-01", `"use server" outside a module's actions.ts; export the action from modules/<x>/actions.ts`);
    if (IMPORTS_REQUESTER.test(line) && !MAY_IMPORT_REQUESTER.some((allowed) => allowed.test(path)))
      report(path, index + 1, "ACTION-03", "imports the requester; an action gets it from `action(…)`, a command or query takes it as its first argument");
  });

  if (!isActions) continue;
  const firstStatement = lines.findIndex((line) => line.trim() !== "");
  if (!USE_SERVER.test(lines[firstStatement] ?? ""))
    report(path, firstStatement + 1, "ACTION-02", `actions.ts starts with "use server"`);

  let usesAction = false;
  lines.forEach((line, index) => {
    if (!line.startsWith("export ") || line.startsWith("export type ")) return;
    const match = ACTION_EXPORT.exec(line);
    if (!match) {
      report(path, index + 1, "ACTION-02", "every export is `export const <name>Action = action(schema, handler)` (or publicAction)");
      return;
    }
    usesAction = true;
    if (match[2] === "publicAction" && !/^\s*\/\//.test(rawLines[index - 1] ?? ""))
      report(path, index + 1, "ACTION-02", `${match[1]} is public; say why visitors may call it in a // comment above it`);
  });
  if (usesAction && !IMPORTS_ACTION.test(source))
    report(path, 1, "ACTION-02", "import `action` / `publicAction` from @/lib/actions/server, which signs the caller in");
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`\n${findings.length} server action finding(s). Rules: scripts/check-actions.mjs`);
  process.exit(1);
}
console.log("✓ check-actions: every action signs its caller in");
