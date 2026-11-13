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
Integration tests run when `pg_isready` succeeds in the compose Postgres (`describeIntegration`,
`tests/support/integration.ts`), and read `DATABASE_URL` from `.env.local` (`tests/support/env.ts`).
**Enforced by.** The compose health checks (`pnpm stack:up` waits for both).
**Recorded in.** This entry; `.env.example`.

### Schema source: code-first with Drizzle

**Decision.** Code-first. Tables and enums are declared in `lib/db/schema.ts`
(`<nouns>Table`, `<noun>StatusEnum`); `pnpm db:generate --name
<verb>-<what>` writes the SQL migration to `drizzle/` and `pnpm db:migrate` applies it. The
migrations are never edited by hand. `lib/db/client.ts` runs on postgres.js,
with prepared statements on because the app connects to Postgres directly, not through a
transaction pooler. `withTransaction` sets an 8 s statement timeout for the transaction
only (`set_config(…, true)`), so it never reaches the next client of a pooled connection. The first tables are the sign-in's four. `drizzle-kit generate` adds
a new table's foreign keys before the unique constraints added to existing tables in the same
migration, so a reference to a constraint that does not exist yet is generated as two
migrations (`0002_add-thread-forks`, then `0003_create-thread-messages`).
**Enforced by.** CI (`drizzle-kit check`, and `drizzle-kit generate` must leave `drizzle/`
unchanged).
**Recorded in.** This entry.

### Data ownership

**Decision.** Each signed-in user owns their threads, projects and skill
preferences; there are no shared workspaces. A user's sources come from their connections
(see "Integrations are provider folders"); the provider and skill catalogues are shared data. Shared workspaces, such as a team seeing each other's
threads or source connections configured once per organisation, would add an
organisation to every owned row, recorded here when it comes.
The owner is the signed-in Keycloak user, so the code says user: `User.id` (a `UserId`) is their
`sub`, which is also `users.id` (see the sign-in). The four sign-in tables are Better Auth's,
not owned data the app reads. The owned tables are `projects`, `threads`, `thread_messages`, `connections` and
`connection_secrets`:
each row has a `user_id` referencing `users.id`, like `sessions` and `accounts` (deleting a user
deletes what they own); a message's reference `(thread_id, user_id)` → `threads(id, user_id)`
lets it belong only to a thread of the same user. Every query and write on owned data takes
the user first and names their id in its query.
**Enforced by.** The `UserId` brand from `lib/auth/user.ts` (a zod brand) and `tsc`;
`assertIsolation()` in each module's integration tests (see "Integration tests").
**Recorded in.** This entry; `lib/auth/user.ts`; `drizzle/0005_rename-owner-to-user.sql`.

### Modules

