<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Conventions

Use `docs/CONVENTIONS.md`

## Project

- `ARCHITECTURE.md` records the decisions the conventions leave open (the stack, the
  integrations, the agent, styling). `docs/adr/` records every departure from the conventions.
- Before you finish, run `pnpm lint`, `pnpm typecheck` and `pnpm test`. The tests need the
  local stack (`pnpm stack:up`).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for laserjm/workspace-prototype (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
