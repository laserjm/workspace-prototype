# Architecture

<!-- conventions header: read by the linter, `conventions check` and the conventions skill. Keep the keys. -->
```yaml
conventions: 0.3.2
profile: nextjs
bindings: [drizzle, zod, next-safe-action]   # plain Postgres: no database-platform binding
app-root: src
schema-source: code-first        # src/lib/db/schema.ts generates the migrations in drizzle/
isolation: owner                 # each signed-in user owns their threads, projects and preferences
# cache: adopted with nothing to check yet (no cache tags; every read is per request).
rulesets: [structure, layers, naming, types, errors, rich, cross-module, testing, zod, migration, database, drizzle, auth, next-safe-action, cache]
legacy: []
migrations: drizzle/*.sql        # what `conventions check` replays for the inventory (NX-DB-02)
```

This app follows the Next.js Architecture Rules, Naming Conventions and Testing Policy of the
conventions version above, with the bindings listed. `conventions explain <RULE-ID>` prints any
rule. This file records how this project reads the rules where they leave room, and every
deviation (NX-MIG-04). Each entry says what was decided and where it is enforced or recorded.
**Add an entry before you deviate; change one only with the decision that changes it.**

Related: `docs/adr/` (why and in what order), `docs/architecture/db-inventory.md` (every
database function and trigger; empty until the database exists), `modules/*/MIGRATING.md`
(half-migrated modules).

## Interpretations

### App root is `src/`

**Decision.** `app/`, `modules/`, `lib/` and `components/` sit in `src/`; `@/` points there
(NX-STR-01). Configuration (`next.config.ts`, `vitest.config.mts`, `eslint.config.mjs`) stays in
the package root.
**Enforced by.** `tsconfig.json` paths; the `app-root` key above.
**Recorded in.** This entry.

### Local stack: Docker Compose with Postgres and Keycloak

**Decision.** `compose.yaml` runs the stack the app develops against: Postgres 17 and Keycloak
26 in dev mode (`start-dev`). One Postgres server holds two databases with their own roles:
`workspace`, the app's, which `drizzle/` migrates, and `keycloak`, which only Keycloak writes
(`docker/postgres/initdb/10-keycloak.sh` creates it on the first start of an empty volume).
Host ports are 5433 (Postgres) and 8080 (Keycloak), overridable in `.env`. Keycloak's issuer is
`http://localhost:8080/realms/<realm>` for the browser and the Next.js server alike
(`KC_HOSTNAME`). Realm exports in `docker/keycloak/realms/` are imported on start, so a
configured realm is reproducible from the repository. The app's realm is `workspace`: one
confidential client, `workspace-web` (authorization code with PKCE, no direct grants), no
self-registration, no roles, and development users with fixed ids, so a user's `sub` is the
same after every reset. Its only redirect URI is `http://localhost:3000/api/auth/callback/keycloak`,
and its post-logout URI is `http://localhost:3000/`. `pnpm stack:up|down|reset` drive it.
Integration tests (NX-TEST-03) pass `describeIntegration` the probe `composeStack`
(`tests/support/compose-stack.ts`, `pg_isready` in the compose Postgres) instead of the default
`supabase status`, and read `DATABASE_URL` from `.env.local` (`tests/support/env.ts`).
**Enforced by.** The compose health checks (`pnpm stack:up` waits for both).
**Recorded in.** This entry; `.env.example`.

### Schema source: code-first with Drizzle

**Decision.** `schema-source: code-first` (NX-DB-01). Tables and enums are declared in
`lib/db/schema.ts` (NX-DRZ-04, `<nouns>Table`, `<noun>StatusEnum`); `pnpm db:generate --name
<verb>-<what>` writes the SQL migration to `drizzle/` and `pnpm db:migrate` applies it. The
migrations are never edited by hand. `lib/db/client.ts` is the profile's starter on postgres.js,
with prepared statements on because the app connects to Postgres directly, not through a
transaction pooler. `withTransaction` keeps the default statement timeouts (NX-DRZ-05: 8 s
interactive, 5 min system). The first tables are the sign-in's four. `drizzle-kit generate` adds
a new table's foreign keys before the unique constraints added to existing tables in the same
migration, so a reference to a constraint that does not exist yet is generated as two
migrations (`0002_add-thread-forks`, then `0003_create-thread-messages`).
**Enforced by.** CI (`drizzle-kit check`, and `drizzle-kit generate` must leave `drizzle/`
unchanged); `conventions check` (`inventory`, reading `drizzle/*.sql` per the `migrations` key);
`boundaries/external` (NX-DRZ-01).
**Recorded in.** This entry.

### Data ownership