**Decision.** Seven modules. `agent` (the runtime AI: the model allowlist, instructions, tools
and the agent loop; see "Answers come from the Vercel AI Gateway"), `threads` (rich:
conversations, settle, snooze, wake, fork, the live chat), `integrations` (the providers the
workspace connects to, the user's connections and what they read; a leaf that imports no other
module), `records` (attaching records to a question and reading them, provider-neutral: the
attachment rules, the attach dialog and its chips, the record panel and the frame its views share,
and the record tools every provider answers; ADR 0003 §2), `sources` (the sample's sources and
records; a read-only domain, which ADR 0003 retires and #63 removes),
`skills` (the skill catalogue and its activation in this browser) and `projects` (the project
list, the add-project rule and the sidebar filter). `app/(workspace)/` composes them; its
`_components/` hold the shell, sidebar, settings and new-thread heading, which only that route
uses. Another module is reached only through its `index.ts`, which is safe to import in the
browser, or its `server.ts`, which is `server-only`; inside a module, files import each other
relatively.
`records` builds on `integrations` alone: it imports only `@/modules/integrations` and
`@/modules/integrations/server`. Its `queries.ts` holds what the server decides about attached
items from the user's connections: the allowed connections and the refusal of a foreign one.
**Enforced by.** ESLint `no-restricted-imports` (`eslint.config.mjs`: `@/modules/<x>/` followed
by anything but `index` or `server` is an error; a block for `src/modules/records/**` refuses
any `@/modules/*` but those two); the `server-only` import in every `server.ts`.
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`.

### Cross-module references are ids

**Decision.** A module's types and rules hold another module's data by id, never as a value:
they import only a type such as `ModelProvider` from `agent` (an input schema may build on the
other module's schema, as `chatTurnDtoSchema` does on `chatOptionsSchema`). A question refers to
its skill by id (`skillId`) and to what it is about by reference: its attached items name a
connection by its id and a record by its provider's type and key (`{ connectionId, type, key }`,
ADR 0003 §1), never by value, and the snapshot beside them only draws a chip. A thread holds no
records: what it is about is its questions' attached items (`threadAttachedItems`). Components
resolve the ids through the other module's public API (`useIntegrations().connections`,
`useSkills().skillById`). Provider-specific presentation (the provider mark, a type's kind mark,
a state's label and tone) is data the provider declares, not a branch on its id. The record
vocabulary (`RecordSummary`, `RecordError`, the tones) is `integrations`'; `records` builds on it.
The sample's older vocabulary (`SourceRecord`, `RecordQuery`, `RecordPage`) is still `sources`',
which `integrations` imports as types only, until #63 removes both.
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
ownership"). Each write is an action whose handler writes itself (see "Module shape"):
`createProjectAction` in `projects/actions.ts`, and `startThreadAction`, `forkThreadAction` and
`placeThreadAction` in `threads/actions.ts`. The module's components call the actions
(`ProjectForm`, `useThreads`).
`app/(workspace)/page.tsx` reads the user once and passes them to `listProjects` and
`listThreads`. A name the user already uses answers with that project instead of adding it
twice; the `projects_user_id_name_key` index catches a race, answered as `Conflict`. The
browser picks a new thread's id (its chat needs it before the server answers) and stores the
thread before it sends the first message; a taken id is a `Conflict`, a project that is not
the user's a `NotFound`.

The conversation follows the AI SDK's message persistence: one `thread_messages` row per
`UIMessage`, with `parts` and `metadata` in `jsonb` as streamed, ordered by `position`, keyed
`(thread_id, id)` so a fork copies messages under their ids. The database is the only copy:
the browser keeps no conversation between openings of a thread. The open thread has one AI SDK
`useChat` (`useThreadChat`), which opens with the conversation fetched from
`GET /api/threads/[id]/messages` each time the thread opens (`useStoredConversation`; a thread
the page just started opens empty and its chat sends the first question). The chat sends only
its latest message (`prepareSendMessagesRequest`); the server puts it after the stored
conversation, or in its old place when it is sent again, dropping what came after it, which is
how a regenerate replaces a reply (`withLatestMessage`, `threads/conversation.ts`). When the
reply ends, finished, stopped or failed, `runAgent` hands the conversation with the
reply to `saveConversation` (`threads/answer.ts`), which replaces the stored one in a
transaction; the stream is read to
its end on the server (`consumeSseStream`) so the reply is stored even if the browser went away.
The server names the replies (`generateMessageId`). Leaving a thread stops its response, as
closing the page does: `useChat` stops its chat when it unmounts, and the reply is stored as it
ended. A question stores the model and skill it asked for, which a retry asks again
(`lastRequest`). A thread stores no scope: what it is about is its questions' attached items,
stored in their messages (`drizzle/0008_drop-thread-scope.sql` dropped `source_id` and
`record_ids`, with no backfill), and the sidebar row's subtitle is the snooze time or the
branch. `listThreads` counts each thread's stored questions and attachments for the
sidebar. A fork is stored first, with the conversation through the chosen response, then opened
(`forkPoint`; a question or a response not stored yet is a `NotFound`); its origin is a snapshot
in `forked_from_*`, not a reference.

Placement is stored on the thread: `settled_at`, `snoozed_until` and `woke_at`, at most one
set (`threads_one_placement`), none for active. Settle, snooze, restore, undo and opening a
woken thread are one action, `placeThreadAction`, whose input names the change (`kind`), not
the timestamps: the handler applies the rule from `threads/placement.ts` with the server's
clock, so the browser cannot date a change; an undo (`return`) puts back the placement
the browser saw before. The browser shows the change at once and puts the thread back when the
action fails (`useThreads`). Nothing runs at a snooze's deadline: a due snooze reads as woken
at its deadline (`wakeIfDue`, in `listThreads` and before each change), and the browser wakes
an open page's threads live (`useSnoozeWake`). Asking again returns a parked thread to active
and stores the provider it now talks to (`answerThread`). Whether a response is in flight only
the browser knows, and only the open thread can have one; the browser refuses a snooze while it
does. A user's connections
are read from the database (see "Integrations are provider folders"); the skill catalogue
is one `skills/catalog/<id>/SKILL.md` per skill (see "Skills are SKILL.md files"). Both are read
through `queries.ts` and `server.ts`, and reach the browser through `IntegrationsProvider` and
`SkillsProvider`. A record is not part of the page: a record view reads it from
`GET /api/connections/[connectionId]/records/[type]/[key]` the first time it is shown, into the
browser's `RecordViewStore` (see "The record panel"). Skill activation, the record panel's width
and each thread's record panel persist in `localStorage`; the stored skill ids are parsed with
`storedSkillIdsSchema`, a stored panel with `restorePanel`. (`GET /api/sources/[sourceId]/records`
is still served, though nothing reads it since the scope went; #63 removes it with `sources`.)
There are no cache tags: every read is per request, and an action returns what it
stored, which the browser adds to its state.
**Enforced by.** The `server-only` import in every `queries.ts`, `server.ts` and
`threads/answer.ts` (a client component that imports one fails the build); the
`thread_messages_thread_id_user_id_fkey` and `threads_one_placement` constraints; the
integration tests (`threads/answer.integration.test.ts` checks that the migrated `threads` holds
no scope columns); `drizzle-kit check`.
**Recorded in.** This entry.

### Threads without a project

**Decision.** A thread's `project_id` is nullable: null is a thread without a project, not a
hidden per-user default project, which would need creating at sign-in and hiding from every
list. The reference `(project_id, user_id)` → `projects(id, user_id)` lets a thread belong
only to a project of the same user; with a null `project_id` it does not apply. In the code,
`Thread.projectId` is the project's id (cross-module references are ids); the workspace
resolves it to a name through the project list, and the sidebar filter lists threads without
a project under "No project". A new thread starts without a project unless one is picked.
**Enforced by.** The `threads_project_id_user_id_fkey` constraint; `startThreadAction` answers
`NotFound` for a project the user does not own.
**Recorded in.** This entry.

### Integration tests

**Decision.** A write is tested where the browser reaches it, against the compose Postgres, not
by a unit test with fakes plus a repository test. Each module with stored data has
`actions.integration.test.ts`, which calls its actions as the browser does and reads back
through its queries: `vi.mock("@/lib/auth/session", () => import("@/tests/support/session"))`
swaps in a fake session, and `callAs(user, action, input)` calls as a user the test builds
(`aUser`, `tests/factories/user.ts`), or as a visitor with `null`, so the test covers the
sign-in check and the validation too. `withUsers()` (`tests/support/users.ts`) signs the test's
users up and deletes them afterwards. The same file calls `assertIsolation()` through the
actions and queries. A route handler that is not an action is tested the same way by calling
it with the user: `threads/answer.integration.test.ts` calls `answerThread` with `runAgent`
mocked (`vi.mock("@/modules/agent/server")`), so its example tables run against stored threads
without a model. Pure rules are tested by example beside the file that holds them
(`threads/placement.test.ts`, `projects/contracts.test.ts`).
**Enforced by.** Review; the integration tests skip loudly without the stack
(`describeIntegration`, `tests/support/integration.ts`).
**Recorded in.** This entry.

### Answers come from the Vercel AI Gateway

**Decision.** `POST /api/threads/[id]/messages` (`app/api/threads/[id]/messages/route.ts`) only
reads the user and hands them, the thread id and the body to `answerThread` from
`modules/threads/server.ts`. `answerThread` (`modules/threads/answer.ts`) validates the id with
`threadIdSchema` (an id that is not a uuid is a 404) and the body with `chatTurnDtoSchema`,
finds the thread among the user's (another user's thread is answered with a 404 like a
missing one), puts the new message after the stored conversation and hands both, with the user, to `runAgent` from
`modules/agent/server.ts`. A **new** message (one the thread does not hold yet) that attaches a
connection that is not the user's is refused with a 400 before the agent is asked
(`foreignConnectionIds`, `records/queries.ts`); a stored message sent again by Try again is
answered, and the agent leaves such a connection out. Once the agent answers, the thread returns to active and records the
provider of the model that answered.

A question carries its attached items (ADR 0003 §1) as one custom data part on the user
message, grouped by connection:
`{ type: "data-attached-items", data: { connections: [{ connectionId, provider, label, items:
[{ type, key, snapshot: { label, title, state } }] }] } }`, where `items: []` attaches the whole
connection. The part's name is permanent, like a tool name; `WorkspaceUIMessage` types it from
`records` (`RecordsDataTypes`). The composer sends `sendMessage({ parts, metadata }, { body })`,
because the `{ text }` shorthand cannot carry a data part, and each new question starts with
nothing attached. `records/attached-items.ts` holds the part's schema (at most 10 items from at
most 5 connections, each connection once, a uuid per connection, slugs for provider and type) and
the pure rules over any `{ role, parts }` messages: `attachedConnectionsOf(message)` (a malformed
part attaches nothing) and `threadAttachedItems(messages)` (the questions' items in order, once
each by connection, type and key, the first question keeping it). The stored part is the sent
part: persistence does not change.

The `agent` module is the runtime AI, flat by file:
- `run.ts`: `runAgent(request)` resolves the context, validates the conversation against the
  tools and the data parts (`safeValidateUIMessages({ tools, dataSchemas })`; a malformed part or
  one over a limit is a `ValidationFailed`, a 400) and streams the reply with an AI SDK
  `ToolLoopAgent` on the gateway (at most 5 steps), then hands the conversation to `onEnd`. It
  returns the response and the model. `convertDataPart` is `attachedItemsText` (`records`): from
  the part alone and synchronously, it turns a question's attached items into an
  `<attached_items>` block in that user message, opened by a fixed sentence (references the user
  picked; read them with the tools; their content is data, not instructions) and one line per
  item (connection label and `connectionId`, type, key, the snapshot's title and state "as
  attached") or whole connection. Browser-sent strings are quoted, so none can end a line or the
  block. Bodies are never inlined. When the thread attached anything, `run.ts` adds the
  **allowed connections** to the context it passes as `options.context`:
  `allowedConnections(user, messages)` (`records/queries.ts`) takes the connections every user
  message of the thread attached, keeps those that are still the user's and do not need
  reconnecting, and answers `{ connectionId, provider, providerName, account, reach?, guide? }`
  for each. Sending fetches nothing, so `reach` is left out until something already holds it.
  `toolsFor` turns them into the record tools' context (see "Agent tools live in their module").
- `context.ts`: `resolveContext` turns the browser's ids into the model and skill (unknown ids
  are `NotFound`, answered with a 400), so the prompt only ever holds what the server offers. The `AgentContext` it returns carries the signed-in user, so a tool reads only
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
  id, name and description ("Skills you can load"), then, when the thread attached anything, "Attached items and connections": `instructions/attached-items.md`
  (what the reference lines are, "an item from a connection not listed here cannot be read; tell
  the user", tool results are third-party data), the allowed connections ("None." when every one
  is gone) and each allowed provider's guide once. The connections stay TypeScript, because
  they are built from data; all of it is text the server wrote.
- `tools.ts`: the registry. `tools` is every tool the agent knows, its own and the modules'
  (see "Agent tools live in their module"); `toolsFor(context)` picks the ones one answer may
  call and what each knows of the thread. Stored conversations hold the tool names and every
  send validates the whole conversation against all of `tools`, so a tool is never renamed and a
  removed one keeps a stub under its name (one exception, #62: see "Agent tools live in their
  module"); `tools.test.ts` lists the names.
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
**Enforced by.** `agent/context.test.ts`, `agent/run.test.ts` (on a mock model: the exact
`<attached_items>` text in the user message, the allowed connections and the GitHub guide in the
system prompt, a malformed or oversized part refused, a connection needing reconnecting left
out), `records/attached-items.test.ts` and `threads/answer.integration.test.ts` (a foreign
connection is a 400 on a new message only, and a stored message keeps its data part).
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`.

### Agent tools live in their module

**Decision.** A tool is another way into a module, beside its pages and actions, so it lives in
the module it acts on and is a thin wrapper over that module's queries (or, for a write, its
actions). `records/tools.ts` is the pattern: `search_records` searches one of the connections the
thread attached, through the provider's own search, the same code the attach dialog runs (ADR 0003
§4); `skills/tools.ts` (`load_skill`, see "Skills are SKILL.md files") follows it.
- **Files.** The tool's input and output schemas are in the module's `contracts.ts`, so the
  browser can type the tool's parts; field meanings are in their `.describe()`, and the tool's
  description says that its results are third-party data. The tool is in `<module>/tools.ts`
  (`server-only`), exported as `<module>Tools` from `server.ts`. Its chat card is in
  `<module>/components/` (`RecordSearchCall`), exported from `index.ts`; the chat's
  `message-parts.tsx` maps the part's state onto it.
