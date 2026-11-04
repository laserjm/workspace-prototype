# Architecture

<!-- conventions header: read by the linter, `conventions check` and the conventions skill. Keep the keys. -->
```yaml
conventions: 0.3.0
profile: nextjs
bindings: [drizzle, zod, next-safe-action]   # plain Postgres: no database-platform binding
app-root: src
# schema-source: code-first      # decided with the first table, together with the database rulesets
isolation: owner                 # each signed-in user owns their threads, projects and preferences
# Adopted now. auth, cache, database, drizzle and next-safe-action follow with the backend.
rulesets: [structure, layers, naming, types, errors, rich, cross-module, testing, zod, migration]
legacy: []
```

This app follows the Next.js Architecture Rules, Naming Conventions and Testing Policy of the
conventions version above, with the bindings listed. `conventions explain <RULE-ID>` prints any
rule. This file records how this project reads the rules where they leave room, and every
deviation (NX-MIG-04). Each entry says what was decided and where it is enforced or recorded.
**Add an entry before you deviate; change one only with the decision that changes it.**

Related: `docs/architecture/db-inventory.md` (every database function and trigger; empty until
the database exists), `modules/*/MIGRATING.md` (half-migrated modules).

## Interpretations

### App root is `src/`

**Decision.** `app/`, `modules/`, `lib/` and `components/` sit in `src/`; `@/` points there
(NX-STR-01). Configuration (`next.config.ts`, `vitest.config.mts`, `eslint.config.mjs`) stays in
the package root.
**Enforced by.** `tsconfig.json` paths; the `app-root` key above.
**Recorded in.** This entry.

### Data ownership

**Decision.** `isolation: owner`. Each signed-in user owns their threads, projects and skill
preferences; there are no shared workspaces. The enterprise source catalogue and the skill
catalogue are shared data (NX-AUTH-05). Shared workspaces, such as a team seeing each other's
threads or source connections configured once per organisation, would make this a `tenant`
app, recorded here as a migration.
**Enforced by.** Nothing yet: there are no owned tables. `conventions check` (`owner-id-type`,
`isolation-test`) and `tsc` take over with the first repository on owned data, together with
the `auth` and `database` rulesets.
**Recorded in.** This entry.

### Modules

**Decision.** Four modules. `threads` (rich: sessions, settle, snooze, wake, fork, the live
chat and its answers, sample turns), `sources` (the enterprise systems and their records; a read-only domain),
`skills` (the skill catalogue and its activation in this browser) and `projects` (the project
list, the add-project rule and the sidebar filter). `app/(workspace)/` composes them; its
`_components/` hold the shell, sidebar, settings and new-thread heading, which only that route
uses (NX-STR-04).
**Enforced by.** `conventions check` (`module-complete`, `rich-shape`), `boundaries/element-types`.
**Recorded in.** This entry.

### Cross-module references are ids

**Decision.** A module's `domain/` imports nothing from another module (NX-LAYER-01), so a
thread refers to its source, records and skill by id (`ThreadScope = { sourceId, recordIds }`,
`skillId`). Components resolve the ids through the other module's public API
(`useSources().sourceById`, `useSkills().skillById`). Source-specific presentation (overview
title, breadcrumb, board view, list label) is data on the source, not a branch on its id.
**Enforced by.** `boundaries/element-types`.
**Recorded in.** This entry.

### No database or sign-in yet: sample data and client-side session state

**Decision.** The prototype has no database or auth. Read-only sample data (sources and their
records, skills, seed threads with their sample turn, projects) lives in each module's
`infra/sample.*.ts` adapter. It is read through `queries.ts` and `server.ts` in
`app/(workspace)/page.tsx`, a server component. The catalogues reach the browser through
`SourcesProvider` and `SkillsProvider`; the rest arrives as props. Thread metadata (new
threads, settle, snooze, wake, fork, projects added) lives in the browser for the session and
changes only through the pure functions in `modules/threads/domain/` and
`modules/projects/domain/`, which return `Result` where a change can be refused; `useThreads`
applies them. Live conversations live in the `ChatStore`, one AI SDK `Chat` per thread, also
for the session. Skill activation and the source panel width persist in `localStorage`; the
stored skill ids are parsed with `storedSkillIdsSchema` (NX-TYPE-03).

With the database, the sample adapters become repositories with integration tests
(NX-TEST-02), the session writes become use cases wired in `commands.ts`, and the starters
`conventions init` writes (`lib/env.ts`, `lib/safe-action.ts`, `lib/db/client.ts`,
`lib/auth/requester.ts`) come back. They were removed in the first commit because nothing uses
them yet.
**Enforced by.** `boundaries/element-types` (components never import `infra/` or `queries.ts`);
the `server-only` import in every `queries.ts`, `commands.ts` and `server.ts`.
**Recorded in.** This entry.

### Answers come from the Vercel AI Gateway

**Decision.** `POST /api/chat` (`app/api/chat/route.ts`) only hands the body to
`answerThread` from `modules/threads/server.ts`. `modules/threads/commands.ts` validates it
with `chatTurnDtoSchema` at the edge and runs the use case `application/answer-thread.ts`.
The use case resolves the model, skill and records from their ids against the server's
catalogues (unknown ids are `NotFound`, answered with a 400) and asks the `ResponseAgent`
port to stream. `infra/ai-gateway.response-agent.ts` implements the port with an AI SDK
`ToolLoopAgent` on the gateway, with the instructions in `infra/ai-gateway.instructions.ts`,
the model allowlist in `infra/ai-gateway.model-catalog.ts` and the `html_render` tool in
`infra/ai-sdk.html-render-tool.ts`. The tool's input and output schemas are in
`contracts.ts`, so the browser's message types never import `infra/`. There is no sign-in, so
the command takes no `Requester` yet (NX-LAYER-11); it becomes the first argument with the
`auth` ruleset. The frame that shows an `html_render` page is feature-agnostic and lives in
`components/ui/html-render-*.tsx`; the helpers both sides share are in `lib/html-render/`.
**Enforced by.** `conventions check` (`use-case-test`, `rich-shape`), `boundaries/element-types`,
`boundaries/external` (the ORM-free, framework-free `application/`).
**Recorded in.** This entry.

### Sample responses

**Decision.** The seeded threads keep one sample turn, answered locally. Its kind (summary,
risks, next steps) is chosen by `modules/threads/domain/sample-response.ts` from the prompt
and the skill, and rendered by `modules/threads/components/sample-response.tsx` from the
records in scope. Every message after it goes to the model.
**Enforced by.** `boundaries/external` (the domain imports no framework).
**Recorded in.** This entry.

## Deviations

<!-- Rules this project does not follow yet. Name the files or globs in backticks in the Deviation column: findings of that rule there are warnings, not errors; a row without paths covers the whole project. A disabled rule in source without a row here fails `conventions check`. Review quarterly. -->

| Rule | Deviation | Why | Until |
| --- | --- | --- | --- |

## Legacy

<!-- Folders declared in the `legacy:` key above and the module that will replace each. -->

| Folder | Replaced by module | Status |
| --- | --- | --- |
