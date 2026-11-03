# Workspace Prototype

A connected-workspace prototype built with Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui.

## Development

Use Node.js 20.9 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000).

## Checks and production

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

## Workspace screen

The screen adapts the T3 Code shell into an enterprise workspace: a thread sidebar, project breadcrumb, a compact source picker, and a centered new-thread composer. It supports sidebar search and filters, project creation and selection, local thread navigation, model and permission selection, and file attachment previews.

### Try the enterprise-source flow

1. Open **Choose a source** beneath the new-thread composer and choose **Jira**. The source picker uses the same compact style as the **Full access** picker. The composer shows **Platform · Sprint 24 / 5 tickets**.
2. Click the scope strip to inspect the five sample tickets and change the selection. At least one record is required.
3. Click **Try it — Create a summary of these 5 tickets**, then send the message.
4. The session shows a sample summary beside a lightweight Jira explorer. Search, filter by status, switch to the grouped board view, or open a ticket to inspect its description, owner, priority, and next step.
5. Click a citation in the response to open that record in the explorer. Try **What are the risks?** or **What are the next steps?** as follow-ups.
6. Start another thread with **Confluence** (three sample pages) or **Codebeamer** (four sample requirements and test items). Each thread keeps its own record scope. The sidebar includes a ready-made session for each source.

Responses now follow T3 Code’s timing pattern: a live **Working for …** row settles into **Worked for …** (or **Continued for …** on a follow-up). Hover or focus the row to reveal its start time in HH:mm; click the chevron to inspect source and timing details. Hover the message body to reveal copy, fork, and completion time beneath it. Touch devices keep the controls visible. Fork creates an independent local thread containing the conversation through that response and preserves its source scope.

New sample responses have a short, measured 2.4-second preparation phase so the running timer can be exercised. Completed sample sessions have fixed fictional timestamps. Clipboard errors are reported beside the copy button.

On smaller screens, **View source** and citations open the explorer in an accessible drawer. Closing it returns to the conversation.

All state is kept in memory for the current session. Refreshing resets it. These are fictional, bundled sample records: no enterprise APIs are called, no external systems are changed, and responses are deterministic summaries, risk lists, or next steps derived from the selected records. Other prompts show an explanatory sample-summary fallback. The model and permission controls are demo preferences. File attachments are held in the browser and only their names are added to a thread; files are not uploaded, parsed, or used in responses. Live authentication, fetches, AI responses, and saved sessions are future integration work.

### UI approach

Make the source and selected record count visible before sending. Once a thread starts, preserve that scope and keep the source snapshot beside the conversation. Citations connect answers to individual records, while source-specific labels and layouts make Jira tickets, Confluence pages, and Codebeamer items recognizable. Choosing a different source from an active session starts a new thread.

On desktop, drag the source panel’s left edge to resize it. The width is remembered in this browser and adjusts to leave room for the conversation. Focus the divider and use Left/Right (Shift for larger steps), Home/End for the limits, or double-click to reset. Narrow screens use a drawer. Panel surfaces, borders, and text follow T3 Code’s neutral GitHub panel styling; record statuses retain their semantic colors.

## Project structure

- `src/app/page.tsx`: page entry point.
- `src/app/layout.tsx`: root layout, fonts, and metadata.
- `src/app/globals.css`: Tailwind imports and shadcn theme tokens.
- `src/components/workspace/`: screen, sidebar, composer, demo data, and scoped workspace styles.
- `source-data.ts`: source definitions, fictional enterprise records, and scope helpers.
- `source-picker.tsx`: compact source dropdown, catalog cards, and record selection dialog.
- `source-explorer.tsx`: source list, Jira grouped board, record details, and responsive drawer.
- `source-response.tsx`: deterministic sample responses with source citations.
- `src/components/ui/`: shadcn Button, Dialog, Dropdown Menu, and Tooltip components.
- `components.json`: shadcn configuration, using the Base UI Nova style.

Imports use the `@/*` alias for `src/*`. Add components with:

```sh
pnpm exec shadcn add card input
```

## Reference

The reference screen lives in [T3 Code's web app](https://github.com/pingdotgg/t3code/tree/main/apps/web), specifically `components/chat/DraftHeroProjectHeading.tsx`, `ChatComposer.tsx`, `ChatHeader.tsx`, and `components/Sidebar.tsx`. The desktop app provides the Electron shell around the web UI. The appearance is adapted into standalone Next.js components, without the T3 runtime or backend dependencies.

Provider and Linux icons are adapted under the MIT license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