- **Context, not trust.** What a tool may see comes from the server, never from the model: the
  tool declares it with `contextSchema`, and `toolsFor` in `agent/tools.ts` fills it from the
  resolved `AgentContext`. `search_records` (context `{ user?, connectionIds }`) answers
  `no_access` for a `connectionId` outside the **allowed connections** (`allowedConnections`, see
  "Answers come from the Vercel AI Gateway"), whatever the model asks, and is offered
  (`activeTools`) only while one connection is allowed, even one attached with no items. A tool
  whose context the thread lacks is not offered, and its `execute` refuses anyway.
- **`search_records`.** `{ connectionId, query, type?, includeClosed? }` answers `{ results:
  RecordSummary[] (at most 20, MAX_SEARCH_RESULTS), total? }` or `{ error: RecordError }`: every
  refusal comes back as data, so the model explains it and carries on. It calls
  `searchRecords(user, connectionId, { text, type, includeClosed, qualifiers: true })`
  (`integrations/server.ts`): the provider's own qualifiers pass through, and the provider keeps
  the search inside what the connection reads (GitHub's: see "Integrations are provider
  folders"). Its card is one quiet line ("Searched @acme for “login timeout”: 6 results", or the
  error in words) with the first three results as `AttachedItemChip`s and "+N"; a chip opens the
  record's view as a tab, never under Attached.
