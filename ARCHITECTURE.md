# Architecture

This file records the project's structural decisions. Each entry says what was decided, what
enforces it and where else it is recorded. **Change an entry together with the decision that
changes it.** `docs/adr/` has the longer write-ups (why, the options, in what order).

## Decisions

### App root is `src/`

**Decision.** `app/`, `modules/`, `lib/` and `components/` sit in `src/`; `@/` points there.
Configuration (`next.config.ts`, `vitest.config.mts`, `eslint.config.mjs`) stays in
the package root.
**Enforced by.** `tsconfig.json` paths.
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
Integration tests pass `describeIntegration` the probe `composeStack`
(`tests/support/compose-stack.ts`, `pg_isready` in the compose Postgres), and read `DATABASE_URL` from `.env.local` (`tests/support/env.ts`).
**Enforced by.** The compose health checks (`pnpm stack:up` waits for both).
**Recorded in.** This entry; `.env.example`.

### Schema source: code-first with Drizzle

**Decision.** Code-first. Tables and enums are declared in `lib/db/schema.ts`
(`<nouns>Table`, `<noun>StatusEnum`); `pnpm db:generate --name
<verb>-<what>` writes the SQL migration to `drizzle/` and `pnpm db:migrate` applies it. The
migrations are never edited by hand. `lib/db/client.ts` runs on postgres.js,
with prepared statements on because the app connects to Postgres directly, not through a
transaction pooler. `withTransaction` keeps the default statement timeouts (8 s
interactive, 5 min system). The first tables are the sign-in's four. `drizzle-kit generate` adds
a new table's foreign keys before the unique constraints added to existing tables in the same
migration, so a reference to a constraint that does not exist yet is generated as two
migrations (`0002_add-thread-forks`, then `0003_create-thread-messages`).
**Enforced by.** CI (`drizzle-kit check`, and `drizzle-kit generate` must leave `drizzle/`
unchanged).
**Recorded in.** This entry.

### Data ownership

**Decision.** Each signed-in user owns their threads, projects and skill
preferences; there are no shared workspaces. The enterprise source catalogue and the skill
catalogue are shared data. Shared workspaces, such as a team seeing each other's
threads or source connections configured once per organisation, would add an
organisation to every owned row, recorded here when it comes.
The owner is the signed-in Keycloak user, so the code says user: `User.id` (a `UserId`) is their
`sub`, which is also `users.id` (see the sign-in). The four sign-in tables are Better Auth's,
not owned data the app reads. The owned tables are `projects`, `threads` and `thread_messages`:
each row has a `user_id` referencing `users.id`, like `sessions` and `accounts` (deleting a user
deletes what they own); a message's reference `(thread_id, user_id)` → `threads(id, user_id)`
lets it belong only to a thread of the same user. Every query and repository method on owned
data takes the user (or their `UserId`) first and names it in its query.
**Enforced by.** The `UserId` brand from `lib/auth/user.ts` (a zod brand) and `tsc`;
`assertIsolation()` in each module's command or action
test (see "Command tests").
**Recorded in.** This entry; `lib/auth/user.ts`; `drizzle/0005_rename-owner-to-user.sql`.

### Modules

**Decision.** Five modules. `agent` (the runtime AI: the model allowlist, instructions, tools
and the agent loop; see "Answers come from the Vercel AI Gateway"), `threads` (rich:
conversations, settle, snooze, wake, fork, the live chat), `sources` (the enterprise systems and their records; a read-only domain),
`skills` (the skill catalogue and its activation in this browser) and `projects` (the project
list, the add-project rule and the sidebar filter). `app/(workspace)/` composes them; its
`_components/` hold the shell, sidebar, settings and new-thread heading, which only that route
uses. Another module is reached only through its `index.ts`, which is safe to import in the
browser, or its `server.ts`, which is `server-only`; inside a module, files import each other
relatively.
**Enforced by.** ESLint `no-restricted-imports` (`eslint.config.mjs`: `@/modules/<x>/` followed
by anything but `index` or `server` is an error); the `server-only` import in every `server.ts`.
**Recorded in.** This entry.

### Cross-module references are ids

