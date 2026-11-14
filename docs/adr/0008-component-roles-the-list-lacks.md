# ADR 0008: Component roles the naming list lacks

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser

## Context

NAMING.md names a component `<Noun><Role>`, with the role from a fixed list (`List`, `Table`,
`Card`, `Row`, `Form`, `Dialog`, `Sheet`, `Panel`, `Badge`, `Summary`, `Picker`, `Select`,
`Filters`, `Toolbar`, `Empty`, `Provider`, or a shadcn component's name), and says to extend the
list rather than invent a role. The workspace is a chat with tool calls, record views and rendered
model output, and about half its components play a part the list has no word for: a provider's
mark, a record's chip in the composer, the body of a record view, a tool call's part in a message,
the sandboxed frame an `html_render` page runs in, the page's shell.

Extending the list is a change to the conventions, made in `laserjm/conventions` and rolled out;
until then this app needs names now.

## Options

### Option 0: Force every component onto a listed role

`ProviderMark` → `ProviderBadge`, `RecordChip` → `RecordBadge`, `IssueView` → `IssuePanel`,
`RecordSearchCall` → `RecordSearchCard`, `HtmlRenderFrame` → `HtmlRenderPanel`.

- ✅ The list as it is.
- ❌ The names say something false: a mark is not a badge, a view's body sits inside the record
  panel and is not one, a tool call's part is not a card on its own. A reader searching for "the
  thing that renders a search_records call" finds `…Card` among real cards.

### Option A: Rename where a listed role fits; use a few more roles for the rest

Rename what a listed role describes truly, and use these roles for the rest, each meaning one
thing:

| Role | What it is | Examples |
| ---- | ---------- | -------- |
| `Icon`, `Mark` | A glyph: `Icon` a fixed one, `Mark` one chosen from data (provider, record kind) | `SkillIcon`, `ProviderMark` |
| `Chip` | A compact, removable or clickable token for one thing in a composer or a sentence | `RecordChip`, `AttachedItemChip` |
| `View` | A record view's body, which the record panel frames | `GithubIssueView`, `RecordViewBody`'s `View` |
| `Call` | A tool call's part in a message: its input, state and output | `RecordSearchCall`, `SkillLoadCall` |
| `Frame`, `Document` | The sandboxed iframe an `html_render` page runs in, and the page | `HtmlRenderFrame`, `HtmlRenderDocument` |
| `Shell` | The page's outermost layout, holding sidebar, main area and dialogs | `WorkspaceShell` |
| `Section`, `Note` | Inside a record view: a titled part, and a quiet line under a list | `GithubSection`, `GithubMoreNote` |
| Content | A renderer of one kind of content, named for it alone | `Markdown`, `MathFormula`, `MermaidDiagram`, `CodeBlock` |

- ✅ Each name says what the component is; the extra roles are few and each means one thing.
- ❌ Two lists to know until the conventions take these roles or reject them.

## Decision

**Option A.** Why: Developer experience. A name is how a reader finds a component, and Option 0's
names would mislead. The roles above are raised as a conventions challenge, so the home
repository decides whether every project gets them.

## Consequences

- Renamed to listed roles (shadcn's `Item` and `DropdownMenu` included): `ThreadMessages` →
  `ThreadMessageList`, `MessageParts` → `MessagePartList`, `ThreadConversation` →
  `ThreadPanel`, `NewThreadHeading` → `NewThreadEmpty`, `CopyMenu` → `CopyDropdownMenu`,
  `WorkspaceSettings` → `SettingsPanel`, `ResponseTurn` → `ResponseItem`, `LiveResponse` →
  `LiveResponseItem`, `IssueView` → `GithubIssueView`, `PullRequestView` →
  `GithubPullRequestView`.
- The GitHub views' shared pieces (`github-view-parts.tsx`) carry the provider as their noun and a
  role: `GithubOpenedRow`, `GithubBylineRow`, `GithubCard`, `GithubCommentList`, `GithubSection`,
  `GithubNote`, `GithubMoreNote`, and `GithubDescription` as a content renderer.
- Departs from NAMING.md, the role list, by the roles in the table.
- Enforced by review.

## Reversing this decision

If the conventions take other words for these roles, rename to them; if they reject one, rename its
components to the nearest listed role. Each rename is a file and an identifier, no behaviour.