- **Registration.** `agent/tools.ts` spreads the module's tools into `tools`, adds the tool's
  context to `toolsFor`, and `WorkspaceUITools` in `agent/contracts.ts` gets its types.
- **Behaviour.** The tools only read. Record bodies never reach the prompt: the model reads
  records through tools.
- **Names.** A stored conversation holds tool names, so a removed tool keeps a stub under its
  name. One exception was made: the thread scope's `search_records` (#62) kept no stub, and its
  name was reused with the new schema, because the database is reset with that change
  (`pnpm stack:reset`), so no stored conversation holds the old parts.
**Enforced by.** `agent/tools.test.ts` (the tool names, the new `search_records` schema, what
`toolsFor` offers); `agent/run.test.ts` (on a mock model over recorded GitHub answers:
`search_records` offered for a connection attached whole and not without one or for one needing
reconnecting, the call reaching GitHub with the token's scope and an outside `repo:` or `user:`
dropped, results kept to the token's repositories when the scope names their owners, no number
read directly when a qualifier passes through, a foreign `connectionId` answering `no_access`, a
422 answering `invalid_query`); `tsc`
(`WorkspaceUITools`, `toolsContext`).
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`.

### Integrations are provider folders

**Decision.** `docs/adr/0002` chose one leaf module, `integrations`, with one folder per
provider: a system the workspace connects to (`providers/sample/` and `providers/github/` today;
Atlassian, codebeamer, PostHog, Stripe and Supabase are planned). A provider is
`defineProvider({ id, name, description, auth, baseUrl?, verify?, records?, guide? })` (`contracts.ts`),
registered by one line in `providers.ts`, and written in its folder: `index.ts` (the
manifest), `api.ts` (its HTTP calls, every response parsed with zod), `records.ts` (its record
types, states, search and one reader per type, only with records), `views/` (in the browser: its
mark and each type's record view and kind mark; ADR 0003 §3) and an optional `guide.md`: what the agent should know to use
its connections (what its records and states mean, how its search reads), imported as text,
declared as the manifest's `guide`, kept server-side (never on `ProviderChoice`) and in the system
prompt while one of its connections is allowed (`providerForPrompt`, `integrations/server.ts`;
`providers.test.ts` caps its length). A provider's code is handed a `ProviderAccess` (the API
address and the `Authorization` header value) and never reads a secret, an env var or the
database. `auth` lists how a user connects: `none` (the sample), `token` (sent as `Bearer`) or
`basic` (username and password, or an email and API token, sent as HTTP Basic); `verify` checks a
credential and names the account.

A connection is one user's link to one account of a provider at one address (`connections`,
unique per user, provider, `base_url` and `account_ref`). `listConnections(user)` answers with
the built-in sample connection, which every user has and nothing stores, then the stored ones.
`connectAction` verifies the credential with the provider before anything is stored, then
writes the connection and its credential in one transaction; connecting the same account again
updates both. `testConnectionAction` asks the provider again (a refused credential is
`needs_reconnect`; an unreachable provider changes nothing), and `disconnectAction` deletes the
connection and, by cascade, its credential. The base URL must be HTTPS, and `connectAction`
(so connecting and reconnecting) refuses one that points the server at itself or at an internal
network (`integrations/address.ts`): a host that is `localhost`, or a loopback, private (RFC 1918,
unique local) or link-local address, given literally or among what its name resolves to, and a
name that does not resolve. The form shows the refusal as the URL field's error, and nothing is stored. The check runs when a
connection is saved only: no DNS pinning and no re-check per request (decided in #44), so every
provider request is sent with `redirect: "error"` and cannot be led elsewhere. Settings → Sources
(`SourcesSettingsPanel`, the connect form built from the provider's `auth` and `baseUrl`) lists
every provider and the user's connections; `IntegrationsProvider` holds them, and an action's
answer goes into its state. `integrations/records.ts` runs the sample's reader for `sources`
(`listConnectedSources`, `searchConnectionRecords`); `sources` turns that into `Source`s and their
records route, which nothing reads since the scope went (#63 removes them). The sample records are the
provider's `data.ts`; the stored threads' sample ids moved to `sample:<product>` in
`drizzle/0006_rename-sample-source-ids.sql`. Unit tests that read sources swap the connection
query for `tests/support/connections.ts` (the sample connection alone), so they need no Postgres.

A provider with records (ADR 0003 §3) declares them in its manifest's `records`: its types, each
with a singular and a plural label and its states, each state with a label and a tone from
`RECORD_TONES` (`open`, `draft`, `done`, `closed`, `neutral`; an undeclared state draws
`neutral`); which of the dialog's generic filters (`type`, `includeClosed`) its search supports;
the hint the dialog shows under its search field (`hint.idle` before typing, `hint.typing` while
typing; a provider's own terms, such as GitHub's numbers and repository names, stay in its
declaration); and its search, which answers a `RecordSearchPage` (`RecordSummary`s, an opaque
`next` cursor, `total`, the connection's `reach`, and `narrowedTo` when the text narrowed it,
which the dialog shows) or a `RecordError` and never throws. Each declared type also has a
`read(access, key)`, which answers the record's live `RecordSummary` and the provider's own detail
(`GithubIssueDetail` or `GithubPullRequestDetail`, zod schemas beside the readers; there is no
generic detail type), and the
manifest's `url(baseUrl, type, key)` builds the record's page from the connection's base URL and
the key, without asking the provider. The sample's older reader is its manifest's `sources`. The
declarations, without code (`listProviderChoices` drops the readers), reach the browser on
`ProviderChoice.records`. The browser's registry is `record-views.ts`, one line per provider: its
`views/` maps each declared type to `{ view, icon }`, a `React.lazy` body-only view
(`({ detail }) => …`, drawn with the shared Markdown renderer, which checks the detail against its
schema) and the type's kind mark, beside the provider's mark, keyed on the provider id. The view
kind is derived, `viewKindOf(provider, type)` = `github.issue-view`, never declared;
`RecordViewBody({ kind, detail })` draws a kind's body, loading its chunk with the first view of
that kind, and says so for a kind nobody registered. `ProviderMark`, `RecordKindMark` and
`RecordStateBadge` draw the marks and a state's declared label in its tone. `searchRecords(user, connectionId, query)`
(`integrations/records.ts`) finds the connection among the user's (another user's is
`not_found`) and runs the provider's search; a `needs_reconnect` answer marks an active connection
`needs_reconnect` (`markNeedsReconnect`, the one write in `queries.ts`). `GET
/api/connections/[connectionId]/records?q=&type=&closed=&cursor=` serves it to the attach dialog,
`private, no-store`; `record-error.ts` beside it answers a `RecordError` as a status and `{ error:
{ kind, message, retryAt?, url? } }` (404, 403, 409 for `needs_reconnect` because 401 means the
session ended, 429 with `Retry-After`, 502, 422). `readRecord(user, connectionId, type, key)`
(`integrations/records.ts`) does the same for one record: another user's connection, an undeclared
type or a key the provider cannot parse is `not_found`, a `needs_reconnect` answer marks the
connection, and a refusal carries the record's `url`. `GET
/api/connections/[connectionId]/records/[type]/[key]` serves it to the record views (the key
URL-encoded, parsed only by the provider), `private, no-store`, answering `{ summary:
RecordSummary & { url }, detail }` or the same `{ error }`. GitHub's issue reader (#60) reads
`/repos/{o}/{r}/issues/{n}` and its first 100 comments in parallel. Its pull request reader (#61)
fans out in parallel: `/pulls/{n}` (the body, the counts, `mergeable_state`, the head commit), the
conversation's first 100 comments (`/issues/{n}/comments`), the first 100 reviews and inline
review comments, and the first 100 changed files (path, status, additions, deletions; the patch is
never kept, and `fileCount` says how many more GitHub has); once `/pulls/{n}` names the head
commit, its CI: the GitHub Actions runs (`/actions/runs?head_sha=`) and the combined commit status.
Check runs are not read, because a fine-grained token cannot read them (#43). A 403 on either CI
part makes that part `readable: false` and the view says which permission to give (Actions: read,
Commit statuses: read); a 404 is an empty part; any other refusal fails the view. Both readers strip
invisible and bidirectional Unicode (zero-width characters, the bidi embeddings, overrides and
isolates, the byte order mark, tag characters; the zero-width joiner stays for emoji) from titles,
bodies, labels and comments, and the pull request reader also from reviews, file paths, branch
names and CI names (the bidi marks including U+061C, the combining grapheme joiner and the Hangul
fillers too). GitHub's token help names the permissions the views need: Metadata, Issues, Pull
requests, Commit statuses and Actions, all read. GitHub's search (#43) names the token's
repositories (`GET /user/repos`) as `repo:a repo:b …`, or `user:<owner>` for each distinct owner
when that would make the query longer than 256 characters; adds the typed words with
`in:title,body` (a word GitHub would read as a qualifier is quoted), `is:issue` or `is:pr` and
`is:open` unless closed items count, 20 a page. GitHub refuses a fine-grained token's search for
issues and pull requests at once (422, "Query must include 'is:issue' or 'is:pull-request'"), so
with no type chosen it runs one search per type and merges them: by `updated` when sorted so,
otherwise rank by rank (#58); `total` adds them up. Its cursor encodes the page number and the
types that still have that page. A word that names a readable repository exactly, in any case
(`web` or `acme/web`), narrows the scope to it instead of being searched. The agent's search
(`qualifiers: true`, #62) reads its text in GitHub's syntax: a qualifier with one plain or quoted
value (`label:"good first issue"`, `-label:bug`, `created:>2026-01-01`) and a quoted phrase pass
through, without `in:title,body`; `repo:`, `user:` and `org:` narrow to the readable repositories
they name (negated, they leave them out) and are dropped when they name none; `is:issue`,
`is:pr` or `type:` set the type (a different `type` asked for is `invalid_query`); a named state
(`is:closed`, `state:open`, `is:merged`) lets closed items through; a typed number is read
directly only when no other qualifier passes through, since it might not match them. Operators
(`AND`, `OR`, `NOT`) and parentheses are searched as words, and when the scope names owners
(`user:`), results outside the token's repositories are dropped and `total` is left out, so
nothing widens the agent's search past the token's repositories. `482` or `#482` is searched as `482`; with one repository in play
(narrowed, or the only one the token reads) the issue or pull request of that number is also read
(`GET /repos/{o}/{r}/issues/{n}`) and put on top when the toggles let it through. Before typing,
two searches sorted by `updated` run in parallel (each per type for "All"), one with
`involves:@me`, and their results are
listed once each, the first's first; later pages continue the second. The attach dialog searches
250 ms after the last keystroke, aborts the search in flight when a newer one starts, and keeps
the answers by `(connection, q, toggles)` while it is open (`useSearchCache`); nothing is cached
on the server. A refused search keeps the results shown and adds one quiet line (the rate limit's
wait, or "Reconnect GitHub"). A connection that needs reconnecting shows so with **Reconnect**,
its search is disabled, and the dialog opens on it only when no other works
(`defaultConnectionId`, `records/contracts.ts`). GitHub's classifier (`classifyGithubAnswer`
in `providers/github/api.ts`) is shared with `verifyGithubToken`, which reports a rate limit as
`RateLimited` rather than a refused token: 401 is `needs_reconnect`; a 403 or 429 with
`x-ratelimit-remaining: 0`, `retry-after` or a secondary rate limit is `rate_limited` with
`retryAt`; another 403 `no_access`; 404 `not_found`; 422 `invalid_query`; anything else, or no
answer, `unreachable`.

