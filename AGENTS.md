<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Name things with the terms in `GLOSSARY.md`. A new or renamed domain term changes it in the
  same change.
- Read `ARCHITECTURE.md` before changing structure. Each entry records a decision and what
  enforces it; change the entry together with the decision.
- Another module is reached only through its `index.ts` (browser-safe) or `server.ts`
  (server-only). ESLint enforces it; inside a module, import relatively.
- Before you finish, run `pnpm lint`, `pnpm typecheck` and `pnpm test`. The integration tests
  need the local stack (`pnpm stack:up`) and skip loudly without it.
- Fix a lint finding rather than disabling it. A disable needs a comment that says why.
