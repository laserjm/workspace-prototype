# ADR 0009: A module has the doors its callers use

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser

## Context

CONVENTIONS.md, Layout: "A module starts as `index.ts`, `contracts.ts`, `queries.ts` and
`commands.ts`. Every other file appears when its content does."

Two modules here have less to start with. `records` decides what a question attaches and which
connections an answer may use; only `agent` and `threads` call it (through `queries.ts`), the
browser uses its `contracts.ts`, `app/` calls nothing of it, and it writes nothing. `skills` reads a
catalogue of files and writes nothing; `app/` reads it through `index.ts`.

## Options

### Option 0: Every module has all four files

`records/index.ts` binds `getAllowedConnections` and `getForeignConnectionIds` that no adapter
calls; `records/commands.ts` and `skills/commands.ts` are empty.

- ✅ The four files are always there.
- ❌ Dead exports and empty files, which the conventions' own "Structure is earned" argues against.

### Option A: A module has the doors its callers use

`index.ts` when `app/` calls the module, `commands.ts` when it writes, `queries.ts` and
`contracts.ts` as their content appears.

- ✅ Each file has a caller; a reader sees from the folder who uses the module.
- ❌ The "starts as" sentence doesn't hold for two modules.

## Decision

**Option A.** Why: Structure is earned. An `index.ts` nobody imports binds the session for nothing,
and an empty `commands.ts` says the module writes when it doesn't. The first adapter that calls
`records` adds its `index.ts`; the first write in `skills` adds its `commands.ts`.

## Consequences

- `modules/records/` has `contracts.ts`, `queries.ts` and `tools.ts` (ADR 0005), no `index.ts` or
  `commands.ts`. `modules/skills/` has no `commands.ts`.
- Departs from CONVENTIONS.md, Layout ("A module starts as …").
- Enforced by review; lint refuses any `app/` import of a module but its `index.ts` and
  `contracts.ts`, so a missing `index.ts` shows the day an adapter needs one.

## Reversing this decision

Add the files with the use cases bound or empty; nothing else changes.