**Decision.** `isolation: owner`. Each signed-in user owns their threads, projects and skill
preferences; there are no shared workspaces. The enterprise source catalogue and the skill
catalogue are shared data (NX-AUTH-05). Shared workspaces, such as a team seeing each other's
threads or source connections configured once per organisation, would make this a `tenant`
app, recorded here as a migration.
The owner is the signed-in Keycloak user: `ownerId` is their `sub`, which is also `users.id`
(see the sign-in). The four sign-in tables are Better Auth's, not owned data the app reads. The
owned tables are `projects`, `threads` and `thread_messages`: each row has an `owner_id`
referencing `users.id` (deleting a user deletes what they own); a message's reference
`(thread_id, owner_id)` → `threads(id, owner_id)` lets it belong only to a thread of its own
owner. Every repository method takes the `OwnerId` first and names it in its query.
**Enforced by.** `OwnerId` from `lib/auth/requester.ts` and `tsc` through the brand;
`conventions check` (`owner-id-type`); `assertIsolation()` in each module's command test (see
"Command tests").
**Recorded in.** This entry; `lib/auth/requester.ts`.

### Modules

**Decision.** Four modules. `threads` (rich: sessions, settle, snooze, wake, fork, the live
chat and its answers), `sources` (the enterprise systems and their records; a read-only domain),
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

### Sign-in: Better Auth against Keycloak

**Decision.** `docs/adr/0001` chose Better Auth 1.7 with only the `genericOAuth` plugin and its
`keycloak()` helper. Users are created in Keycloak; there is no sign-up, password or profile
editing in the app. A user's first sign-in creates their `users` row, and every sign-in refreshes
name and email from Keycloak.

- **One place.** `lib/auth/` is the only importer of `better-auth`. `auth.ts` builds the instance
  lazily on `db()` (NX-TYPE-06). `requester.ts` turns the session into an `OwnerRequester`.
  `handlers.ts` serves the routes. `session-cookie.ts` is the proxy's cookie check. The settings
  are validated in `lib/env.ts`.
- **`ownerId` is the Keycloak `sub`.** Better Auth drops the provider's id when it creates a
  user. `mapProfileToUser` therefore copies `sub` into `users.keycloak_sub`, and the
  `user.create.before` hook makes it `users.id`. The `users_id_is_keycloak_sub` check keeps the
  two equal. The realm's users have fixed ids, so a user's `ownerId` survives `pnpm stack:reset`.
  Account linking is off: a user deleted and re-created in Keycloak gets a new `sub` and cannot
  take over the old row by email.
- **Tables.** `users`, `sessions`, `accounts` and `verifications` are declared in
  `lib/db/schema.ts` and migrated by `drizzle/0000_create-auth-tables.sql`. Sessions live in
  Postgres (7 days), and signing out deletes the row. The cookie cache stays off. Keycloak's
  access and refresh tokens are stored encrypted with `BETTER_AUTH_SECRET`, and Better Auth
  refreshes them when they expire. OAuth state, the PKCE verifier and the nonce live in
  `verifications`, not in a cookie.
- **Routes.**
  - `GET /sign-in?returnTo=` starts the code flow with PKCE. `returnTo` must stay on the app's
    origin (`sameOriginPath`).
  - `/api/auth/*` is Better Auth's handler; the Keycloak callback is
    `/api/auth/callback/keycloak`.
  - `POST /sign-out` deletes the session and ends the Keycloak session (RP-initiated logout with
    `id_token_hint`), then returns to `/`.
  - `/update-user`, `/change-email` and `/delete-user` are disabled.
- **Who checks what.** `proxy.ts` checks only that a session cookie exists, the optimistic check
  Next.js recommends for Proxy. Without one, a page goes to `/sign-in` and `/api/*` gets 401. The
  real check is `getRequester()` next to the data: `app/(workspace)/page.tsx` redirects a visitor
  whose session has ended, and `/api/chat` answers 401. `lib/safe-action.ts` builds the action
  clients on the same `getRequester()`; every action uses `memberActionClient`, so a visitor
  gets `SignedOut` and the action does not run.

**Enforced by.** The `auth` ruleset (NX-AUTH-01: only `app/`, `lib/` and `queries.ts` import
the requester); `boundaries/external`. The check constraint `users_id_is_keycloak_sub`. Better
Auth's startup schema check, which refuses to run when `schema.ts` and its fields disagree.
**Recorded in.** This entry; `docs/adr/0001-auth-library-for-keycloak-sign-in.md`.

### Stored projects, threads, conversations and placement