**Decision.** A module's `domain/` imports no value from another module, only a type such as
`ModelProvider` from `agent`, so a
thread refers to its source, records and skill by id (`ThreadScope = { sourceId, recordIds }`,
`skillId`). Components resolve the ids through the other module's public API
(`useSources().sourceById`, `useSkills().skillById`). Source-specific presentation (overview
title, breadcrumb, board view, list label) is data on the source, not a branch on its id.
**Enforced by.** Review.
**Recorded in.** This entry.

### Sign-in: Better Auth against Keycloak

**Decision.** `docs/adr/0001` chose Better Auth 1.7 with only the `genericOAuth` plugin and its
`keycloak()` helper. Users are created in Keycloak; there is no sign-up, password or profile
editing in the app. A user's first sign-in creates their `users` row, and every sign-in refreshes
name and email from Keycloak.

- **One place.** `lib/auth/` is the only importer of `better-auth`. `auth.ts` builds the instance
  lazily on `db()`. `session.ts` has `getUser()`, which turns the session into a
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
  - `GET /api/sign-in?returnTo=` starts the code flow with PKCE. `returnTo` must stay on the app's
    origin (`sameOriginPath`).
  - `/api/auth/*` is Better Auth's handler; the Keycloak callback is
    `/api/auth/callback/keycloak`.
  - `POST /api/sign-out` deletes the session and ends the Keycloak session (RP-initiated logout with
    `id_token_hint`), then returns to `/`.
  - `/update-user`, `/change-email` and `/delete-user` are disabled.
- **Who checks what.** `proxy.ts` checks only that a session cookie exists, the optimistic check
  Next.js recommends for Proxy. Without one, a page goes to `/api/sign-in` and the rest of `/api/*` gets 401. The
  real check is `getUser()` next to the data: `app/(workspace)/page.tsx` redirects a visitor
  whose session has ended (and hands the shell only name and email), and both methods of
  `/api/threads/[id]/messages` answer 401. Every server action is `action(…)` from
  `lib/actions/server.ts`, which calls the same `getUser()`: a visitor gets `SignedOut` and the
  action does not run, and the browser goes to `/api/sign-in` and back (see "Server actions").

**Enforced by.** ACTION-03 (`scripts/check-actions.mjs`: only `lib/actions/server.ts`,
`lib/auth/` and `app/` import `lib/auth/session`); ESLint `no-restricted-imports` (only
`lib/auth/` imports `better-auth`). The check constraint `users_id_is_keycloak_sub`. Better
Auth's startup schema check, which refuses to run when `schema.ts` and its fields disagree.
**Recorded in.** This entry; `docs/adr/0001-auth-library-for-keycloak-sign-in.md`.

### Stored projects, threads, conversations and placement

**Decision.** Projects, threads and their conversations are stored per user (see "Data
ownership"); creating a project is `createProjectAction` in `projects/actions.ts`, which
writes itself (no command, use case or repository, see "Module shape"), and
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
reply ends, finished, stopped or failed, `runAgent` hands the conversation with the
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
the browser knows, so it refuses a snooze while one is. The source catalogue is read-only
sample data in `sources/catalog.ts`; the skill catalogue is one
`skills/catalog/<id>/SKILL.md` per skill (see "Skills are SKILL.md files"). Both are read through
`queries.ts` and `server.ts`, and reach the browser through `SourcesProvider` and `SkillsProvider`. Skill activation and the source panel
width persist in `localStorage`; the stored skill ids are parsed with `storedSkillIdsSchema`. There are no cache tags: every read is per request, and an action returns what it
stored, which the browser adds to its state.
**Enforced by.** The `server-only` import in every `queries.ts`, `commands.ts` and `server.ts`
(a client component that imports one fails the build); the
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
queries. In a module with `commands.ts` the actions are not tested: they only
validate and hand the user to the command. A module whose actions write themselves (`projects`) has `actions.integration.test.ts`
instead, which calls the actions as the browser does: `vi.mock("@/lib/auth/session", () =>
import("@/tests/support/session"))` swaps in a fake session, and `callAs(user, action,
input)` calls as that user, or as a visitor with `null`, so the test covers the sign-in check
and the validation too. A use case with rules worth example tables keeps its unit test (`answer-thread.test.ts`);
pure domain rules are tested by example in `domain/*.test.ts`.
**Enforced by.** Review; the command tests skip loudly without the stack (`describeIntegration`).
**Recorded in.** This entry.

### Answers come from the Vercel AI Gateway

**Decision.** `POST /api/threads/[id]/messages` (`app/api/threads/[id]/messages/route.ts`) only
reads the user and hands them, the thread id and the body to `answerThread` from
`modules/threads/server.ts`. `modules/threads/commands.ts` validates the id with
`threadIdSchema` (an id that is not a uuid is a 404) and the body with `chatTurnDtoSchema`, and
runs the use case `application/answer-thread.ts`. The use case finds the thread among the
user's (another user's thread is a `NotFound` like a missing one, answered with a 404), puts
the new message after the stored conversation and hands both, with the user, to `runAgent` from
`modules/agent/server.ts`. Once the agent answers, the thread returns to active and records the
provider of the model that answered.

