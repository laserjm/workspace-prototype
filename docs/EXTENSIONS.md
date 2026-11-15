# Extensions

What this app decided at the conventions' extension points (`docs/CONVENTIONS.md`, Extension
points). The conventions leave these seams to the app. An entry here departs from nothing, so it
needs no ADR. A rollout of the conventions never overwrites this file.

An entry says what was decided, where it lives in the code and, in a line, why. Change an entry
when the decision changes, in the same pull request as the code.

## E1. Boundaries of the project's own

The blocks in `eslint.project.mjs`. ARCHITECTURE.md gives the reasons.

- `integrations` is a leaf: it imports no other module. `records` builds on `integrations` alone
  ("Modules").
- A provider folder under `modules/integrations/providers/` imports no other provider (ADR 0006).
- Only `integrations`' `repo.ts` and `commands.ts` (and their tests and `test/factories.ts`)
  import `lib/db/vault.ts`. Only `lib/db/vault.ts` reads `connectionSecretsTable` ("Connection
  credentials live in the vault").
- Only `lib/auth/` imports `better-auth` ("Sign-in").

## E4. Naming additions

Component roles NAMING.md lacks. Before 0.9.0 this was ADR 0008.

| Role | What it is | Examples |
| ---- | ---------- | -------- |
| `Mark` | A glyph chosen from data (a provider, a record kind); `Icon` is a fixed one | `ProviderMark` |
| `Call` | A tool call's part in a message: its input, state and output | `RecordSearchCall`, `SkillLoadCall` |
| `Document` | The page an `html_render` iframe (`Frame`) runs | `HtmlRenderDocument` |
| `Note` | Inside a record view, a quiet line under a list | `GithubNote`, `GithubMoreNote` |

## E8. Exhaustive error mapping

- `threads`, `integrations` and `agent`: each `errors.ts` exports its list, union and guard
  (`threadErrors`, `integrationErrors`, `agentErrors`, and so on). `threads/index.ts` re-exports
  its own and the agent's, since a thread's answer runs the agent. `integrations/index.ts`
  re-exports its own.
- `app/(workspace)/refusals.ts` serves the workspace's actions (`connectionRefusal`,
  `threadRefusal`). `app/api/threads/[id]/messages/refusals.ts` serves the messages route
  (`threadRefusal`, `agentRefusal`, `thrownResponse`). Each has a `refusals.test.ts`, and
  `test/errors.test.ts` checks the lists.
- The actions are called from client state (ADR 0004), so no refusal answers with the not-found
  page. Something the action named that no longer exists answers `{ error, gone: true }`, and the
  browser drops it.
- Why: adopted when 0.7.0 made it the default, and kept. A new error class fails to compile until
  every adapter answers it.
