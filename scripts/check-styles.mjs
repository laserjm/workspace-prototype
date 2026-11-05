#!/usr/bin/env node
// Keeps styling on the design tokens: colours, type sizes and spacing come from
// src/app/globals.css and reach components as Tailwind classes. See
// "Styling: design tokens and Tailwind classes" in ARCHITECTURE.md.
//
//   STYLE-01  the only stylesheet is src/app/globals.css
//   STYLE-02  no hex colours or colour functions outside globals.css
//   STYLE-03  no arbitrary font sizes (text-[13px], fontSize, font-size)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const TOKENS = "src/app/globals.css";

// Files that may break a rule, each with the reason. Keep this list short.
const ALLOWED = {
  "src/lib/html-render/html-render.ts": {
    rules: ["STYLE-02", "STYLE-03"],
    why: "the palette and base CSS of html_render pages, which render in an iframe that cannot read the app's CSS variables",
  },
  "src/components/ui/vscode-icon.tsx": {
    rules: ["STYLE-02"],
    why: "the VS Code brand colour",
  },
};

const CHECKS = [
  {
    rule: "STYLE-02",
    pattern: /#[0-9a-fA-F]{3,8}\b(?![-\w])/g,
    message: "hex colour; use a token from globals.css (bg-card, text-muted-foreground, …) or Tailwind's palette",
  },
  {
    rule: "STYLE-02",
    pattern: /\b(?:rgba?|hsla?|oklch|oklab)\(/g,
    message: "colour function; use a token from globals.css or Tailwind's palette",
  },
  {
    rule: "STYLE-03",
    pattern: /\btext-\[(?:length:)?[\d.]+(?:px|rem|em)\]/g,
    message: "arbitrary font size; use the type scale (text-5xs … text-3xl)",
  },
  {
    rule: "STYLE-03",
    pattern: /\bfontSize\s*:|font-size\s*:/g,
    message: "font size outside the type scale; use a text-* class",
  },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Comments may name colours ("the old #fdfdfd") without breaking the rule.
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (match, before) =>
      before + " ".repeat(match.length - before.length),
    );
}

const findings = [];
for (const file of walk(join(root, "src"))) {
  const path = relative(root, file).split(sep).join("/");
  const allowed = ALLOWED[path]?.rules ?? [];
  if (path.endsWith(".css")) {
    if (path !== TOKENS)
      findings.push(`${path}  STYLE-01  stylesheet outside ${TOKENS}; style components with Tailwind classes`);
    continue;
  }
  if (!/\.(tsx?|mjs|js)$/.test(path)) continue;
  const lines = withoutComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    for (const { rule, pattern, message } of CHECKS) {
      if (allowed.includes(rule)) continue;
      for (const match of line.matchAll(pattern))
        findings.push(`${path}:${index + 1}  ${rule}  ${message}: ${match[0]}`);
    }
  });
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`\n${findings.length} styling finding(s). Allowed exceptions: scripts/check-styles.mjs`);
  process.exit(1);
}
console.log("✓ check-styles: tokens only");