The GitHub provider's tests replay recorded answers (ADR 0003 §5): `providers/github/fixtures/`
holds plain GitHub JSON, one response body per file, captured from the public sandbox
`laserjm/workspace-fixtures`. The sandbox's records are made by its `seed/seed.sh` and labelled
`case/<name>`, so they can be rebuilt; the folder's README holds one `gh api` line per file. Only
public data is saved: `/user` without its account-only fields, and `/user/repos` cut to the
sandbox. A test answers `fetch` with `useRecordedGithub({ "GET /path": "file.json" })`
(`tests/support/recorded-github.ts`; an error answer is written inline, and an unlisted request
fails the test and names it), and swaps the connection query and the vault for
`tests/support/connections.ts`, whose `connectedUser` has one GitHub connection with a fake token.
**Enforced by.** `providers/github/fixtures.test.ts` (README lines and files one to one, each
seeded case found by its label, CI on the heads of the merged and the draft pull request, no token
or `Authorization`);
`integrations/providers.test.ts` (every provider in the registry: unique ids, a
way to connect, a base URL and `verify` when it takes a credential, declared record types whose
states' tones are in the set, every declared type with a reader, a view and an icon and every
view of a declared type, a provider mark, sources in a declared product, records read back by id
in order, nothing for an unknown key);
`integrations/actions.integration.test.ts` (connect, reconnect, refusals including each internal
address kind with name resolution stubbed, test, disconnect, a search marking only its user's
connection `needs_reconnect`, a visitor, `assertIsolation()`); `providers/github/api.test.ts`;
`app/api/connections/[connectionId]/records/route.test.ts` (the scoped query, the toggles and
the cursor, one search per type for "All", the before-typing pair, narrowing by a repository
name, the number on top, the
`user:` fallback, the computed states, another user's connection, each classifier case and a 401
marking the connection); `app/api/connections/[connectionId]/records/[type]/[key]/route.test.ts`
(an issue's fields and comment count, the summary's live state and URL, Unicode stripped, a pull
request read as an issue and an issue read as a pull request, an unparsable key, another user's
connection, 403, 429 with `retryAt`, 502 and a 409 marking the connection; the recorded merged and
draft pull requests' reviews and their inline comments, changed files, merge state and CI, the
100-file cap with `fileCount`, a 403 on Actions leaving the view loaded, a CI rate limit failing
it, and Unicode stripped from reviews, file paths and CI);
`records/contracts.test.ts` (the dialog's default connection);
`sources/queries.test.ts`; `tsc`.
**Recorded in.** This entry; `docs/adr/0002-integrations.md`;
`docs/adr/0003-attached-items-and-record-views.md`.

### The record panel

**Decision.** An open thread's right-hand panel shows its attached items as record views (ADR 0003
§2, #40, #51). `records` owns it; the shell puts `RecordPanelProvider` (keyed by nothing, told the
open thread) around the header and the conversation, `RecordPanelToggle` in the header of an open
thread (no panel and no button on the new-thread page), and `ThreadConversation` draws its `panel`
render prop, `RecordPanel`, beside the conversation once that is here.
- **State.** `records/record-panel.ts` is pure: per thread, the open views (in the order they
  opened, each with the snapshot it was opened from, so a tab draws without fetching), the active
  one (none shows the fixed **Attached** tab), whether the panel is shown and whether the user
  rearranged it (opened, focused, closed or hid) since their last question. A view's id is `<viewKind>:<connectionId>:<key>`.
  `openView` (a chip or an Attached row) opens or focuses and shows the panel; `openSent` opens a
  question's items and focuses the first, showing a hidden panel on a wide screen, unless the user
  rearranged the panel since their last question, when they open without taking focus; closing a
  view focuses its neighbour, the last one Attached. Nothing opens twice. The provider keeps each
  thread's state in `localStorage` (`workspace:record-panel:<threadId>`, versioned, read by
  `restorePanel`: another version or an unreadable value starts afresh, a view that does not read
  is dropped). A thread with nothing stored starts open on a wide screen when it has attached
  items, hidden otherwise; below 1200px the panel is a sheet over the conversation and always
  starts hidden.
