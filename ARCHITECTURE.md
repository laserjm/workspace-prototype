# Architecture

Three documents share the project's decisions, and each fact is in one of them:

- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) owns the structure: the layout, a module's files
  and doors, the import rules, how errors travel and how use cases are tested. This file does not
  restate it.
- [`docs/adr/`](docs/adr/) records every departure from the conventions, with the options and how
  to reverse it (0004 onwards; 0001 to 0003 predate the conventions and record product
  decisions).
- This file keeps the product's decisions the conventions leave open: the local stack, the schema,
  who owns what, sign-in, what is stored, the AI Gateway, the agent's tools, the providers, the
  record panel, the vault, skills and styling.

Each entry says what was decided, what enforces it and where else it is recorded. **Change an
entry together with the decision that changes it.**

## Decisions

### Local stack: Docker Compose with Postgres and Keycloak

**Decision.** `compose.yaml` runs the stack the app develops against: Postgres 17 and Keycloak
26 in dev mode (`start-dev`). One Postgres server holds the app's databases and Keycloak's, each
with its own role: `workspace`, the app's, which `lib/db/migrations/` migrates, and `keycloak`,
which only Keycloak writes (`docker/postgres/initdb/10-keycloak.sh` creates it on the first start
of an empty volume). Host ports are 5433 (Postgres) and 8080 (Keycloak), overridable in `.env`.
Keycloak's issuer is `http://localhost:8080/realms/<realm>` for the browser and the Next.js server
alike (`KC_HOSTNAME`). Realm exports in `docker/keycloak/realms/` are imported on start, so a
configured realm is reproducible from the repository. The app's realm is `workspace`: one
confidential client, `workspace-web` (authorization code with PKCE, no direct grants), no
self-registration, no roles, and development users with fixed ids, so a user's `sub` is the
same after every reset. Its only redirect URI is `http://localhost:3000/api/auth/callback/keycloak`,
and its post-logout URI is `http://localhost:3000/`. `pnpm stack:up|down|reset` drive it.
The tests run against `workspace_test` on the same Postgres: `test/global-setup.ts` creates it
when it is missing, migrates it and empties it before every run, and refuses a database whose name
does not end in `_test`; `vitest.config.mts` sets `DATABASE_URL` (`TEST_DATABASE_URL` overrides
it) and a fixed `INTEGRATION_KEYS`.
**Enforced by.** The compose health checks (`pnpm stack:up` waits for both); the name check in
`test/global-setup.ts`.
**Recorded in.** This entry; `.env.example`.

### Schema source: code-first with Drizzle

**Decision.** Code-first, as the conventions say (Rule 10): tables and enums are declared in
`lib/db/schema.ts`, `pnpm db:generate --name <verb>-<what>` writes the SQL migration to
`lib/db/migrations/` and `pnpm db:migrate` applies it. `lib/db/client.ts` runs on postgres.js,
with prepared statements on because the app connects to Postgres directly, not through a
transaction pooler. `withTransaction` sets an 8 s statement timeout for the transaction only
(`set_config(…, true)`), so it never reaches the next client of a pooled connection. The first
tables are the sign-in's four. `drizzle-kit generate` adds a new table's foreign keys before the
unique constraints added to existing tables in the same migration, so a reference to a constraint
that does not exist yet is generated as two migrations (`0002_add-thread-forks`, then
`0003_create-thread-messages`).
**Enforced by.** CI (`pnpm db:check`, and `pnpm db:generate` must leave `lib/db/migrations/`
unchanged).
**Recorded in.** This entry.

### Data ownership

**Decision.** Each signed-in user owns their threads, projects and skill
preferences; there are no shared workspaces. A user reads only what their own connections reach
(see "Integrations are provider folders"): every connection is a stored row, and nothing is
connected for them. The provider and skill catalogues are shared data, declared in code: a
provider is a folder (its manifest, `api.ts`, `records.ts`, an optional `guide.md` and
`tools.ts`), not a row. Shared workspaces, such as a team seeing each other's threads or
connections configured once per organisation, would add an organisation to every owned row,
recorded here when it comes.
The owner is the signed-in Keycloak user, so the code says user: `User.id` (a `UserId`) is their
`sub`, which is also `users.id` (see the sign-in). The four sign-in tables are Better Auth's,
not owned data the app reads. The owned tables are `projects`, `threads`, `thread_messages`,
`connections` and `connection_secrets`: each row has a `user_id` referencing `users.id`, like
`sessions` and `accounts` (deleting a user deletes what they own); a message's reference
`(thread_id, user_id)` → `threads(id, user_id)` lets it belong only to a thread of the same user.
Until there is more than "the owner can", ownership is the access rule of the conventions' Rule 2.
**Enforced by.** The `UserId` brand from `lib/auth/user.ts` (a zod brand) and `tsc`; each use
case's tests with someone else's id and a malformed id (Testing §5).
**Recorded in.** This entry; `lib/auth/user.ts`; `lib/db/migrations/0005_rename-owner-to-user.sql`.

### Modules

**Decision.** Six modules, shaped as the conventions say:

- `agent`: the runtime AI: the model allowlist, the instructions, the tool registry and the agent
  loop (see "Answers come from the Vercel AI Gateway").
- `threads`: conversations and where they sit (settle, snooze, wake, fork), and answering one.
- `integrations`: the providers the workspace connects to, the user's connections and what they
  read (see "Integrations are provider folders").
- `records`: attaching records to a question and what the server decides about them,
  provider-neutral: the attached-items part and its rules, the allowed connections and the record
  tools every provider answers (ADR 0003 §2).
- `skills`: the skill catalogue (see "Skills are SKILL.md files").
- `projects`: the user's projects.