The `agent` module is the runtime AI, flat by file:
- `run.ts`: `runAgent(request)` resolves the context, validates the conversation against the
  tools and streams the reply with an AI SDK `ToolLoopAgent` on the gateway (at most 5 steps),
  then hands the conversation to `onEnd`. It returns the response and the model.
- `context.ts`: `resolveContext` turns the browser's ids into the model, skill and records
  (unknown ids are `NotFound`, answered with a 400), so the prompt only ever holds what the
  server offers. The `AgentContext` it returns carries the signed-in user, so a tool reads only
  what is theirs. It also turns `skillIds`, the skills switched on in this browser, into
  `offeredSkills`: known ones only (a stale id is left out, not refused), without the picked
  skill.
- `models.ts`: the model allowlist with gateway ids, and `listModelChoices` for the composer.
- `instructions/*.md`: the prompt as Markdown, so it reads and diffs as text: `workspace.md`
  (who the agent is, how it answers) and `formatting.md` (Mermaid, math, tables, when to call
  `html_render`). A `.md` file imports as its text: Turbopack's `text` module type
  (`next.config.ts`) bundles it into the server code, so nothing is read from disk at runtime;
  the `markdownAsText` plugin does the same in Vitest, and `src/markdown.d.ts` types it.
- `instructions.ts`: the two files, then the picked skill in full, then the offered skills by
  id, name and description ("Skills you can load"), then the attached records. The records stay
  TypeScript, because they are built from data.
- `tools.ts`: the registry. `tools` is every tool the agent knows, its own and the modules'
  (see "Agent tools live in their module"); `toolsFor(context)` picks the ones one answer may
  call and what each knows of the thread. Stored conversations hold the tool names and every
  send validates the whole conversation against all of `tools`, so a tool is never renamed and a
  removed one keeps a stub under its name; `tools.test.ts` lists the names.
- `html-render.tool.ts`: the agent's own tool, because it presents and acts on no module's data.
- `contracts.ts`: the browser-safe types (`WorkspaceUIMessage`, the tool schemas, `ModelChoice`,
  `ChatOptions`), so the chat UI never imports the server side.

The frame that shows an `html_render` page is feature-agnostic and lives in
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
**Enforced by.** `agent/context.test.ts`, `answer-thread.test.ts` and the command tests.
**Recorded in.** This entry.

### Agent tools live in their module

**Decision.** A tool is another way into a module, beside its pages and actions, so it lives in
the module it acts on and is a thin wrapper over that module's `queries.ts` (or, for a write,
its actions). `sources/tools.ts` is the pattern: `search_records` searches the records the
thread attached, and `skills/tools.ts` (`load_skill`, see "Skills are SKILL.md files") follows
it.
- **Files.** The tool's input and output schemas, and the rule it applies (`searchRecords`), are
  in the module's `contracts.ts`, so the browser can type the tool's parts. The tool is in
  `<module>/tools.ts` (`server-only`), exported as `<module>Tools` from `server.ts`. Its chat
  card is in `<module>/components/` (`RecordSearchCall`), exported from `index.ts`; the chat's
  `message-parts.tsx` maps the part's state onto it.
- **Context, not trust.** What a tool may see comes from the server, never from the model: the
  tool declares it with `contextSchema` (`{ scope?: RecordScope }`, ids as everywhere between
  modules), and `toolsFor` in `agent/tools.ts` fills it from the resolved `AgentContext`.
  `search_records` reads through `listScopedRecords(scope)`, so a record outside the thread's
  scope is never read, whatever the model asks. A tool whose context the thread lacks is not
  offered (`activeTools`), and its `execute` refuses anyway.