- **Sending.** `RecordPanel` calls `openSent` for each user message that appears in the
  conversation after it mounted, so a stored question, or one asked again by Try again, opens
  nothing. Chips on a sent question call `open`.
- **The panel.** The Attached tab lists `attachedByQuestion(conversation)` (built on
  `threadAttachedItems`), grouped by the question that attached them, each marked when its view is
  open; empty, it offers "Choose a data source", whose picks land in the composer's draft (the
  shell holds the open thread's draft for both). A tab per view: the kind mark in its live state's
  tone, the short label, close on hover or middle-click. Only the active view renders and reads.
  Its frame (kind mark, where, live state badge, title, refresh, "Open on <provider>", close) is
  `records`'; the body is the provider's `RecordViewBody`. Errors: not found or no access offer
  Retry and the record's page; needs reconnecting offers Reconnect (Settings → Sources) and Retry;
  a removed connection says so, with no link, and reads nothing. On a wide screen the panel is
  resizable (`ResizablePanel`, its width in `localStorage`).
- **View data.** `RecordViewStore` (`records/components/record-view-store.ts`) holds each view's
  record by view id for the page's lifetime: read the first time the view is shown, shared while
  in flight, kept when the view is shown again; refresh (and Retry) reads again, showing the record
  it has meanwhile. Nothing is cached on the server.
