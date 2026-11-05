# Workspace Prototype

A connected-workspace prototype built with Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui.

## Development

Use Node.js 20.9 or newer, pnpm and Docker.

```sh
pnpm install
cp .env.example .env.local   # then fill in AI_GATEWAY_API_KEY and BETTER_AUTH_SECRET
pnpm stack:up                # Postgres and Keycloak, waits until both are healthy
pnpm db:migrate              # applies drizzle/ to the workspace database
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

The schema is code-first with Drizzle: tables live in `src/lib/db/schema.ts`. After a change,
generate the migration and apply it:

```sh
pnpm db:generate --name create-threads   # writes drizzle/NNNN_create-threads.sql
pnpm db:migrate
pnpm db:studio                           # browse the data
```

Never edit a generated migration; CI fails when `schema.ts` and `drizzle/` disagree.

## Checks and production

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Workspace screen

The screen adapts the T3 Code shell into an enterprise workspace: a thread sidebar, project breadcrumb, a compact source picker, and a centered new-thread composer. It supports sidebar search and filters, project creation and selection, local thread navigation, model and permission selection, and file attachment previews.

The filter button beside sidebar search opens a searchable project picker. Select one project, Shift-click or Shift+Enter to include or remove multiple projects, and choose **All projects** to clear the filter. Selected project badges replace the filter icon. Project filtering combines with thread search, includes newly created projects, and changes only the sidebar list; it leaves the current conversation open.

### Try the enterprise-source flow

1. Open **Choose a source** above the composer on the left and choose **Jira**. The source picker uses the same compact style as the **Full access** picker. The adjacent scope control shows **Platform · Sprint 24 / 5 tickets**.
2. Click the scope strip to inspect the five sample tickets and change the selection. At least one record is required.
3. Click **Try it — Create a summary of these 5 tickets**, then send the message.
4. The session shows a sample summary beside a lightweight Jira explorer. Search, filter by status, switch to the grouped board view, or open a ticket to inspect its description, owner, priority, and next step.
5. Click a citation in the response to open that record in the explorer. Try **What are the risks?** or **What are the next steps?** as follow-ups.
6. Start another thread with **Confluence** (three sample pages) or **Codebeamer** (four sample requirements and test items). Each thread keeps its own record scope. The sidebar includes a ready-made session for each source.

Responses now follow T3 Code’s timing pattern: a live **Working for …** row settles into **Worked for …** (or **Continued for …** on a follow-up). Hover or focus the row to reveal its start time in HH:mm; click the chevron to inspect source and timing details. Hover the message body to reveal copy, fork, and completion time beneath it. Touch devices keep the controls visible. Fork stores an independent thread containing the conversation through that response and preserves its source scope.

New sample responses have a short, measured 2.4-second preparation phase so the running timer can be exercised. Completed sample sessions have fixed fictional timestamps. Clipboard errors are reported beside the copy button.

On smaller screens, **View source** and citations open the explorer in an accessible drawer. Closing it returns to the conversation.

Threads, their conversations, and where they sit (active, settled, snoozed, or woken) are stored per user, so a reload keeps them; a snooze whose time passed while the workspace was closed shows as woken when it opens. Skill activation and the source panel width persist in browser storage. These are fictional, bundled sample records: no enterprise APIs are called, no external systems are changed, and responses are deterministic summaries, risk lists, or next steps derived from the selected records. Other prompts show an explanatory sample-summary fallback. The model and permission controls are demo preferences. File attachments are held in the browser and only their names are added to a thread; files are not uploaded, parsed, or used in responses. Fetches and saved sessions are future integration work.

### Settle, snooze, and preview sessions

1. Hover a session or focus it with the keyboard. The card reveals its full title, project, source, and the exact tickets, pages, or items selected for that conversation. New session titles retain the complete prompt; only the sidebar presentation is cropped. Use the info button to open the same details in a dialog, including on touch devices.
2. Choose **Settle** to move a session into the **Settled** shelf. Settling the open session advances to the next active session within the sidebar filters, or a new thread when none remain. **Undo** is available for eight seconds. Expand the shelf to reopen a session or use **Un-settle** to return it to the active list.
3. Use the clock button to snooze for **1 minute**, **1 hour**, **Tomorrow at 09:00**, or **Next week on Monday at 09:00**, in the browser’s local time. **Custom…** accepts a future local date/time or a duration in minutes. Snoozing is unavailable while a response is being prepared.
4. Expand **Snoozed** to see return times or wake a session manually. Sessions return automatically at their deadlines with a **Woke** indicator, without changing the open conversation. Returning to an inactive tab also checks overdue sessions. The one-minute option makes this easy to demonstrate.

Both shelves respect project filtering and thread search. Search reveals matching parked sessions automatically. Reading a parked session leaves its placement intact; sending a follow-up returns it to active. Source scope, conversation content, and applied skills remain intact throughout.

### Try skills

The source picker and record scope sit above the composer. **Choose a skill** sits beneath it on the left, opposite **Full access**, in both new threads and ongoing sessions.

1. Choose Jira, then open **Choose a skill** and select **Risk review**. The hint and example prompt describe the selected skill. Sending any prompt now shows the recorded risks with citations.
2. Open **Manage skills** from the picker, or open **Workspace settings → Skills**. Search the catalog, inspect each skill’s instructions, and activate **Action plan**. Changes save automatically in this browser and appear in the picker immediately.
3. Choose **Action plan** and send a follow-up. The sample response lists the selected records’ next steps. **Summary** produces the status overview. All three skills work across Jira, Confluence, and Codebeamer sample records.
4. Choose **No skill** to let the prompt determine the sample response. Deactivating a selected skill returns the composer to this behavior. Past responses retain the skill they used, including in forks.

Summary and Risk review start active; Action plan starts inactive so the activation flow can be tried. Skill selections are captured per message. These bundled skills choose prepared sample response formats; this prototype does not install or execute external skills.

### UI approach

Make the source and selected record count visible before sending. Once a thread starts, preserve that scope and keep the source snapshot beside the conversation. Citations connect answers to individual records, while source-specific labels and layouts make Jira tickets, Confluence pages, and Codebeamer items recognizable. Choosing a different source from an active session starts a new thread.

On desktop, drag the source panel’s left edge to resize it. The width is remembered in this browser and adjusts to leave room for the conversation. Focus the divider and use Left/Right (Shift for larger steps), Home/End for the limits, or double-click to reset. Narrow screens use a drawer. Panel surfaces, borders, and text follow T3 Code’s neutral GitHub panel styling; record statuses retain their semantic colors.

## Project structure

[ARCHITECTURE.md](ARCHITECTURE.md) records the structural decisions and what enforces each.
Paths below are relative to `src/`, which `@/` points to.

```
app/
  layout.tsx                    root layout, fonts, metadata, globals.css
  (workspace)/
    page.tsx                    server component: reads every catalogue, renders the shell
    layout.tsx, workspace.css   the workspace styles
    _components/                shell, sidebar, settings and new-thread heading (this route only)
  api/
    threads/[id]/messages/      GET loads a thread's conversation, POST streams the next answer
    sign-in/, sign-out/         start the Keycloak sign-in and end the session
    auth/[...all]/              Better Auth's endpoints (the Keycloak callback)
