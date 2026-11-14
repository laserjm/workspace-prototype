# ADR 0005: A module's agent tools are a door into it

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser

## Context

The agent module (`modules/agent`) answers a question with a tool loop. Most of its tools read
another module's data: `search_records` and `read_record` read the records of an attached
connection (records, over integrations), `github_pull_request_diff` reads a pull request through
the GitHub provider (integrations), and `load_skill` reads the skill catalogue (skills). Each tool
is a schema the model reads, a description, a context the server fills (the requester and the
connections it may read) and an `execute` that calls the module's own code.

CONVENTIONS.md, Rule 6, gives a module three doors: `index.ts` for `app/`, `queries.ts`,
`commands.ts` and `errors.ts` for other modules and system callers, and `contracts.ts` for the UI.
A tool definition is none of them. Lint allows `@/modules/<x>/tools` (it only refuses `index`,
`repo` and `mappers`), so this is a review-level departure.

## Options

### Option 0: The agent defines every tool and calls the other modules' queries

`modules/agent/tools.ts` holds all five tools; `execute` calls `@/modules/records/queries`,
`@/modules/integrations/queries` and `@/modules/skills/queries`.

- ✅ Rule 6 as written: the agent reaches the others only through `queries.ts`.
- ❌ The agent learns every provider's tools: the GitHub diff tool's schema, limits and
  description would move out of the GitHub provider folder into the agent, so adding a provider
  tool touches two modules (ADR 0002's "a provider is a folder").
- ❌ The tool's description and its schema describe the module's data; they would drift from the
  code that answers them.

### Option A: `tools.ts` is a fourth door, for the agent only

A module that offers the model something exports its tools from `modules/<x>/tools.ts`
(`recordTools`, `integrationTools` with `integrationToolsFor`, `skillTools`). Only
`modules/agent/tools.ts` imports them, to build the registry. A tool's `execute` takes the
requester from the tool context the server filled, never from the model, and calls its own
module's queries.

- ✅ A tool lives next to the code that answers it; a provider's tools stay in its folder.
- ✅ The requester still comes from one place: `answerThread` → `runAgent(requester, …)` →
  `toolsFor(context)`, never the session inside a tool.
- ❌ One more door to know of when reading a module.

## Decision

**Option A.** Why: Developer experience (a feature's code sits together). Option 0 would scatter
each provider's tool across the agent and the provider, which is exactly what ADR 0002 set out to
avoid. Without that, Option 0 would be the simpler rule.

## Consequences

- `modules/{records,integrations,skills}/tools.ts` export their tools; `modules/agent/tools.ts`
  imports them and nothing else imports a `tools.ts`. Integrations' `tools.ts` also exports
  `connectionToolContextSchema`, which the record tools share.
- Departs from CONVENTIONS.md, Rule 6 (the list of doors): `tools.ts` is a door for the agent.
- A tool name is stored in conversations, so it is never renamed (`modules/agent/tools.test.ts`
  lists them).
- Enforced by review; the lint config allows the import.

## Reversing this decision

Move each module's tool into `modules/agent/tools.ts` and have `execute` call that module's
`queries.ts`; the schemas stay in each module's `contracts.ts`, so the chat UI keeps its types.
The tool names don't change, so stored conversations stay valid.