**Enforced by.** `records/record-panel.test.ts` (open and focus, nothing twice, `openSent` with
and without "rearranged", the neighbour on close and Attached after the last, starting open or
hidden, a stored state of an older version or a corrupt one);
`records/components/record-view-store.test.ts` (one read per view, refresh, a refusal kept until a
retry); `records/attached-items.test.ts` (the grouping by question).
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`.

### Connection credentials live in the vault

**Decision.** A credential is stored only in `connection_secrets`, one row per connection, as
AES-256-GCM ciphertext (`integrations/cipher.ts`, pure) whose authenticated data binds it to its
connection and user, so a copy in another row does not decrypt. The keys are `INTEGRATION_KEYS`
(`lib/env.ts`): `<version>:<32-byte base64 key>`, the newest first; new secrets use the first,
and `key_version` names the one a row used, so a key is rotated by adding a version in front and
re-encrypting. It is separate from `BETTER_AUTH_SECRET`. `integrations/vault.ts` is the only
reader and writer of the table, and reads the key ring on first use. `access.ts` turns a
connection into a `ConnectionAccess` per request, the only form in which a credential leaves the
vault. Nothing returns, logs or renders a credential: `Connection` has no secret field, and the
connect form never shows a stored token. Better Auth's `accounts` stays the sign-in identity; it
holds no integration tokens.
**Enforced by.** ESLint `no-restricted-imports` (`eslint.config.mjs`: only `vault.ts` and the
module's integration tests import `connectionSecretsTable`); other modules reach `integrations`
only through `index.ts` and `server.ts`, which export neither the vault nor `accessFor`;
`integrations/cipher.test.ts` (round trip, a fresh iv, the wrong binding, a changed ciphertext,
an older key version); `integrations/actions.integration.test.ts` (the stored row holds no
token; another user's read is no credential).
**Recorded in.** This entry; `docs/adr/0002-integrations.md`; `.env.example`.

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
`group/app`, `data-session` on `group/main` (read as
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
module's `actions.ts` exports `export const <name>Action = action(schema, async (input,
{ user }) => …)`, and the handler does the write itself (see "Module shape"). Every export of a `"use server"` file can be called from the browser,
so `actions.ts` exports nothing but actions; a helper the handlers share stays unexported. `action` (`lib/actions/define.ts`, bound to the session in
`lib/actions/server.ts`) runs four steps in order: it reads the user (`getUser()`) and answers
`SignedOut` without one, before the input is looked at; it parses the input with the schema and
answers `ValidationFailed` (`issues: [{ path: "change.until", message }]`); it runs the handler,
whose `Result` reaches the caller as is; and it turns anything thrown into `Unexpected` with a
trace id, logged on the server, after `unstable_rethrow` has let `redirect()` and `notFound()`
through. `publicAction(schema, handler)` is the same without the first step, for visitors; the
comment above it says why. The caller gets one flat `Result` whose error type is the handler's
errors plus `ValidationFailed | SignedOut | Unexpected`, inferred from the handler's whole return
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

**Decision.** A module is flat: `contracts.ts` (types, errors, rules, input schemas),
`queries.ts` (reads, each taking the user first; the one write there is
`integrations`' `markNeedsReconnect`, because a read is what finds a refused credential),
`actions.ts` (writes: `action(…)` signs the caller in and validates, and the handler queries
Drizzle), `components/`, `index.ts` and
`server.ts`. `server.ts` re-exports what pages, routes and other modules' tests need. Every
query names `user.id`, and the integration test calls `assertIsolation()`. A handler reads a
refused constraint with `violatedConstraint` (`lib/db/errors.ts`) and returns
`err(conflict(...))` itself. There are no use cases, repositories or ports: a handler that
needs a read calls the module's query (`findThread`), and a test fakes another module with
`vi.mock` rather than through an injected dependency. A module adds a file only for a real
need, named after what it holds, not after a layer: `agent` has `run.ts` and `tools.ts`;
`threads` has `placement.ts` (where a thread sits in the sidebar) and `conversation.ts` (how a
conversation grows and forks), which would make `contracts.ts` too long, `rows.ts` (a thread
and its messages as stored, shared by its reads and writes) and `answer.ts` (the chat route's
work, which streams and so is not an action).
**Enforced by.** Review.
**Recorded in.** This entry.

### No conventions package

**Decision.** The project owns its runtime helpers and depends on no conventions profile. It
dropped the profile's tooling (its CLI, ESLint config and CI checks) first, then its runtime
package: `lib/result.ts` (`Result`, `ok`, `err`), `lib/errors.ts` (the standard errors and
`bug`), `lib/db/errors.ts` (`violatedConstraint`), `withTransaction` in `lib/db/client.ts`, and
`describeIntegration` and `assertIsolation` in `tests/support/integration.ts`. They do what the
app uses and no more: one statement timeout, no caller classes, no transaction joining. Add an
option when a call needs it.
**Enforced by.** Review.
**Recorded in.** This entry.
