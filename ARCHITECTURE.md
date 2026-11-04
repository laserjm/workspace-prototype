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
legacy: [components/workspace/**]
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
(NX-STR-01). Configuration (`next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`) stays in
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

### No backend yet: sample data and client-side session state

**Decision.** The prototype has no database, auth or model provider. Read-only sample data
(sources and their records, the skill catalogue, seed threads and projects) lives in each
module's `infra/*.repository.ts`, is read through `queries.ts` and `server.ts`, and reaches
the browser as props from `app/(workspace)/page.tsx`. Session state (new threads, follow-ups,
settle, snooze, wake, fork, projects added) lives in the browser for the session and changes
only through the pure functions in `modules/threads/domain/` and `modules/sources/domain/`,
which return `Result` where a change can be refused. Skill activation and the source panel
width persist in `localStorage`. With the backend, these writes become use cases wired in
`commands.ts` and called from `actions.ts`, and the starters `conventions init` writes
(`lib/env.ts`, `lib/safe-action.ts`, `lib/db/client.ts`, `lib/auth/requester.ts`) are added
then; they were removed from the first commit because nothing uses them yet.
**Enforced by.** `boundaries/element-types` (components never import `infra/` or `queries.ts`).
**Recorded in.** This entry.

### Sample responses

**Decision.** The deterministic sample answers (summary, risks, next steps) are composed by
`modules/threads/domain/sample-response.ts` from the records in scope and the chosen skill. It is
a pure function, so the browser can render a response without a server round trip. A real
model call replaces it with a port in `application/` and an adapter
(`infra/<provider>.response-generator.ts`) behind an action.
**Enforced by.** `boundaries/external` (the domain imports no framework).
**Recorded in.** This entry.

## Deviations

<!-- Rules this project does not follow yet. Name the files or globs in backticks in the Deviation column: findings of that rule there are warnings, not errors; a row without paths covers the whole project. A disabled rule in source without a row here fails `conventions check`. Review quarterly. -->

| Rule | Deviation | Why | Until |
| --- | --- | --- | --- |
| NX-LAYER-01 | `app/layout.tsx` and `app/page.tsx` import the legacy `components/workspace/**` screen and styles | The routes render the pre-module screen until its modules exist | `components/workspace/**` leaves `legacy:` |

## Legacy

<!-- Folders declared in the `legacy:` key above and the module that will replace each. -->

| Folder | Replaced by module | Status |
| --- | --- | --- |
| `components/workspace/**` | `threads`, `sources`, `skills`, `projects` | migrating |
