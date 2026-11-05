# Architecture

<!-- conventions header: read by the linter, `conventions check` and the conventions skill. Keep the keys. -->
```yaml
conventions: 0.3.2
profile: nextjs
bindings: [drizzle, zod]   # plain Postgres: no database-platform binding; server actions are lib/actions/, not a binding
app-root: src
schema-source: code-first        # src/lib/db/schema.ts generates the migrations in drizzle/
isolation: owner                 # each signed-in user owns their threads, projects and preferences
# cache: adopted with nothing to check yet (no cache tags; every read is per request).
rulesets: [structure, layers, naming, types, errors, rich, cross-module, testing, zod, migration, database, drizzle, auth, cache]
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
The owner is the signed-in Keycloak user, so the code says user: `User.id` (a `UserId`) is their
`sub`, which is also `users.id` (see the sign-in). The four sign-in tables are Better Auth's,
not owned data the app reads. The owned tables are `projects`, `threads` and `thread_messages`:
each row has a `user_id` referencing `users.id`, like `sessions` and `accounts` (deleting a user
deletes what they own); a message's reference `(thread_id, user_id)` → `threads(id, user_id)`
lets it belong only to a thread of the same user. Every query and repository method on owned
data takes the user (or their `UserId`) first and names it in its query.
**Enforced by.** The `UserId` brand from `lib/auth/user.ts` (a zod brand) and `tsc`;
`conventions check` (`owner-id-type`); `assertIsolation()` in each module's command or action
test (see "Command tests").
**Recorded in.** This entry; `lib/auth/user.ts`; `drizzle/0005_rename-owner-to-user.sql`.

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
  lazily on `db()` (NX-TYPE-06). `session.ts` has `getUser()`, which turns the session into a
  `User` (`{ id, name, email }`, `user.ts`), once per request (`cache`). `handlers.ts` serves the
  routes. `session-cookie.ts` is the proxy's cookie check. The settings are validated in
  `lib/env.ts`.
- **A user's id is the Keycloak `sub`.** Better Auth drops the provider's id when it creates a
  user. `mapProfileToUser` therefore copies `sub` into `users.keycloak_sub`, and the
  `user.create.before` hook makes it `users.id`. The `users_id_is_keycloak_sub` check keeps the
  two equal. The realm's users have fixed ids, so a user's id survives `pnpm stack:reset`.
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
  real check is `getUser()` next to the data: `app/(workspace)/page.tsx` redirects a visitor
  whose session has ended (and hands the shell only name and email), and `/api/chat` and
  `/api/threads/[id]/messages` answer 401. Every server action is `action(…)` from
  `lib/actions/server.ts`, which calls the same `getUser()`: a visitor gets `SignedOut` and the
  action does not run, and the browser goes to `/sign-in` and back (see "Server actions").

**Enforced by.** The `auth` ruleset (NX-AUTH-01: only `app/`, `lib/` and `queries.ts` read the
session), narrowed by ACTION-03 (`scripts/check-actions.mjs`: only `lib/actions/server.ts`,
`lib/auth/` and `app/` import `lib/auth/session`); `boundaries/external`. The check constraint `users_id_is_keycloak_sub`. Better
Auth's startup schema check, which refuses to run when `schema.ts` and its fields disagree.
**Recorded in.** This entry; `docs/adr/0001-auth-library-for-keycloak-sign-in.md`.

### Stored projects, threads, conversations and placement

**Decision.** Projects, threads and their conversations are stored per user (see "Data
ownership"); creating a project is `createProjectAction` in `projects/actions.ts`, which
writes itself (no command, use case or repository, see "Leaving `@conventions/nextjs`"), and
creating and forking a thread are use cases (`threads/application/start-thread.ts`,
`threads/application/fork-thread.ts`) wired in the module's `commands.ts` and called from its
`actions.ts`. The module's components call the actions (`ProjectForm`, `useThreads`).
`app/(workspace)/page.tsx` reads the user once and passes them to `listProjects` and
`listThreads`. A name the user already uses answers with that project instead of adding it
twice; the `projects_user_id_name_key` index catches a race, answered as `Conflict`. The
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
`thread_messages_thread_id_user_id_fkey` and `threads_one_placement` constraints; the command
tests.
**Recorded in.** This entry.

### Threads without a project

**Decision.** A thread's `project_id` is nullable: null is a thread without a project, not a
hidden per-user default project, which would need creating at sign-in and hiding from every
list. The reference `(project_id, user_id)` → `projects(id, user_id)` lets a thread belong
only to a project of the same user; with a null `project_id` it does not apply. In the domain,
`Thread.projectId` is the project's id (cross-module references are ids); the workspace
resolves it to a name through the project list, and the sidebar filter lists threads without
a project under "No project". A new thread starts without a project unless one is picked.
**Enforced by.** The `threads_project_id_user_id_fkey` constraint; `startThread` answers
`NotFound` for a project the user does not own.
**Recorded in.** This entry.

### Command tests

**Decision.** A thin write use case is tested at the command level, not by a unit test with
fakes plus a repository integration test: each module with stored data has one
`commands.integration.test.ts` that calls its commands and queries against the compose
Postgres with a user the test builds (`aUser`, `tests/factories/user.ts`), so no session or
auth mocking is needed. `withUsers()` (`tests/support/users.ts`) signs the test's users up and
deletes them afterwards. The same file calls `assertIsolation()` through the commands and
queries (NX-AUTH-03). In a module with `commands.ts` the actions are not tested: they only
validate and hand the user to the command. A module whose actions write themselves (`projects`) has `actions.integration.test.ts`
instead, which calls the actions as the browser does: `vi.mock("@/lib/auth/session", () =>
import("@/tests/support/session"))` swaps in a fake session, and `callAs(user, action,
input)` calls as that user, or as a visitor with `null`, so the test covers the sign-in check
and the validation too. A use case with rules worth example tables keeps its unit test (`answer-thread.test.ts`);
pure domain rules are tested by example in `domain/*.test.ts` (NX-TEST-06). Conventions 0.3.2
accepts a command test in place of both (laserjm/conventions#29).
**Enforced by.** `conventions check` (`use-case-test`, `repository-test`, `isolation-test`); the
command tests skip loudly without the stack (NX-TEST-03).
**Recorded in.** This entry.

### Answers come from the Vercel AI Gateway

**Decision.** `POST /api/chat` (`app/api/chat/route.ts`) only reads the user and hands them
and the body to `answerThread` from `modules/threads/server.ts`. `modules/threads/commands.ts` validates it
with `chatTurnDtoSchema` at the edge and runs the use case `application/answer-thread.ts`.
The use case resolves the model, skill and records from their ids against the server's
catalogues (unknown ids are `NotFound`, answered with a 400), finds the thread among the
user's (another user's thread is a `NotFound` like a missing one, answered with a 404) and
asks the `ResponseAgent` port to stream the stored conversation with the new message, then to
store it when the reply ends (see "Stored projects, threads, conversations and placement"). `infra/ai-gateway.response-agent.ts` implements the port with an AI SDK
`ToolLoopAgent` on the gateway, with the instructions in `infra/ai-gateway.instructions.ts`,
the model allowlist in `infra/ai-gateway.model-catalog.ts` and the `html_render` tool in
`infra/ai-sdk.html-render-tool.ts`. The tool's input and output schemas are in
`contracts.ts`, so the browser's message types never import `infra/`. The route reads the
user and answers 401 without one. The command takes them as its first argument
(NX-LAYER-11), and the use case answers and stores only the user's threads. The frame that shows an `html_render` page is feature-agnostic and lives in
`components/ui/html-render-*.tsx`; the helpers both sides share are in `lib/html-render/`.
Message text renders as Markdown through `components/ui/markdown.tsx`: GitHub-flavoured, `$$`
math, raw HTML shown as text, a user's single newlines kept. `lib/markdown/` holds the plugins,
the block splitting that lets a streamed reply re-render only its last block, and the pure
readers for code blocks and links. Code blocks (`components/ui/code-block.tsx`) are coloured by
Shiki, formulas (`components/ui/math.tsx`) are typeset by KaTeX as MathML, and a
```` ```mermaid ```` fence is drawn by `components/ui/mermaid-diagram.tsx` with Pele once its
block has finished streaming. Each library loads with the first message that needs it, and
all three take their colours from the tokens, so `globals.css` stays the only stylesheet. Links
to GitHub pull requests and issues, GitLab merge requests and files show as chips. The
instructions point diagrams at Mermaid, math at `$$`, tables at Markdown, and charts from
data and long or sortable tables at `html_render`.
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

### Server actions

**Decision.** Server actions are the project's own `lib/actions/`, not next-safe-action. A
module's `actions.ts` exports `export const <name>Action = action(schema, (input, { user })
=> command(user, input))`, or does the write in the handler itself when the module has no
`commands.ts` (`projects`). Every export of a `"use server"` file can be called from the browser,
so `actions.ts` exports nothing but actions; a helper the handlers share stays unexported. `action` (`lib/actions/define.ts`, bound to the session in
`lib/actions/server.ts`) runs four steps in order: it reads the user (`getUser()`) and answers
`SignedOut` without one, before the input is looked at; it parses the input with the schema and
answers `ValidationFailed` (`issues: [{ path: "change.until", message }]`); it runs the handler,
whose `Result` reaches the caller as is; and it turns anything thrown into `Unexpected` with a
trace id, logged on the server, after `unstable_rethrow` has let `redirect()` and `notFound()`
through. `publicAction(schema, handler)` is the same without the first step, for visitors; the
comment above it says why. The caller gets one flat `Result` whose error type is the command's
errors plus `ValidationFailed | SignedOut | Unexpected`, inferred from the command's whole return
type.

In the browser, `callAction(action, input)` (`lib/actions/client.ts`) never throws: a call that
does not reach the server answers `Unreachable`, and `SignedOut` sends the browser to
`/sign-in?returnTo=<this page>` once, so no component handles an ended session.
`useAction(action, { onSuccess, onError })` wraps it for components with `run`, `pending` and
`error`. `errorMessage(error, messages)` (`lib/actions/messages.ts`) has the copy for the standard
errors; the compiler asks the caller for one for each of the module's own errors, and a caller
may say a standard one better. FormData and `useActionState` are not supported yet: no form
needs to work before hydration; that would be a `formAction` beside `action`.
**Enforced by.** `scripts/check-actions.mjs` (`pnpm lint`, CI): ACTION-01 `"use server"` only
in `modules/*/actions.ts`, ACTION-02 every export of it is `action(…)` or `publicAction(…)` from
`@/lib/actions/server` (a public one with a comment saying why), ACTION-03 only
`lib/actions/server.ts`, `lib/auth/` and `app/` import `lib/auth/session`. The unit tests of
`define.ts`, `client.ts` and `messages.ts`. Next.js's own Origin check on server actions (CSRF).
**Recorded in.** This entry.

### Leaving `@conventions/nextjs`

**Decision.** The app is moving off the profile's runtime package one module and one export at a
time, toward plain TypeScript the project owns. The local replacements have the same shapes as
the package's, so a migrated module and one still on the package can call each other:
`lib/result.ts` (`Result`, `ok`, `err`), `lib/errors.ts` (`Conflict`, `ConstraintViolation`) and
`lib/db/errors.ts` (`violatedConstraint`); the action clients are the project's own
`lib/actions/` (see "Server actions"). `defineUseCase` and `defineRepository` only return
their argument: a use case is a typed `async function`, a repository an object that `satisfies`
its port. A module also stops splitting its types between `domain/` and `contracts.ts`: the
entity, its errors and its rules live in `contracts.ts`. A module catches the
`ConstraintViolation` class its own repository throws, so a module moves its repository and
command together.

A module whose writes hold no rule worth a layer of its own drops `domain/`, `application/`,
`infra/` and `commands.ts`: `contracts.ts` (types, errors, rules, input schemas), `queries.ts`
(reads, each taking the user first) and `actions.ts` (writes: `action(…)` signs the caller
in and validates, and the handler queries Drizzle) are the whole module. `projects` has this
shape; `server.ts` re-exports its actions for other modules' tests and its queries for pages.
Every query names `user.id`. Without a repository, `conventions check` no longer
requires the isolation test (NX-AUTH-03 looks at repositories only); the action test keeps its
`assertIsolation()` call regardless. A handler reads a refused constraint with
`violatedConstraint` and returns `err(conflict(...))` itself, with no `ConstraintViolation` in
between. `actions.ts` cannot import `queries.ts` (NX-LAYER-01), so a read only a write needs
lives in `actions.ts`, unexported.

Order: (1) `projects`, done; (2) `threads`, `skills`, `sources`, which also need `NotFound`,
`ValidationFailed`, `notFound`, `bug` and `map`; (3) `OwnerId`/`OwnerRequester`, done: the
project's own `User` and `UserId` (`lib/auth/user.ts`, see "Data ownership"), without the
package's unused `kind`, `roles` and `systemRequester`; a background job, when there is one,
passes the `UserId` of the user it works for; (4) `@conventions/nextjs/drizzle`
(`createTransactionRunner`) and `/testing` into `lib/` and `tests/support/`
(`/next-safe-action` is done: `lib/actions/`); (5) the ESLint config, the CLI and this file's
header.
**Enforced by.** `tsc`; the Deviations rows for the rules this breaks, which shrink as the
migration goes and leave with the profile.
**Recorded in.** This entry; the Deviations table.

## Deviations

<!-- Rules this project does not follow yet. Name the files or globs in backticks in the Deviation column: findings of that rule there are warnings, not errors; a row without paths covers the whole project. A disabled rule in source without a row here fails `conventions check`. Review quarterly. -->

| Rule | Deviation | Why | Until |
| --- | --- | --- | --- |
| NX-LAYER-03 | `modules/projects/queries.ts` and `modules/projects/actions.ts` import `drizzle-orm` and `lib/db` instead of going through `infra/` | Leaving `@conventions/nextjs`: a module without rules worth a layer queries Drizzle in `queries.ts` and `actions.ts` | The profile is removed (step 5) |
| NX-AUTH-01 | `lib/actions/server.ts` reads the session (through `getUser`), where the rule names `lib/safe-action.ts` | Server actions are `lib/actions/`, not next-safe-action ("Server actions"); ACTION-03 keeps the session's importers to this file, `lib/auth/` and `app/` | The profile is removed (step 5) |
| NX-LAYER-01 | `modules/threads/application/*.ts` import the `User` and `UserId` types from `lib/auth/user.ts` | Leaving `@conventions/nextjs`: they replace the package's `OwnerRequester` and `OwnerId`; `user.ts` holds types and the zod brand only, no session or framework | `threads` drops `application/` (step 2) |
| NX-NAME-50 | `lib/actions/*.ts`: `action`, `publicAction`, `callAction` and `useAction` end in `Action` outside an `actions.ts` | They are the action API itself; ACTION-02 names the server actions (`<name>Action` in `actions.ts`) | The profile is removed (step 5) |
| NX-ERR-03 | `lib/errors.ts` defines `Conflict`, `NotFound`, `ValidationFailed`, `SignedOut` and `Unexpected` instead of importing them from `@conventions/nextjs/core` | Leaving `@conventions/nextjs`: the standard errors move into `lib/` | The profile is removed (step 5) |

## Legacy

<!-- Folders declared in the `legacy:` key above and the module that will replace each. -->

| Folder | Replaced by module | Status |
| --- | --- | --- |