- **Registration.** `agent/tools.ts` spreads the module's tools into `tools`, adds the tool's
  context to `toolsFor`, and `WorkspaceUITools` in `agent/contracts.ts` gets its types.
- **Behaviour.** The tools only read. The attached records are still in the prompt as well;
  `search_records` lets the model filter them by status, priority, owner or words.
**Enforced by.** `sources/tools.test.ts` (only scoped records, refused without a scope);
`agent/tools.test.ts` (the tool names, what `toolsFor` offers); `agent/run.test.ts` (on a mock
model, the call offers the tools and `execute` sees the thread's scope); `tsc`
(`WorkspaceUITools`, `toolsContext`).
**Recorded in.** This entry.

### Skills are SKILL.md files

**Decision.** Each skill is a folder, `modules/skills/catalog/<id>/SKILL.md`: the folder name is
its id, the frontmatter holds `name`, `description`, `output`, `prompt`, `enabledByDefault` and
`order` (one `key: value` per line), and the body is the instructions the agent gets. A folder
may hold more files for the skill (examples, references). `catalog.ts` picks the files up with
Turbopack's `import.meta.glob`, bundled with the server code like the agent's instructions,
parses each with a strict schema and sorts by `order` (a glob sorts by path). A malformed file
throws with its path when the catalogue loads, which `next build` does. The browser gets the
whole skill, instructions included: the settings panel shows them. Adding a skill is adding a
folder.

A skill reaches the agent two ways. The one the user picks for a message is in the prompt in
full, as before. The others the user switched on (`skillIds` with each message, from
`useSkillPreferences`) are listed by id, name and description only, and the model loads one's
instructions with `load_skill` (`skills/tools.ts`) when a question fits it. The tool's context
is the offered ids, filled by the server, so it never loads a skill the user switched off. Its
chat card, `SkillLoadCall`, shows "Using the “Risk review” skill".
**Enforced by.** `skills/catalog.test.ts` (every file parses, in order; malformed files are
refused); `next build`; `skills/tools.test.ts` (only offered skills load);
`agent/context.test.ts` (what is offered); `agent/run.test.ts` (on a mock model, the list is in
the prompt and the tool answers).
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
`/api/sign-in?returnTo=<this page>` once, so no component handles an ended session.
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

### Module shape

**Decision.** A module is flat by default: `contracts.ts` (types, errors, rules, input
schemas), `queries.ts` (reads, each taking the user first), `actions.ts` (writes: `action(…)`
signs the caller in and validates, and the handler queries Drizzle), `components/`, `index.ts`
and `server.ts`. `projects` has this shape; `server.ts` re-exports its actions for other
modules' tests and its queries for pages. Every query names `user.id`, and the action test
calls `assertIsolation()`. A handler reads a refused constraint with `violatedConstraint`
(`lib/db/errors.ts`) and returns `err(conflict(...))` itself. A module adds a file only for a
real need, named after what it holds (`tools.ts`, `run.ts`), not after a layer.

`threads` still has the older layered shape (`domain/`, `application/`, `infra/`,
`commands.ts`); it becomes flat as it changes. `skills` and `sources` are flat. A use case there is a typed `async function` (`defineUseCase` only
returns its argument), a repository an object that `satisfies` its port, and a module catches
the `ConstraintViolation` its own repository throws.
**Enforced by.** Review.
**Recorded in.** This entry.

### Runtime helpers from `@conventions/nextjs`

**Decision.** The project dropped the conventions profile's tooling (its CLI, ESLint config and
CI checks) and keeps only its runtime package for what is not yet in `lib/`:
`@conventions/nextjs/core` (`Result` helpers, `NotFound`, `ValidationFailed`, `notFound`, `bug`,
`defineUseCase`, `defineRepository`), `/drizzle` (`createTransactionRunner`) and `/testing`
(`describeIntegration`, `assertIsolation`, `localStack`). The project's own versions have the
same shapes, so code on either can call the other: `lib/result.ts` (`Result`, `ok`, `err`),
`lib/errors.ts` (the standard errors) and `lib/db/errors.ts` (`violatedConstraint`). An import
moves to `lib/` or `tests/support/` when its module is reworked; the package goes when nothing
imports it.
**Enforced by.** `tsc`.
**Recorded in.** This entry.