Dependencies point one way: `threads` imports `agent`, `records` and `projects`; `agent` imports
`records`, `integrations` and `skills`; `records` imports `integrations`; `integrations`, `skills`
and `projects` import no module. The record vocabulary every provider answers in is
`integrations`' own. `records` has no `index.ts` and no `commands.ts`: only other modules call it,
and it writes nothing. `skills` has no `commands.ts` either: its catalogue is files (ADR 0009).
The files beyond the conventions' are ADRs: a `tools.ts` in `agent`, `integrations`, `records`
and `skills` (ADR 0005); `integrations`' provider SPI and folders (ADR 0006); the rules the
browser runs too in `contracts.ts` (ADR 0007).
All UI lives in `app/(workspace)/_components/`, because the workspace is one route group; flat
`components/` holds none yet, and `components/ui/` is shadcn only. The component roles NAMING.md
lacks are ADR 0008.
**Enforced by.** The conventions' ESLint config (`eslint.config.mjs`, the conventions' copy
unchanged); review for the direction between modules and for cycles.
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`;
`docs/adr/0005-agent-tools-are-a-door.md`; `docs/adr/0006-providers-answer-refusals-as-values.md`.

### Cross-module references are ids

**Decision.** A module's types and rules hold another module's data by id, never as a value:
they import only a type such as `ModelProvider` from `agent`. A route that takes two modules'
input parses each with its own schema (`POST /api/threads/[id]/messages` parses
`answerThreadInput` from `threads` and `chatOptionsInput` from `agent` out of one body). A
question refers to its skill by id (`skillId`) and to what it is about by reference: its attached
items name a connection by its id and a record by its provider's type and key
(`{ connectionId, type, key }`, ADR 0003 §1), never by value, and the snapshot beside them only
draws a chip. A thread holds no records: what it is about is its questions' attached items
(`threadAttachedItems`). Components resolve the ids through what the page loaded
(`useIntegrations().connections`, `useSkills().skillById`). Provider-specific presentation (the
provider mark, a type's kind mark, a state's label and tone) is data the provider declares, not a
branch on its id. The record vocabulary (`RecordSummary`, `RecordError`, the tones) is
`integrations`'; `records` builds on it. Because a `contracts.ts` takes only types from another
module, `records/contracts.ts` keeps its own copy of `recordSummarySchema` and `recordErrorSchema`
for its tool schemas, and `threads/contracts.ts` repeats the agent's model providers (with
`satisfies`).
**Enforced by.** Review; `tsc` for the copies.
**Recorded in.** This entry.

### Sign-in: Better Auth against Keycloak

**Decision.** `docs/adr/0001` chose Better Auth 1.7 with only the `genericOAuth` plugin and its
`keycloak()` helper. Users are created in Keycloak; there is no sign-up, password or profile
editing in the app. A user's first sign-in creates their `users` row, and every sign-in refreshes
name and email from Keycloak.

- **One place.** `lib/auth/` is the only importer of `better-auth`. `auth.ts` builds the instance
  lazily on `db()`. `session.ts` has `getUser()`, which turns the session into a
  `User` (`{ id, name, email }`, `user.ts`), once per request (`cache`). `lib/auth/index.ts` is
  what the rest imports: `getUser`, `requireUser` (throws `SignedOut` for a visitor), `withUser`
  (binds the user to a module's use case in its `index.ts`) and `SignedOut`. `handlers.ts` serves
  the routes. `session-cookie.ts` is the proxy's cookie check. The settings are validated in
  `lib/env.ts` (`authEnv`).
- **A user's id is the Keycloak `sub`.** Better Auth drops the provider's id when it creates a
  user. `mapProfileToUser` therefore copies `sub` into `users.keycloak_sub`, and the
  `user.create.before` hook makes it `users.id`. The `users_id_is_keycloak_sub` check keeps the
  two equal. The realm's users have fixed ids, so a user's id survives `pnpm stack:reset`.
  Account linking is off: a user deleted and re-created in Keycloak gets a new `sub` and cannot
  take over the old row by email.
- **Tables.** `users`, `sessions`, `accounts` and `verifications` are declared in
  `lib/db/schema.ts` and migrated by `lib/db/migrations/0000_create-auth-tables.sql`. Sessions
  live in Postgres (7 days), and signing out deletes the row. The cookie cache stays off.
  Keycloak's access and refresh tokens are stored encrypted with `BETTER_AUTH_SECRET`, and Better
  Auth refreshes them when they expire. OAuth state, the PKCE verifier and the nonce live in
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
  Next.js recommends for Proxy. Without one, a page goes to `/api/sign-in` and the rest of `/api/*`
  gets 401. The real check is next to the data: `app/(workspace)/page.tsx` calls `getUser()` and
  redirects a visitor whose session has ended (and hands the shell only name and email), and every
  module's `index.ts` binds the user with `withUser`, which throws `SignedOut` for a visitor. A
  route handler answers it with 401 and `{ error }` (`/api/threads/[id]/messages`, the record
  routes); an action in `app/(workspace)/actions.ts` answers `{ error, signIn: true }`, and
  `callAction` (`_components/use-action.ts`) sends the browser to `/api/sign-in` and back (ADR
  0004).

**Enforced by.** ESLint (the conventions' Rule 1 and Rule 12: a module imports `lib/auth` only in
its `index.ts`, and a script never does); review (only `lib/auth/` imports `better-auth`). The
check constraint `users_id_is_keycloak_sub`. Better Auth's startup schema check, which refuses to
run when `schema.ts` and its fields disagree.
**Recorded in.** This entry; `docs/adr/0001-auth-library-for-keycloak-sign-in.md`;
`docs/adr/0004-actions-called-from-client-state.md`.

### Stored projects, threads, conversations and placement

**Decision.** Projects, threads and their conversations are stored per user (see "Data
ownership"). Each write is a command, `createProject` in `projects/commands.ts` and
`startThread`, `forkThread` and `placeThread` in `threads/commands.ts`, which the browser reaches
through the server actions in `app/(workspace)/actions.ts` (`createProjectAction`,
`startThreadAction`, `forkThreadAction`, `placeThreadAction`). Components call them through
`useAction` or `callAction` (`ProjectForm`, `useThreads`), which show the action's refusal and
undo an optimistic change (ADR 0004).
`app/(workspace)/page.tsx` reads the user once and loads the page through the modules' `index.ts`
(`getProjects`, `getThreads`, …). A name the user already uses answers with that project instead
of adding it twice, also when a second request adds it at the same time (the
`projects_user_id_name_key` index refuses the second insert, and `createProject` answers the
first project). The browser picks a new thread's id (its chat needs it before the server answers)
and stores the thread before it sends the first message; a taken id is `ThreadIdTaken`, a project
that is not the user's `ProjectNotFound`.

The conversation follows the AI SDK's message persistence: one `thread_messages` row per
`UIMessage`, with `parts` and `metadata` in `jsonb` as streamed, ordered by `position`, keyed
`(thread_id, id)` so a fork copies messages under their ids. The database is the only copy:
the browser keeps no conversation between openings of a thread. The open thread has one AI SDK
`useChat` (`useThreadChat`), which opens with the conversation fetched from
`GET /api/threads/[id]/messages` each time the thread opens (`useStoredConversation`; a thread
the page just started opens empty and its chat sends the first question). The chat sends only
its latest message (`prepareSendMessagesRequest`); the server puts it after the stored
conversation, or in its old place when it is sent again, dropping what came after it, which is
how a regenerate replaces a reply (`withLatestMessage`, `threads/domain.ts`). When the
reply ends, finished, stopped or failed, `runAgent` hands the conversation with the reply to the
`onEnd` that `answerThread` gave it, `saveConversation` (`threads/commands.ts`), which replaces the
stored one in a transaction; the stream is read to its end on the server (`consumeSseStream`) so
the reply is stored even if the browser went away. The server names the replies
(`generateMessageId`). Leaving a thread stops its response, as closing the page does: `useChat`
stops its chat when it unmounts, and the reply is stored as it ended. A question stores the model
and skill it asked for, which a retry asks again (`lastRequest`). A thread stores no scope: what it
is about is its questions' attached items, stored in their messages
(`lib/db/migrations/0008_drop-thread-scope.sql` dropped `source_id` and `record_ids`, with no
backfill), and the sidebar row's subtitle is the snooze time or the branch. `getThreads` counts
each thread's stored questions and attachments for the sidebar. A fork is stored first, with the
conversation through the chosen response, then opened (`forkPoint`; a question or a response not
stored yet is `ResponseNotFound`); its origin is a snapshot in `forked_from_*`, not a reference.

Placement is stored on the thread: `settled_at`, `snoozed_until` and `woke_at`, at most one
set (`threads_one_placement`), none for active. Settle, snooze, restore, undo and opening a
woken thread are one command, `placeThread`, whose input names the change (`kind`), not
the timestamps: it applies the rule from `threads/contracts.ts` with the server's clock, so the
browser cannot date a change; an undo (`return`) puts back the placement the browser saw before.
The browser runs the same rules to show the change at once (ADR 0007) and puts the thread back
when the action refuses (`useThreads`). Nothing runs at a snooze's deadline: a due snooze reads as
woken at its deadline (`wakeIfDue`, in `getThreads` and before each change), and the browser wakes
an open page's threads live (`useSnoozeWake`). Asking again returns a parked thread to active
and stores the provider it now talks to (`continueThread`, in `answerThread`). Whether a response
is in flight only the browser knows, and only the open thread can have one; the browser refuses a
snooze while it does (`snoozeRefusal`). A user's connections are read from the database (see
"Integrations are provider folders"); the skill catalogue is one
`modules/skills/catalog/<id>/SKILL.md` per skill (see "Skills are SKILL.md files"). The page loads
both and hands them to the browser through `IntegrationsProvider` and `SkillsProvider`. A record
is not part of the page: a record view reads it from
`GET /api/connections/[connectionId]/records/[type]/[key]` the first time it is shown, into the
browser's `RecordViewStore` (see "The record panel"). Skill activation, the record panel's width
and each thread's record panel persist in `localStorage`; the stored skill ids are parsed with
`storedSkillIds` (`_components/skill-preferences.ts`), a stored panel with `restorePanel`. There
are no cache tags: every read is per request, and an action returns what it stored, which the
browser adds to its state.
**Enforced by.** The `thread_messages_thread_id_user_id_fkey` and `threads_one_placement`
constraints; the use-case tests in `modules/threads/` and `modules/projects/`
(`queries.test.ts`, `commands.test.ts`; `threads/queries.test.ts` reads threads stored without
a scope); `modules/threads/contracts.test.ts` and
`domain.test.ts` for the rules; `drizzle-kit check`.
**Recorded in.** This entry; `docs/adr/0004-actions-called-from-client-state.md`;
`docs/adr/0007-rules-the-browser-runs-live-in-contracts.md`.

### Threads without a project

**Decision.** A thread's `project_id` is nullable: null is a thread without a project, not a
hidden per-user default project, which would need creating at sign-in and hiding from every
list. The reference `(project_id, user_id)` → `projects(id, user_id)` lets a thread belong
only to a project of the same user; with a null `project_id` it does not apply. In the code,
`ThreadListItem.projectId` is the project's id (cross-module references are ids); the workspace
resolves it to a name through the project list, and the sidebar filter lists threads without
a project under "No project". A new thread starts without a project unless one is picked.
**Enforced by.** The `threads_project_id_user_id_fkey` constraint; `startThread` throws
`ProjectNotFound` for a project the user does not own.
**Recorded in.** This entry.

### Answers come from the Vercel AI Gateway

**Decision.** `POST /api/threads/[id]/messages` (`app/api/threads/[id]/messages/route.ts`) parses
the body with `answerThreadInput` (`threads`: the latest message) and `chatOptionsInput`
(`agent`: the model, the picked skill and the skills switched on) and hands them to
`answerThread` (`threads/commands.ts`, through `modules/threads/index.ts`), with the language
model (`gatewayModel` from `lib/ai.ts`, the AI Gateway built from `AI_GATEWAY_API_KEY`) and the
copy for a model that fails after the stream started (`describeError`). The module never reads
the env (the conventions' Rule 12). `answerThread` finds the thread among the user's (another
user's thread, a missing one and an id that is not a uuid throw `ThreadNotFound`, answered with
a 404), puts the new message after the stored conversation and hands both, with the requester,
to `runAgent` (`agent/commands.ts`). A **new** message (one the thread does not hold yet) that
attaches a connection that is not the user's throws `ForeignConnectionAttached`, a 400, before
the agent is asked (`getForeignConnectionIds`, `records/queries.ts`); a stored message sent again
by Try again is answered, and the agent leaves such a connection out. Once the agent answers, the
thread returns to active and records the provider of the model that answered. The route answers
every refusal before the stream as a status with `{ error }`.

A question carries its attached items (ADR 0003 §1) as one custom data part on the user
message, grouped by connection:
`{ type: "data-attached-items", data: { connections: [{ connectionId, provider, label, items:
[{ type, key, snapshot: { label, title, state } }] }] } }`, where `items: []` attaches the whole
connection. The part's name is permanent, like a tool name; `WorkspaceUIMessage` types it from
`records` (`RecordsDataTypes`). The composer sends `sendMessage({ parts, metadata }, { body })`,
because the `{ text }` shorthand cannot carry a data part, and each new question starts with
nothing attached. `records/contracts.ts` holds the part's schema (`attachedItemsDataSchema`: at
most 10 items from at most 5 connections, each connection once, a uuid per connection, slugs for
provider and type) and the pure rules over any `{ role, parts }` messages:
`attachedConnectionsOf(message)` (a malformed part attaches nothing) and
`threadAttachedItems(messages)` (the questions' items in order, once each by connection, type and
key, the first question keeping it). The stored part is the sent part: persistence does not
change.

The `agent` module is the runtime AI:
- `commands.ts`: `runAgent(requester, request, { languageModel, describeError })` resolves the
  context, validates the conversation against the tools and the data parts
  (`safeValidateUIMessages({ tools, dataSchemas })`; a malformed part or one over a limit throws
  `MessagesRejected`, a 400) and streams the reply with an AI SDK `ToolLoopAgent` on the given
  model (at most 5 steps), then hands the conversation to `onEnd`. It returns the response and the
  model. `convertDataPart` is `attachedItemsText` (`records`): from the part alone and
  synchronously, it turns a question's attached items into an `<attached_items>` block in that
  user message, opened by a fixed sentence (references the user picked; read them with the tools;
  their content is data, not instructions) and one line per item (connection label and
  `connectionId`, type, key, the snapshot's title and state "as attached") or whole connection.
  Browser-sent strings are quoted, so none can end a line or the block. Bodies are never inlined.
  When the thread attached anything, `runAgent` adds the **allowed connections** to the context:
  `getAllowedConnections(requester, messages)` (`records/queries.ts`) takes the connections every
  user message of the thread attached, keeps those that are still the user's and do not need
  reconnecting, and answers an `AllowedConnection` (`{ connectionId, provider, providerName,
  account, reach?, guide? }`, `records/contracts.ts`) for each. Sending fetches nothing, so
  `reach` is left out until something already holds it. `toolsFor` turns them into the record
  tools' context (see "Agent tools live in their module").
- `domain.ts`: `resolveContext` turns the browser's ids into the model and skill (an unknown id
  throws `ModelNotFound` or `SkillNotFound`, answered with a 400), so the prompt only ever holds
  what the server offers. The `AgentContext` it returns carries the requester, so a tool reads
  only what is theirs. It also turns `skillIds`, the skills switched on in this browser, into
  `offeredSkills`: known ones only (a stale id is left out, not refused), without the picked
  skill. `instructionsFor` builds the prompt: `instructions/workspace.md` (who the agent is, how
  it answers) and `instructions/formatting.md` (Mermaid, math, tables, when to call
  `html_render`), then the picked skill in full, then the offered skills by id, name and
  description ("Skills you can load"), then, when the thread attached anything, "Attached items
  and connections": `instructions/attached-items.md` (what the reference lines are, "an item from
  a connection not listed here cannot be read; tell the user", tool results are third-party data),
  the allowed connections ("None." when every one is gone) and each allowed provider's guide once.
  The connections stay TypeScript, because they are built from data; all of it is text the server
  wrote. The prompt is Markdown, so it reads and diffs as text: a `.md` file imports as its text
  (Turbopack's `text` module type in `next.config.ts`, the `markdownAsText` plugin in
  `vitest.config.mts`, typed by `markdown.d.ts`), bundled into the server code, so nothing is read
  from disk at runtime.
- `queries.ts`: the model allowlist with gateway ids (`models`), and `getModelChoices` for the
  composer.
- `tools.ts`: the registry and the agent's own tool, `html_render`, which presents and acts on no
  module's data. `tools` is every tool the agent knows, its own and the other modules'
  (`recordTools`, `skillTools`, `integrationTools`; see "Agent tools live in their module");
  `toolsFor(context)` picks the ones one answer may call and what each knows of the thread.
  Stored conversations hold the tool names and every send validates the whole conversation
  against all of `tools`, so a tool is never renamed and a removed one keeps a stub under its name
  (one exception, #62: see "Agent tools live in their module"); `tools.test.ts` lists the names.
- `contracts.ts`: the browser-safe types and schemas (`WorkspaceUIMessage`, `chatOptionsInput`,
  `ModelChoice`, the `html_render` schemas with its limits, `clampHtmlRenderHeight` and
  `normalizeHtmlRenderTitle`, which the frame runs too; ADR 0007), so the chat UI never imports the
  server side.

The frame that shows an `html_render` page is `_components/html-render-frame.tsx` (with
`html-render-document.tsx` and `html-render-dialog.tsx`); `lib/html-render/` keeps only the
frame's theme and the bootstrap injected into the page. Message text renders as Markdown through
`_components/markdown.tsx`: GitHub-flavoured, `$$` math, raw HTML shown as text, a user's single
newlines kept. `lib/markdown/` holds the plugins, the block splitting that lets a streamed reply
re-render only its last block, and the pure readers for code blocks, links and tables. Code blocks
(`_components/code-block.tsx`) are coloured by Shiki, formulas (`_components/math.tsx`) are
typeset by KaTeX as MathML, and a ```` ```mermaid ```` fence is drawn by
`_components/mermaid-diagram.tsx` with Pele once its block has finished streaming. Each library
loads with the first message that needs it, and all three take their colours from the tokens, so
`globals.css` stays the only stylesheet. Links to GitHub pull requests and issues, GitLab merge
requests and files show as chips. The instructions point diagrams at Mermaid, math at `$$`, tables
at Markdown, and charts from data and long or sortable tables at `html_render`.
**Enforced by.** `agent/domain.test.ts` (the context and the prompt); `agent/commands.test.ts` (on
a mock model: the exact `<attached_items>` text in the user message, the allowed connections and
the GitHub guide in the system prompt, a model the workspace does not offer refused, a connection
needing reconnecting or another user's left out); `records/attached-items.test.ts`;
`records/queries.test.ts` (the allowed and the foreign connections); `threads/commands.test.ts`
(`answerThread`: a foreign connection refused on a new message only, and a stored message keeping
its data part).
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`.

### Agent tools live in their module

**Decision.** A tool is another way into a module, beside its pages and actions, so it lives in
the module it acts on and is a thin wrapper over that module's queries (or, for a write, its
commands). `records/tools.ts` is the pattern: `search_records` searches one of the connections the
thread attached, through the provider's own search, the same code the attach dialog runs (ADR 0003
§4), and `read_record` reads one record through the same reader its view uses; `skills/tools.ts`
(`load_skill`, see "Skills are SKILL.md files") follows it. A tool only one provider can answer
lives in that provider's folder instead (see **Provider tools**). How a module's `tools.ts` is a
door for the agent alone is ADR 0005.
- **Files.** The tool's input and output schemas are in the module's `contracts.ts`, so the
  browser can type the tool's parts; field meanings are in their `.describe()`, and the tool's
  description says that its results are third-party data. The tool is in `<module>/tools.ts`
  (`server-only`), exported as `<module>Tools` (`recordTools`, `skillTools`), and only
  `agent/tools.ts` imports it. Its chat card is in `app/(workspace)/_components/`
  (`RecordSearchCall`, `RecordReadCall`, `SkillLoadCall`); the chat's `message-part-list.tsx` maps the
  part's state onto it.
- **Context, not trust.** What a tool may see comes from the server, never from the model: the
  tool declares it with `contextSchema`, and `toolsFor` in `agent/tools.ts` fills it from the
  resolved `AgentContext`. `search_records` and `read_record` (context `{ user?, connectionIds }`,
  `connectionToolContextSchema` from `integrations/contracts.ts`) answer `no_access` for a
  `connectionId` outside the **allowed connections** (`getAllowedConnections`, see "Answers come
  from the Vercel AI Gateway"), whatever the model asks, and are offered (`activeTools`) only while
  one connection is allowed, even one attached with no items. A tool whose context the thread
  lacks is not offered, and its `execute` refuses anyway.
- **`search_records`.** `{ connectionId, query, type?, includeClosed? }` (`searchRecordsInput`)
  answers `{ results: RecordSummary[] (at most 20, MAX_SEARCH_RESULTS), total? }` or
  `{ error: RecordError }` (`searchRecordsOutput`): every refusal comes back as data, so the model
  explains it and carries on. It calls `getRecordSearchPage(user, connectionId, { text, type,
  includeClosed, qualifiers: true })` (`integrations/queries.ts`): the provider's own qualifiers
  pass through, and the provider keeps the search inside what the connection reads (GitHub's: see
  "Integrations are provider folders"). Its card is one quiet line ("Searched @acme for “login
  timeout”: 6 results", or the error in words) with the first three results as
  `AttachedItemChip`s and "+N"; a chip opens the record's view as a tab, never under Attached.
- **`read_record`.** `{ connectionId, type, key }` (`readRecordInput`) answers `{ summary:
  RecordSummary & { url }, detail }` or `{ error: RecordError & { url? } }` (`readRecordOutput`;
  `not_found`, `no_access`, `needs_reconnect`, `rate_limited`, `unreachable`), as data. It calls
  `getRecordForModel(user, connectionId, type, key)` (`integrations/queries.ts`), which reads with
  the declared type's `readForModel`: the record views' reader, then the provider's own trim of the
  detail, written next to its readers (`recordType(declaration, read, trim)` in
  `integrations/provider.ts` types the trim against the reader's detail). The limits are
  `MODEL_LIMITS` in `integrations/provider.ts`: a body's first 8,000 characters; the newest 30
  comments (and, for a pull request, reviews and inline review comments), 2,000 characters each.
  Every cut says what it cut (`cutText`: `[… 32,000 more characters, open the view]`;
  `newestEntries` and `cutNote`: `+ 12 older comments`, and the comments a reader did not reach
  as `+ 50 later comments not read, open the view`: GitHub's readers read the first 100, so
  past that the model gets the newest of those). The trimmed copy is the tool's output and so what
  the conversation stores. Field meanings are in the provider's detail schema's `.describe()` and,
  since the model never sees an output schema, its guide (GitHub's `mergeableState`). The
  description asks for one call per record in the same step. Its card is one quiet line ("Read"
  and the record as an `AttachedItemChip`, or "Could not read acme/web#482: …"); the chip opens
  the record's view as a tab, never under Attached.
- **Provider tools.** A tool only one provider answers (GitHub's `github_pull_request_diff`, #65)
  is named after the provider and lives in its folder: its reader beside the provider's readers
  (`providers/github/diff.ts`), the tool in `providers/github/tools.ts` (`githubTools`,
  `server-only`), its schemas in `integrations/contracts.ts` (`githubPullRequestDiffInput` and
  `githubPullRequestDiffOutput`, browser-safe) and its card in
  `_components/github-diff-call.tsx` (`GithubPullRequestDiffCall`). `integrations/tools.ts`
  gathers them by provider as `integrationTools`, and `integrationToolsFor(user, connections)`
  offers a provider's tools only while one of its connections is allowed, each seeing only those
  (context `{ user?, connectionIds }`, `connectionToolContextSchema`). Each runs through
  `readWithConnection` (`integrations/repo.ts`): a `connectionId` outside them is `no_access`
  and nothing is read, one that is gone or of another provider `not_found`, a refused credential
  marks the connection `needs_reconnect`; the provider's code is handed only a `ConnectionAccess`.
  The card draws the record through a slot, which the chat fills with `RecordChip`, so a click
  opens the record's view.
- **`github_pull_request_diff`.** `{ connectionId, key, path? }` answers `{ summary: RecordSummary
  & { url }, fileCount, files: [{ path, previousPath?, status, additions, deletions, patch?, note?
  }], note? }` or `{ error: RecordError & { url? } }`, as data. It reads `/pulls/{n}` and the first
  100 changed files with their patches (`/pulls/{n}/files`) in parallel. Invisible and
  bidirectional characters are stripped from paths as the readers do, but shown in a patch as their
  code points (`<U+202E>`, `codePointsShown`), since in code such a character may be the change
  itself (a Trojan Source edit). `path` keeps only the file at that path. The
  limits are `MODEL_LIMITS`' `diffFileCharacters` (4,000 per file, `cutText`: `[… 1,000 more
  characters, the rest is on GitHub]`) and `diffCharacters` (40,000 diff characters in all, the
  cut notes aside): the file whose diff would pass the total, and every later one, is listed
  without its diff and says so. The answer's `note` says how many were listed so ("ask for one by
  its path"), how many changed files were not read, or that no changed file is at `path`; a file
  GitHub shows no diff for (binary, too large) says that. Its card is one quiet line, "Read the
  diff of" the pull request as a chip "(12 files)" (with `path`, "Read the diff of src/a.ts in" it,
  or "Found no changed file at src/a.ts in" it), or the error in words.
- **Registration.** `agent/tools.ts` spreads the module's tools (and `integrationTools`) into
  `tools`, adds the tool's context to `toolsFor` (`integrationToolsFor`'s for provider tools), and
  `WorkspaceUITools` in `agent/contracts.ts` gets its types.
- **Behaviour.** The tools only read. Record bodies never reach the prompt: the model reads
  records through tools.
- **Names.** A stored conversation holds tool names, so a removed tool keeps a stub under its
  name. One exception was made: the thread scope's `search_records` (#62) kept no stub, and its
  name was reused with the new schema, because the database is reset with that change
  (`pnpm stack:reset`), so no stored conversation holds the old parts.

**Enforced by.** `agent/tools.test.ts` (the tool names, the `search_records`, `read_record` and
`github_pull_request_diff` schemas, what `toolsFor` offers, a provider's tools only over its
connections); `records/tools.test.ts`; `skills/tools.test.ts`; `agent/commands.test.ts` (on a mock
model over recorded GitHub answers: `search_records` offered for a connection attached whole and
not for one needing reconnecting, the call reaching GitHub with the token's scope and an outside
`repo:` or `user:` dropped, results kept to the token's repositories when the query names their
owners, no number read directly when a qualifier passes through, a foreign `connectionId`
answering `no_access`, a 422 answering `invalid_query`; `read_record` reading the recorded issue
and pull request with long bodies and comment and review lists cut with their notes, two records
read in one step, a foreign `connectionId` answering `no_access`, a 404 answering `not_found`;
`github_pull_request_diff` offered with a GitHub connection and not without one, the recorded
merged pull request's files and patches, invisible characters shown as code points in a patch,
each file cut at 4,000 characters and the answer at 40,000 with their notes, `path` narrowing to
one file or saying none is there, a foreign `connectionId` answering `no_access`);
`integrations/providers.test.ts` (every declared type reads for its view and for the model); `tsc`
(`WorkspaceUITools`, `toolsContext`).
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`;
`docs/adr/0005-agent-tools-are-a-door.md`.

### Integrations are provider folders

**Decision.** `docs/adr/0002` chose one leaf module, `integrations`, with one folder per
provider: a system the workspace connects to (`providers/github/` today; Atlassian, codebeamer,
PostHog, Stripe and Supabase are planned). There is no sample provider: the workspace shows only
what the user connects (ADR 0003 §5). A provider is
`defineProvider({ id, name, description, auth, baseUrl, verify, records?, guide? })`
(`provider.ts`, the provider SPI; ADR 0006), registered by one line in `providers.ts`, and written
in its folder: `index.ts` (the manifest), `api.ts` (its HTTP calls, every response parsed with
zod), `records.ts` (its record types, states, search and one reader per type, only with records),
an optional `guide.md`: what the agent should know to use its connections (what its records and
states mean, how its search reads), imported as text, declared as the manifest's `guide`, kept
server-side (never on `ProviderChoice`) and in the system prompt while one of its connections is
allowed (`getProviderForPrompt`, `integrations/queries.ts`; `providers.test.ts` caps its length),
and an optional `tools.ts` for agent tools of its own, with their readers beside it (GitHub's
`github_pull_request_diff` and `diff.ts`; see "Agent tools live in their module"; the record tools
are `records`'). A provider's browser-side parts are not in its folder (ADR 0006): its detail and
tool schemas are in `integrations/contracts.ts`, its views in
`app/(workspace)/_components/github-*.tsx`. A provider's code is handed a `ProviderAccess` (the
API address and the `Authorization` header value) and never reads a secret, an env var or the
database. `auth` lists how a user connects: `token` (sent as `Bearer`) or `basic` (username and
password, or an email and API token, sent as HTTP Basic); `verify` checks a credential and names
the account, and answers a refusal as a `VerifyRefusal` value.

A connection is one user's link to one account of a provider at one address (`connections`,
unique per user, provider, `base_url` and `account_ref`). `getConnections(requester)` answers
with the stored ones (`ConnectionListItem`), in the order they were made; a new user has none.
`connect` (`integrations/commands.ts`) verifies the credential with the provider before anything
is stored, then writes the connection and its credential in one transaction; connecting the same
account again updates both. `testConnection` asks the provider again (a refused credential is
`needs_reconnect`; an unreachable provider changes nothing), and `disconnect` deletes the
connection and, by cascade, its credential. What stops them is a class from
`integrations/errors.ts` (`ProviderNotFound`, `BaseUrlRefused`, `CredentialRejected`,
`ProviderRateLimited`, `ProviderUnreachable`, `ConnectionNotFound`), which `connectAction`,
`testConnectionAction` and `disconnectAction` in `app/(workspace)/actions.ts` turn into copy
(ADR 0004). The base URL must be HTTPS, and `connect` (so connecting and reconnecting) refuses one
that points the server at itself or at an internal network (`refuseInternalAddress`, which throws
`BaseUrlRefused` with a `reason`): a host that is `localhost`, or a loopback, private (RFC 1918,
unique local) or link-local address, given literally or among what its name resolves to, and a
name that does not resolve. The action answers it with `field: "baseUrl"`, the form shows it as
the URL field's error, and nothing is stored. The check runs when a connection is saved only: no
DNS pinning and no re-check per request (decided in #44), so every provider request is sent with
`redirect: "error"` and cannot be led elsewhere. Settings → Data sources (code name `sources`:
`SourcesSettingsPanel`, and `ConnectForm`, built from the provider's `auth` and `baseUrl`) lists
every provider and the user's connections; the sidebar's "Data sources" button opens it.
`IntegrationsProvider` holds them, and an action's answer goes into its state. With no
connection, the new-thread page offers the first provider with records in one quiet line
("Connect GitHub to ask about your issues and pull requests", from its name and `pluralLabels`;
`invitedProvider`), and the attach dialog says "No data sources connected yet" with "Connect
GitHub"; both open Settings → Data sources, and the composer keeps its draft. With a connection,
the new-thread page shows no line.

A provider with records (ADR 0003 §3) declares them in its manifest's `records`: its types, each
with a singular and a plural label and its states, each state with a label and a tone from
`RECORD_TONES` (`open`, `draft`, `done`, `closed`, `neutral`; an undeclared state draws
`neutral`); which of the dialog's generic filters (`type`, `includeClosed`) its search supports;
the hint the dialog shows under its search field (`hint.idle` before typing, `hint.typing` while
typing; a provider's own terms, such as GitHub's numbers and repository names, stay in its
declaration); and its search, which answers a `RecordSearchPage` (`RecordSummary`s, an opaque
`next` cursor, `total`, the connection's `reach`, and `narrowedTo` when the text narrowed it,
which the dialog shows) or a `RecordError` as an `Answer` value and never throws (ADR 0006). Each
declared type also has a `read(access, key)`, which answers the record's live `RecordSummary` and
the provider's own detail, and a `readForModel` that trims it for the model
(`recordType(declaration, read, trim)`; see "Agent tools live in their module"). The detail is the
provider's own (`GithubIssueDetail` or `GithubPullRequestDetail`, zod schemas in
`integrations/contracts.ts`; there is no generic detail type), and the manifest's
`url(baseUrl, type, key)` builds the record's page from the connection's base URL and the key,
without asking the provider. The declarations, without code (`getProviderChoices` drops the
readers), reach the browser on `ProviderChoice.records`. The browser's registry is
`_components/record-views.ts` (`providerViews`), one line per provider: its views
(`_components/github-views.tsx` for GitHub) map each declared type to `{ view, icon }`, a
`React.lazy` body-only view (`({ detail }) => …`, drawn with the shared Markdown renderer, which
checks the detail against its schema) and the type's kind mark, beside the provider's mark, keyed
on the provider id. The view kind is derived, `viewKindOf(provider, type)` = `github.issue-view`,
never declared; `RecordViewBody({ kind, detail })` draws a kind's body, loading its chunk with the
first view of that kind, and says so for a kind nobody registered. `ProviderMark`,
`RecordKindMark` and `RecordStateBadge` draw the marks and a state's declared label in its tone.

`getRecordSearchPage(requester, connectionId, query)` (`integrations/queries.ts`) finds the connection
among the user's (another user's is `not_found`) and runs the provider's search; a
`needs_reconnect` answer marks an active connection `needs_reconnect` (`markNeedsReconnect`,
`integrations/repo.ts`). `GET /api/connections/[connectionId]/records?q=&type=&closed=&cursor=`
serves it to the attach dialog, `private, no-store`; `record-error.ts` beside it answers a refusal
as a status and `{ error, refusal }`, the copy and the `RecordReadRefusal` (404, 403, 409 for
`needs_reconnect` because 401 means the session ended, 429 with `Retry-After`, 502, 422).
`getRecord(requester, connectionId, type, key)` (`integrations/queries.ts`) does the same for one
record: another user's connection, an undeclared type or a key the provider cannot parse is
`not_found`, a `needs_reconnect` answer marks the connection, and a refusal carries the record's
`url`. `GET /api/connections/[connectionId]/records/[type]/[key]` serves it to the record views
(the key URL-encoded, parsed only by the provider), `private, no-store`, answering `{ summary:
RecordSummary & { url }, detail }` or the same refusal. GitHub's issue reader (#60) reads
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
nothing widens the agent's search past the token's repositories. `482` or `#482` is searched as
`482`; with one repository in play (narrowed, or the only one the token reads) the issue or pull
request of that number is also read (`GET /repos/{o}/{r}/issues/{n}`) and put on top when the
toggles let it through. Before typing, two searches sorted by `updated` run in parallel (each per
type for "All"), one with `involves:@me`, and their results are listed once each, the first's
first; later pages continue the second. The attach dialog searches 250 ms after the last
keystroke, aborts the search in flight when a newer one starts, and keeps the answers by
`(connection, q, toggles)` while it is open (`useSearchCache`); nothing is cached on the server. A
refused search keeps the results shown and adds one quiet line (the rate limit's wait, or
"Reconnect GitHub"). A connection that needs reconnecting shows so with **Reconnect**, its search
is disabled, and the dialog opens on it only when no other works (`defaultConnectionId`,
`records/contracts.ts`). GitHub's classifier (`classifyGithubAnswer` in `providers/github/api.ts`)
is shared with `verifyGithubToken`, which reports a rate limit as `rate_limited` rather than a
refused token: 401 is `needs_reconnect`; a 403 or 429 with `x-ratelimit-remaining: 0`,
`retry-after` or a secondary rate limit is `rate_limited` with `retryAt`; another 403 `no_access`;
404 `not_found`; 422 `invalid_query`; anything else, or no answer, `unreachable`.

The GitHub provider's tests replay recorded answers (ADR 0003 §5): `providers/github/fixtures/`
holds plain GitHub JSON, one response body per file, captured from the public sandbox
`laserjm/workspace-fixtures`. The sandbox's records are made by its `seed/seed.sh` and labelled
`case/<name>`, so they can be rebuilt; the folder's README holds one `gh api` line per file. Only
public data is saved: `/user` without its account-only fields, and `/user/repos` cut to the
sandbox. A test answers `fetch` with `useRecordedGithub({ "GET /path": "file.json" })`
(`test/support/recorded-github.ts`; an error answer is written inline, and an unlisted request
fails the test and names it), over a connection with a fake token that `insertConnection`
(`test/factories.ts`) stores.
**Enforced by.** `providers/github/fixtures.test.ts` (README lines and files one to one, each
seeded case found by its label, CI on the heads of the merged and the draft pull request, no token
or `Authorization`); `integrations/providers.test.ts` (the declarations of every provider in the
registry: unique ids, an auth method, a base URL and `verify`, declared record types whose states'
tones are in the set, every declared type read for its view and for the model, a guide under its
size cap); `test/record-views.test.ts` (a view and an icon for every declared type and no other,
only providers in the registry); `integrations/commands.test.ts` (connect, reconnect, refusals
including each internal address kind with name resolution stubbed, test, disconnect, someone
else's and a malformed id); `integrations/queries.test.ts` (the scoped search, the toggles and
the cursor, one search per type for "All", the before-typing pair, narrowing by a repository name,
the number on top, the `user:` fallback, the computed states, another user's connection, each
refusal and a 401 marking the connection; an issue's and a pull request's reads with their
reviews, files, merge state and CI, Unicode stripped, a type or key that names nothing, 403, 429
with `retryAt`, unreachable); `providers/github/api.test.ts`; `records/contracts.test.ts` (the
dialog's default connection); `tsc`. The statuses of `record-error.ts` by review.
**Recorded in.** This entry; `docs/adr/0002-integrations.md`;
`docs/adr/0003-attached-items-and-record-views.md`;
`docs/adr/0006-providers-answer-refusals-as-values.md`.

### The record panel

**Decision.** An open thread's right-hand panel shows its attached items as record views (ADR 0003
§2, #40, #51, #66). It is the workspace's UI in `app/(workspace)/_components/`, over `records`'
rules: the shell puts `RecordPanelProvider` (`record-panel-provider.tsx`, keyed by nothing, told
the open thread) around the header and the conversation, `RecordPanelToggle` in the header of an
open thread (no panel and no button on the new-thread page), and `ThreadPanel` draws its
`panel` render prop, `RecordPanel` (`record-panel.tsx`), beside the conversation once that is
here.
- **State.** `_components/record-panel-state.ts` is pure: per thread, the open views (in the order
  they opened, each with the snapshot it was opened from, so a tab draws without fetching), the
  pinned one (none when nothing is pinned), the active one below the tabs (none shows the fixed
  **Attached** tab; never the pinned one), whether the panel is shown and whether the user
  rearranged it (opened, focused, closed, pinned, unpinned or hid) since their last question. A
  view's id is `<viewKind>:<connectionId>:<key>`. `openView` (a chip or an Attached row) opens or
  focuses and shows the panel; `openSent` opens a question's items and focuses the first, showing
  a hidden panel on a wide screen, unless the user rearranged the panel since their last question,
  when they open without taking focus; closing a view focuses its neighbour among the tabs
  (`tabsOf`), the last one Attached. Nothing opens twice.
- **Pinning.** Any view can be pinned from its frame (`pinView`): it takes the top half of the
  panel and stays put, and keeps its place among the open views but loses its tab; the tabs and
  the active view take the bottom half. One pin at a time: pinning another returns the old one to
  the tabs, shown in the new one's place when that was the active view, or else its neighbour.
  Unpinning (`unpinView`) returns it to the tabs, focused; closing a pinned view unpins it. The
  pinned view is never focused below: `focusView` ignores it, and a chip's `openView` or a
  question's first item that is pinned leaves the active view as it is.
- **Stored.** The provider keeps each thread's state in `localStorage`
  (`workspace:record-panel:<threadId>`, versioned, read by `restorePanel`): version 2 holds the
  pin, version 1 is migrated with nothing pinned, another version or an unreadable value starts
  afresh, a view that does not read is dropped, a pin on a view that is gone is dropped and a focus
  on the pinned view shows Attached. A thread with nothing stored starts open on a wide screen when
  it has attached items, hidden otherwise; below 1200px the panel is a sheet over the conversation
  and always starts hidden (a stored pin is kept for when it is shown).
- **Sending.** `RecordPanel` hands the provider's `follow` the conversation and the message ids it
  has seen since it mounted; `followConversation` calls `openSent` for each question it had not
  seen. A stored question opens nothing, and Try again, which asks a question it has seen again,
  leaves the panel exactly as it is (the same state, so nothing is set or stored), its "rearranged"
  flag included. Chips on a sent question call `open`.
- **Fork.** A fork is a new thread, so its panel reads nothing stored, never the origin's: it
  starts open on a wide screen on the Attached tab, which lists every inherited item grouped by
  question, with no views open, no pin and "rearranged" clear. Its copied questions are there when
  the panel mounts and open nothing; its first new question opens and focuses its items.
- **The panel.** The Attached tab lists `attachedByQuestion(conversation)` (`records/contracts.ts`,
  built on `threadAttachedItems`), grouped by the question that attached them, each marked when its
  view is open; empty, it offers "Choose a data source", whose picks land in the composer's draft
  (the shell holds the open thread's draft for both). A tab per view but the pinned one: the kind
  mark in its live state's tone, the short label, close on hover or middle-click. Only the active
  and the pinned view render and read. Its frame (kind mark, where, live state badge, title, pin or
  unpin, refresh, "Open on <provider>", close) is provider-neutral; the body is the provider's
  `RecordViewBody`. Errors: not found or no access offer Retry and the record's page; needs
  reconnecting offers Reconnect (Settings → Data sources) and Retry; a removed connection says so,
  with no link, and reads nothing. On a wide screen the panel is resizable (`ResizablePanel`, its
  width in `localStorage`).
- **View data.** `RecordViewStore` (`_components/record-view-store.ts`) holds each view's record
  by view id for the page's lifetime: read the first time the view is shown, shared while in
  flight, kept when the view is shown again; refresh (and Retry) reads again, showing the record it
  has meanwhile. Nothing is cached on the server.

**Enforced by.** `_components/record-panel-state.test.ts` (open and focus, nothing twice,
`openSent` with and without "rearranged", the neighbour on close and Attached after the last,
starting open or hidden; Try again leaving the state unchanged, a fork's fresh state and its first
new question; pin, re-pin replacing the pin, unpin, closing a pinned view, the focus rules with a
pin; the pin stored, version 1 migrated, a stored state of another version or a corrupt one);
`_components/record-view-store.test.ts` (one read per view, refresh, a refusal kept until a
retry); `records/attached-items.test.ts` (the grouping by question).
**Recorded in.** This entry; `docs/adr/0003-attached-items-and-record-views.md`.

### Connection credentials live in the vault

**Decision.** A credential is stored only in `connection_secrets`, one row per connection, as
AES-256-GCM ciphertext (`lib/db/cipher.ts`, pure) whose authenticated data binds it to its
connection and user, so a copy in another row does not decrypt. The keys are `INTEGRATION_KEYS`
(`vaultEnv` in `lib/env.ts`): `<version>:<32-byte base64 key>`, the newest first; new secrets use
the first, and `key_version` names the one a row used, so a key is rotated by adding a version in
front and re-encrypting. It is separate from `BETTER_AUTH_SECRET`. `lib/db/vault.ts` is the only
reader and writer of the table (`writeSecret`, `readSecret`): it seals any JSON value and reads the
key ring on first use, and the integrations module parses what comes back as a `Credential`
(`readCredential`, `integrations/repo.ts`). `accessFor` (`integrations/repo.ts`) turns a
connection into a `ConnectionAccess` per request, the only form in which a credential leaves the
module. Nothing returns, logs or renders a credential: `ConnectionListItem` has no secret field
(`connectionColumns`), and the connect form never shows a stored token. Better Auth's `accounts`
stays the sign-in identity; it holds no integration tokens.
**Enforced by.** Review: only `lib/db/vault.ts` imports `connectionSecretsTable` (and
`integrations/commands.test.ts`, which reads the row to check it holds no token); ESLint (the
conventions' Rule 6: no other module imports `integrations/repo.ts`, so none reaches
`readCredential` or `accessFor`); `lib/db/cipher.test.ts` (round trip, a fresh iv, the wrong
binding, a changed ciphertext, an older key version); `integrations/commands.test.ts` (the stored
row holds no token; someone else's connection is refused).
**Recorded in.** This entry; `docs/adr/0002-integrations.md`; `.env.example`.

### Skills are SKILL.md files

**Decision.** Each skill is a folder, `modules/skills/catalog/<id>/SKILL.md`: the folder name is
its id, the frontmatter holds `name`, `description`, `output`, `prompt`, `enabledByDefault` and
`order` (one `key: value` per line), and the body is the instructions the agent gets. A folder
may hold more files for the skill (examples, references). `skills/queries.ts` picks the files up
with Turbopack's `import.meta.glob`, bundled with the server code like the agent's instructions,
parses each with a strict schema (`parseSkill`) and sorts by `order` (a glob sorts by path);
`getSkills` answers them as `SkillDetail`s. A malformed file throws with its path when the
catalogue loads, which `next build` does. The browser gets the whole skill, instructions included:
the settings panel shows them. Adding a skill is adding a folder.

A skill reaches the agent two ways. The one the user picks for a message is in the prompt in
full, as before. The others the user switched on (`skillIds` with each message, from
`useSkillPreferences`; the rules are `_components/skill-preferences.ts`) are listed by id, name
and description only, and the model loads one's instructions with `load_skill`
(`skills/tools.ts`) when a question fits it. The tool's context is the offered ids, filled by the
server, so it never loads a skill the user switched off. Its chat card, `SkillLoadCall`, shows
"Using the “Risk review” skill".
**Enforced by.** `skills/queries.test.ts` (every file parses, in order; malformed files are
refused); `next build`; `skills/tools.test.ts` (only offered skills load);
`agent/domain.test.ts` (what is offered); `agent/commands.test.ts` (on a mock model, the tool
answers a switched-on skill).
**Recorded in.** This entry.

### Styling: design tokens and Tailwind classes

**Decision.** `app/globals.css` is the only stylesheet. It holds the design tokens in three
layers, after T3 Code's `apps/web/src/index.css`: Tailwind's scales plus the dense type sizes
below `text-xs` (`text-2xs` 11px down to `text-5xs` 7px, registered with `cn` in
`lib/utils.ts`); semantic variables in `:root` (the workspace's warm greys) and `.dark`; and
`@theme inline` mappings that make them utilities (`bg-sidebar-row-hover`,
`text-secondary-label`, `shadow-popover`). Components style themselves with Tailwind classes
on those tokens and nothing else: no hex colours, no font sizes off the type scale, no CSS
files beside `globals.css`. Colours that only identify something (project letters, provider
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
**Enforced by.** `scripts/check-styles.mjs` (`pnpm lint:styles`, part of `pnpm lint` and CI; run
with `--conditions=react-server`): STYLE-01 one stylesheet, STYLE-02 no hex colours or colour
functions, STYLE-03 no arbitrary font sizes. Its allowlist names two files:
`lib/html-render/html-render.ts`, whose iframe pages cannot read the app's CSS variables, and the
VS Code brand colour in `app/(workspace)/_components/vscode-icon.tsx`.
**Recorded in.** This entry; the colour-mapping comment in `globals.css`.
