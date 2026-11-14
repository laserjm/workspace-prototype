# Workspace Prototype

A connected-workspace prototype built with Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui.

## Development

Use Node.js 20.9 or newer, pnpm and Docker.

```sh
pnpm install
cp .env.example .env.local   # then fill in AI_GATEWAY_API_KEY, BETTER_AUTH_SECRET and INTEGRATION_KEYS
pnpm stack:up                # Postgres and Keycloak, waits until both are healthy
pnpm db:migrate              # applies lib/db/migrations/ to the workspace database
pnpm dev
```

Open [localhost:3000](http://localhost:3000). It sends you to Keycloak; sign in as `alice` /
`alice` or `bob` / `bob`.

### Sign-in

Users are created in Keycloak, never in the app: the admin console (Users → Create user, then
Credentials → Set password with "Temporary" off) is the only way to add one. Their first sign-in
creates their row in `users`, whose id is their Keycloak `sub`. The sign-out button in the
sidebar ends the session here and in Keycloak. How it fits together is in
[ARCHITECTURE.md](ARCHITECTURE.md) ("Sign-in"), and why Better Auth is in
[docs/adr/0001](docs/adr/0001-auth-library-for-keycloak-sign-in.md).

### Local stack

`compose.yaml` runs Postgres 17 and Keycloak 26 (dev mode). The defaults need no `.env`; put
overrides (ports, passwords) in a `.env` file next to `compose.yaml`, see `.env.example`.

| Service | Address | Credentials |
| --- | --- | --- |
| Postgres, app database | `localhost:5433/workspace` | `workspace` / `workspace` |
| Postgres, Keycloak's database | `localhost:5433/keycloak` | `keycloak` / `keycloak` |
| Keycloak admin console | [localhost:8080/admin](http://localhost:8080/admin) | `admin` / `admin` |
| Keycloak realm `workspace`, client `workspace-web` | `http://localhost:8080/realms/workspace` | users `alice` / `alice`, `bob` / `bob` |

The realm is imported from `docker/keycloak/realms/workspace-realm.json`; that folder's README
describes the client and users and how to export changes made in the admin console.

```sh
pnpm stack:down     # stop; data stays in the postgres-data volume
pnpm stack:reset    # stop and delete the volume; the next start re-creates both databases
```

### Database

The schema is code-first with Drizzle: tables live in `lib/db/schema.ts`. After a change,
generate the migration and apply it:

```sh
pnpm db:generate --name create-threads   # writes lib/db/migrations/NNNN_create-threads.sql
pnpm db:migrate
pnpm db:studio                           # browse the data
```

Never edit a generated migration; CI fails when `schema.ts` and `lib/db/migrations/` disagree.

## Checks and production

```sh
pnpm lint          # ESLint, then the design tokens (scripts/check-styles.mjs)
pnpm typecheck     # route types, then tsc
pnpm test          # needs the stack (pnpm stack:up); creates and migrates workspace_test
pnpm build
pnpm start
```

The tests run against their own database, `workspace_test`, on the compose Postgres:
`test/global-setup.ts` creates it, migrates it and empties it before every run, and refuses any
database whose name does not end in `_test`. Start the stack with `pnpm stack:up` first.

## Workspace screen

The screen adapts the T3 Code shell into an enterprise workspace: a thread sidebar, a project breadcrumb, a centered new-thread composer and, beside an open thread, a record panel. It supports sidebar search and filters, project creation and selection, thread navigation, model and skill selection, and file attachment previews.

The filter button beside sidebar search opens a searchable project picker. Select one project, Shift-click or Shift+Enter to include or remove multiple projects, and choose **All projects** to clear the filter. Selected project badges replace the filter icon. Project filtering combines with thread search, includes newly created projects, and changes only the sidebar list; it leaves the current conversation open.

### Connect GitHub and ask about your issues and pull requests

The workspace reads only what you connect. Until you do, the new-thread page says **Connect GitHub to ask about your issues and pull requests**, which opens **Workspace settings → Data sources**.

1. **Create a token.** On GitHub, open **Settings → Developer settings → Fine-grained tokens → Generate new token**. Choose the repositories the workspace may read, and give it read-only access to **Metadata**, **Issues**, **Pull requests**, **Commit statuses** and **Actions**. Without the last two, a pull request's view still loads and says which permission its CI section needs.
2. **Connect it.** Open **Data sources** in the sidebar (or **Workspace settings → Data sources**), choose **Connect** on GitHub and paste the token. GitHub checks it before anything is stored; the token is kept encrypted and never shown again. The connection lists its account and when the token expires; **Test** asks GitHub again and **Disconnect** removes it.
3. **Attach items.** Above the composer, choose **Choose a data source** (or the paperclip's **Choose a data source**). The dialog lists issues and pull requests involving you, then recently updated ones. Type words, a number (`482`) or a repository name (`web`), filter by type or include closed items, and tick what the question is about. With nothing ticked, **Ask about @you** attaches the whole connection, which the agent searches when it needs to. With nothing connected, the dialog says **No data sources connected yet** and offers **Connect GitHub**; your draft stays in the composer.
4. **Ask, and read them.** Send the question. The agent reads the attached items, and searches the connection when it needs more, with GitHub's own search. Beside the thread, the record panel opens each attached item as a tab: an issue with its comments, a pull request with its reviews, changed files, merge state and CI. **Attached** lists every item the thread's questions attached; choose a chip in the conversation to open its view, and refresh a view to read it again.

When GitHub no longer accepts a token, the connection needs reconnecting: the dialog and the record panel say so and offer **Reconnect**, and connecting the same account again replaces the token.

Threads, their conversations, and where they sit (active, settled, snoozed, or woken) are stored per user, so a reload keeps them; a snooze whose time passed while the workspace was closed shows as woken when it opens. Skill activation, the record panel's width and each thread's open record views persist in this browser. File attachments are held in the browser and only their names are added to a thread; files are not uploaded, parsed, or used in responses.

### Settle, snooze, and preview sessions

1. Hover a session or focus it with the keyboard to reveal its full title and project. Use the info button to open the same details in a dialog, including on touch devices.
2. Choose **Settle** to move a session into the **Settled** shelf. Settling the open session advances to the next active session within the sidebar filters, or a new thread when none remain. **Undo** is available for eight seconds. Expand the shelf to reopen a session or use **Un-settle** to return it to the active list.
3. Use the clock button to snooze for **1 minute**, **1 hour**, **Tomorrow at 09:00**, or **Next week on Monday at 09:00**, in the browser’s local time. **Custom…** accepts a future local date/time or a duration in minutes. Snoozing is unavailable while a response is being prepared.
4. Expand **Snoozed** to see return times or wake a session manually. Sessions return automatically at their deadlines with a **Woke** indicator, without changing the open conversation. Returning to an inactive tab also checks overdue sessions. The one-minute option makes this easy to demonstrate.

Both shelves respect project filtering and thread search. Search reveals matching parked sessions automatically. Reading a parked session leaves its placement intact; sending a follow-up returns it to active. The conversation, its attached items and the skills it used remain intact throughout.

### Try skills

**Choose a skill** sits beneath the composer on the left, in both new threads and ongoing sessions.

1. Attach a few issues, then open **Choose a skill** and select **Risk review**. The hint and the example prompt describe the selected skill. The agent answers with the skill's instructions.
2. Open **Manage skills** from the picker, or open **Workspace settings → Skills**. Search the catalog, inspect each skill’s instructions, and activate **Action plan**. Changes save automatically in this browser and appear in the picker immediately.
3. Active skills you did not pick are offered to the agent by name, and it loads one when a question fits it.

Summary and Risk review start active; Action plan starts inactive so the activation flow can be tried. Skill selections are captured per message, and past responses retain the skill they used, including in forks.

### The record panel

On desktop, drag the record panel’s left edge to resize it. The width is remembered in this browser and adjusts to leave room for the conversation. Focus the divider and use Left/Right (Shift for larger steps), Home/End for the limits, or double-click to reset. Below 1200px the panel is a sheet over the conversation.

## Project structure

How the code is organised (layout, modules, imports, errors, tests) is
[docs/CONVENTIONS.md](docs/CONVENTIONS.md); the project's departures from it are in
[docs/adr/](docs/adr/), and the product's own decisions in [ARCHITECTURE.md](ARCHITECTURE.md).
Paths below are relative to the repository root, which `@/` points to.

```
app/
  layout.tsx                    root layout, fonts, metadata, globals.css
  (workspace)/
    page.tsx                    server component: reads every catalogue, renders the shell
    actions.ts                  the server actions the browser calls
    _components/                all of the workspace's UI
  api/
    threads/[id]/messages/      GET loads a thread's conversation, POST streams the next answer
    connections/[connectionId]/records/   the attach dialog's search, and one record for its view
    sign-in/, sign-out/         start the Keycloak sign-in and end the session
    auth/[...all]/              Better Auth's endpoints (the Keycloak callback)
modules/
  agent/                        the runtime AI: models, instructions, tools, the agent loop
  threads/                      conversations: settle, snooze, wake, fork, answering one
  integrations/                 providers (one folder each), the user's connections
  records/                      attached items, the allowed connections, search_records and read_record
  skills/                       skill catalogue (catalog/<id>/SKILL.md)
  projects/                     the user's projects
components/ui/                  shadcn primitives only
lib/                            auth, env, the db (schema, migrations, vault), the AI Gateway, Markdown and html_render helpers
test/                           global setup (workspace_test), factories, recorded GitHub answers
```

What a module's files are and who may import which is in docs/CONVENTIONS.md. Here,
`threads.answerThread` is the work behind `POST /api/threads/[id]/messages`: it hands the
conversation to `runAgent` (`modules/agent/commands.ts`) and stores what comes back.

Add shadcn components with:

```sh
pnpm exec shadcn add card input
```

## Reference

The reference screen lives in [T3 Code's web app](https://github.com/pingdotgg/t3code/tree/main/apps/web), specifically `components/chat/DraftHeroProjectHeading.tsx`, `ChatComposer.tsx`, `ChatHeader.tsx`, and `components/Sidebar.tsx`. Session lifecycle and previews follow `components/sidebar/SidebarThreadRow.tsx`, `Sidebar.snooze.ts`, `CustomSnoozeDialog.tsx`, and `ThreadHoverCard.tsx`, adapted to enterprise source records. The desktop app provides the Electron shell around the web UI. The appearance is adapted into standalone Next.js components, without the T3 runtime or backend dependencies.

Provider and Linux icons are adapted under the MIT license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