**Decision.** Projects, threads and their conversations are stored per owner (see "Data
ownership"); creating a project or thread and forking a thread are use cases
(`projects/application/create-project.ts`, `threads/application/start-thread.ts`,
`threads/application/fork-thread.ts`) wired in the module's `commands.ts` and called from its
`actions.ts`, which the module's components call (`ProjectForm`, `useThreads`).
`app/(workspace)/page.tsx` reads the requester once and passes it to `listProjects` and
`listThreads`. A name the user already uses answers with that project instead of adding it
twice; the `projects_owner_id_name_key` index catches a race, answered as `Conflict`. The
browser picks a new thread's id (its chat needs it before the server answers) and stores the
thread before it sends the first message; a taken id is a `Conflict`, a project that is not
the user's a `NotFound`.

The conversation follows the AI SDK's message persistence: one `thread_messages` row per
`UIMessage`, with `parts` and `metadata` in `jsonb` as streamed, ordered by `position`, keyed
`(thread_id, id)` so a fork copies messages under their ids. The chat sends only its latest
message (`prepareSendMessagesRequest` in `ChatStore`); the server puts it after the stored
conversation, or in its old place when it is sent again, dropping what came after it, which is
how a regenerate replaces a reply (`withLatestMessage`, `domain/conversation.ts`). When the
reply ends, finished, stopped or failed, the response agent hands the conversation with the
reply to `saveMessages`, which replaces the stored one in a transaction; the stream is read to
its end on the server (`consumeSseStream`) so the reply is stored even if the browser went away.
The server names the replies (`generateMessageId`). A thread's chat loads its conversation from
`GET /api/threads/[id]/messages` the first time it opens; a chat this page started already has
it. A fork is stored first, with the conversation through the chosen response, then opened
(`forkPoint`; a question or a response not stored yet is a `NotFound`); its origin is a snapshot
in `forked_from_*`, not a reference.

Placement is stored on the thread: `settled_at`, `snoozed_until` and `woke_at`, at most one
set (`threads_one_placement`), none for active. Settle, snooze, restore, undo and opening a
woken thread are one action, `placeThreadAction`, whose input names the change (`kind`), not
the timestamps: `threads/application/place-thread.ts` applies the domain function with the
server's clock, so the browser cannot date a change; an undo (`return`) puts back the placement
the browser saw before. The browser shows the change at once and puts the thread back when the
action fails (`useThreads`). Nothing runs at a snooze's deadline: a due snooze reads as woken
at its deadline (`wakeIfDue`, in `listThreads` and before each change), and the browser wakes
an open page's threads live (`useSnoozeWake`). Asking again returns a parked thread to active
and stores the provider it now talks to (`answerThread`). Whether a response is in flight only
the browser knows, so it refuses a snooze while one is. Read-only sample data (sources and their records, skills) lives in each module's
`infra/sample.*.ts` adapter, read through `queries.ts` and `server.ts`; the catalogues reach the
browser through `SourcesProvider` and `SkillsProvider`. Skill activation and the source panel
width persist in `localStorage`; the stored skill ids are parsed with `storedSkillIdsSchema`
(NX-TYPE-03). There are no cache tags: every read is per request, and an action returns what it
stored, which the browser adds to its state.
**Enforced by.** `boundaries/element-types` (components never import `infra/` or `queries.ts`);
the `server-only` import in every `queries.ts`, `commands.ts` and `server.ts`; the
`thread_messages_thread_id_owner_id_fkey` and `threads_one_placement` constraints; the command
tests.
**Recorded in.** This entry.

### Threads without a project

**Decision.** A thread's `project_id` is nullable: null is a thread without a project, not a
hidden per-user default project, which would need creating at sign-in and hiding from every
list. The reference `(project_id, owner_id)` → `projects(id, owner_id)` lets a thread belong
only to a project of its own owner; with a null `project_id` it does not apply. In the domain,
`Thread.projectId` is the project's id (cross-module references are ids); the workspace
resolves it to a name through the project list, and the sidebar filter lists threads without
a project under "No project". A new thread starts without a project unless one is picked.
**Enforced by.** The `threads_project_id_owner_id_fkey` constraint; `startThread` answers
`NotFound` for a project the requester does not own.
**Recorded in.** This entry.

### Command tests

**Decision.** A thin write use case is tested at the command level, not by a unit test with
fakes plus a repository integration test: each module with stored data has one
`commands.integration.test.ts` that calls its commands and queries against the compose
Postgres with a requester the test builds (`tests/factories/requester.ts`), so no session or
auth mocking is needed. `withOwners()` (`tests/support/owners.ts`) signs the test's users up and
deletes them afterwards. The same file calls `assertIsolation()` through the commands and
queries (NX-AUTH-03). Actions are not tested: they only validate and hand the requester to the
command. A use case with rules worth example tables keeps its unit test (`answer-thread.test.ts`);
pure domain rules are tested by example in `domain/*.test.ts` (NX-TEST-06). Conventions 0.3.2
accepts a command test in place of both (laserjm/conventions#29).
**Enforced by.** `conventions check` (`use-case-test`, `repository-test`, `isolation-test`); the
command tests skip loudly without the stack (NX-TEST-03).
**Recorded in.** This entry.

### Answers come from the Vercel AI Gateway

**Decision.** `POST /api/chat` (`app/api/chat/route.ts`) only reads the requester and hands it
and the body to `answerThread` from `modules/threads/server.ts`. `modules/threads/commands.ts` validates it
with `chatTurnDtoSchema` at the edge and runs the use case `application/answer-thread.ts`.
The use case resolves the model, skill and records from their ids against the server's
catalogues (unknown ids are `NotFound`, answered with a 400), finds the thread among the
requester's (another user's thread is a `NotFound` like a missing one, answered with a 404) and
asks the `ResponseAgent` port to stream the stored conversation with the new message, then to
store it when the reply ends (see "Stored projects, threads, conversations and placement"). `infra/ai-gateway.response-agent.ts` implements the port with an AI SDK
`ToolLoopAgent` on the gateway, with the instructions in `infra/ai-gateway.instructions.ts`,
the model allowlist in `infra/ai-gateway.model-catalog.ts` and the `html_render` tool in
`infra/ai-sdk.html-render-tool.ts`. The tool's input and output schemas are in
`contracts.ts`, so the browser's message types never import `infra/`. The route reads the
requester and answers 401 without one. The command takes it as its first argument
(NX-LAYER-11), and the use case answers and stores only the requester's threads. The frame that shows an `html_render` page is feature-agnostic and lives in
`components/ui/html-render-*.tsx`; the helpers both sides share are in `lib/html-render/`.
**Enforced by.** `conventions check` (`use-case-test`, `rich-shape`), `boundaries/element-types`,
`boundaries/external` (the ORM-free, framework-free `application/`).
**Recorded in.** This entry.

### Styling: design tokens and Tailwind classes

**Decision.** `src/app/globals.css` is the only stylesheet. It holds the design tokens in three
layers, after T3 Code's `apps/web/src/index.css`: Tailwind's scales plus the dense type sizes
below `text-xs` (`text-2xs` 11px down to `text-5xs` 7px, registered with `cn` in
`lib/utils.ts`); semantic variables in `:root` (the workspace's warm greys) and `.dark`; and
`@theme inline` mappings that make them utilities (`bg-sidebar-row-hover`,
`text-secondary-label`, `shadow-popover`). Components style themselves with Tailwind classes
on those tokens and nothing else: no hex colours, no font sizes off the type scale, no CSS
files beside `globals.css`. Colours that only identify something (project letters, source
marks, record status, priority, issue type) use Tailwind's palette with a `dark:` variant; a
colour with meaning (errors, warnings, success) uses its token. Layout state that descendants
react to is a data attribute on a named group: `data-sidebar` and `data-mobile-sidebar` on
`group/app`, `data-session` and `data-source-panel` on `group/main` (read as
`group-data-[sidebar=collapsed]/app:…`). Class names are literal strings, never assembled at
runtime, because Tailwind finds them by scanning the source. The custom breakpoints keep the
workspace's widths: `max-desktop:` (below 1200px), `3xl:` (1600px), `4xl:` (1800px), plus
`short:`/`shorter:` for windows 720/650px tall and `touch:` for screens without hover. The
type scale is the same at every width. Appearance is System, Light or Dark (Settings → General,
`lib/theme/`), stored in this browser; an inline script in the root layout sets `.dark` on
`<html>` before the first paint and follows the operating system while the choice is System.
**Enforced by.** `scripts/check-styles.mjs` (`pnpm lint`, CI): STYLE-01 one stylesheet, STYLE-02
no hex colours or colour functions, STYLE-03 no arbitrary font sizes. Its allowlist names two
files: `lib/html-render/html-render.ts`, whose iframe pages cannot read the app's CSS
variables, and the VS Code brand colour in `components/ui/vscode-icon.tsx`.
**Recorded in.** This entry; the colour-mapping comment in `globals.css`.

## Deviations

<!-- Rules this project does not follow yet. Name the files or globs in backticks in the Deviation column: findings of that rule there are warnings, not errors; a row without paths covers the whole project. A disabled rule in source without a row here fails `conventions check`. Review quarterly. -->

| Rule | Deviation | Why | Until |
| --- | --- | --- | --- |

## Legacy

<!-- Folders declared in the `legacy:` key above and the module that will replace each. -->

| Folder | Replaced by module | Status |
| --- | --- | --- |
