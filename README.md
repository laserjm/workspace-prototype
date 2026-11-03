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

The initial screen recreates the T3 Code reference: a thread sidebar, project breadcrumb, centered new-thread composer, and project actions card. It supports sidebar search and filters, project creation and selection, local thread navigation, model and permission selection, file attachment previews, and saved project-script definitions.

All state is kept in memory for the current session. Refreshing resets it. File attachments are held in the browser and only their names are added to a draft; files are not uploaded or parsed. The model names and permission options are demo selections, with no AI requests or tool execution. The data-source catalog and desktop/Git actions are placeholders for the next implementation step.

## Project structure

- `src/app/page.tsx`: page entry point.
- `src/app/layout.tsx`: root layout, fonts, and metadata.
- `src/app/globals.css`: Tailwind imports and shadcn theme tokens.
- `src/components/workspace/`: screen, sidebar, composer, demo data, and scoped workspace styles.
- `src/components/ui/`: shadcn Button, Dialog, Dropdown Menu, and Tooltip components.
- `components.json`: shadcn configuration, using the Base UI Nova style.

Imports use the `@/*` alias for `src/*`. Add components with:

```sh
pnpm exec shadcn add card input
```

## Reference

The reference screen lives in [T3 Code's web app](https://github.com/pingdotgg/t3code/tree/main/apps/web), specifically `components/chat/DraftHeroProjectHeading.tsx`, `ChatComposer.tsx`, `ChatHeader.tsx`, and `components/Sidebar.tsx`. The desktop app provides the Electron shell around the web UI. The appearance is adapted into standalone Next.js components, without the T3 runtime or backend dependencies.

Provider and Linux icons are adapted under the MIT license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