modules/
  agent/                        the runtime AI: models, instructions, tools, the agent loop
  threads/                      conversations: settle, snooze, wake, fork, the chat UI
  sources/                      Jira, Confluence and Codebeamer sample records, picker, explorer
  skills/                       skill catalogue (catalog/<id>/SKILL.md), picker, settings, activation
  projects/                     project list, add-project form, sidebar filter
components/ui/                  shadcn primitives, the html_render frame, other feature-agnostic UI
lib/                            `cn`, the html_render helpers shared by server and browser
tests/                          test factories and support
```

A module is reached from outside only through `index.ts` (browser-safe) or `server.ts`
(server-only); ESLint refuses any deeper import. Inside, `contracts.ts` holds types and input
schemas, `queries.ts` the reads, `actions.ts` the server actions and `components/` the browser
UI. `threads` still has its older layers (`domain/`, `application/`, `infra/`); its
`application/answer-thread.ts` is the use case behind `POST /api/threads/[id]/messages`, and it
hands the conversation to `runAgent` (`agent/run.ts`). See "Module shape" in ARCHITECTURE.md.

```sh
pnpm lint          # ESLint, design tokens (scripts/check-styles.mjs), server actions (scripts/check-actions.mjs)
pnpm typecheck     # route types, then tsc
pnpm test          # unit tests, plus integration tests when the stack runs (pnpm stack:up)
```

Add shadcn components with:

```sh
pnpm exec shadcn add card input
```

## Reference

The reference screen lives in [T3 Code's web app](https://github.com/pingdotgg/t3code/tree/main/apps/web), specifically `components/chat/DraftHeroProjectHeading.tsx`, `ChatComposer.tsx`, `ChatHeader.tsx`, and `components/Sidebar.tsx`. Session lifecycle and previews follow `components/sidebar/SidebarThreadRow.tsx`, `Sidebar.snooze.ts`, `CustomSnoozeDialog.tsx`, and `ThreadHoverCard.tsx`, adapted to enterprise source records. The desktop app provides the Electron shell around the web UI. The appearance is adapted into standalone Next.js components, without the T3 runtime or backend dependencies.

Provider and Linux icons are adapted under the MIT license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
