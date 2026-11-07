# Glossary

The project's ubiquitous language. Each term has one meaning, and the code, the UI and the docs
use the same word. A term belongs to the module that owns it; other modules use it as it is
written here. **When you add or rename a domain term, change this file in the same change.**
`ARCHITECTURE.md` records how things are built. This file records what the words mean.

Format: **Term** (`name in code`): meaning.

## Modules

| Module | Owns |
| --- | --- |
| `threads` | Conversations with the agent and where each sits in the sidebar. The core domain. |
| `agent` | The runtime AI: models, instructions, tools and the loop that answers a message. |
| `sources` | What a user can ground a thread in: sources, their records, a thread's scope. Read-only. |
| `integrations` | The external systems the workspace connects to, and each user's connections to them. A leaf: it imports no other module. |
| `skills` | The skill catalogue and which skills are switched on in this browser. |
| `projects` | The user's projects, which group threads, and the sidebar's project filter. |

`app/(workspace)/` composes the modules into one page. Modules refer to each other's data by id.

## Shared

- **User** (`User`, `UserId`): the signed-in Keycloak user. Their id is the Keycloak `sub`.
  Everything stored is owned by one user, and nothing is shared between users.
- **Workspace**: the app as a whole, a single page for one user.
- **Shell** (`workspace-shell.tsx`): the workspace's frame: the sidebar, the header, the open
  thread and the source panel. It's a layout, not data.
- **Sidebar** (`workspace-sidebar.tsx`): the thread list, grouped by shelf, with search and the
  project filter.
- **Composer** (`PromptForm`): where the user writes a message and picks a source and scope, a
  model and a skill.
- **Action** (`action(…)`, `<name>Action`): a write the browser calls. It answers with a `Result`
  and never throws.
- **Standard errors** (`lib/errors.ts`, `lib/actions/`): `NotFound`, `Conflict`,
  `ValidationFailed`, `SignedOut`, `Unexpected`, and `Unreachable` in the browser. A module's own
  errors are named for the rule they break (`SnoozeTimeInPast`).

## threads

- **Thread** (`Thread`, `threads`): one user's conversation with the agent, together with its
  title, optional project, scope and placement. It's what the user starts, continues, forks,
  settles and snoozes. Say "thread", never "chat", for this.
- **Conversation** (`thread_messages`): a thread's messages in order. It's stored on the server,
  and the browser sends only the latest message.
- **Message** (`WorkspaceUIMessage`): one entry of a conversation, with the role `user`,
  `assistant` or `system`. It's stored as the AI SDK's `UIMessage`, one row each.
- **Question**: a user message.
- **Response**: an assistant message. Only a response can be forked from or regenerated
  (`ResponseTurn`, `LiveResponse`, `responseIndex`).
- **Prompt** (`NewThread.prompt`): the text of a thread's first message. It becomes the title.
- **Working** (`isWorking`, `ThreadStillWorking`): a response is in flight. Only the browser
  knows, and it refuses a snooze while a thread is working.
- **Chat** (`Chat`, `ChatStore`): the AI SDK's browser session for one thread. It streams the
  response and holds the messages on the page. It's never stored. Its id is the thread's id, and
  there is no separate chat id. The word appears only where the SDK's `Chat` is in hand
  (`ChatStore`, `ChatOptions`, `ChatTurnDto`).
- **Chat turn** (`ChatTurnDto`): the body of `POST /api/threads/[id]/messages`, which carries
  the latest message plus the chat options.
- **Start** (`startThread`, `startThreadAction`): create a thread from its first message. The
  browser picks the id.
- **Continue** (`continueThread`, `answerThread`): ask again in a thread. A parked thread returns
  to active, and the thread records the model provider it now talks to.
- **Regenerate** (`ChatStore.retry`, `withLatestMessage`): send the last question again. The new
  response replaces the old one.
- **Fork** (`forkThread`, `forkPoint`, `forkedFrom`): an independent new thread with the
  conversation through one response, and the same project and scope. Its origin is a snapshot,
  not a live reference. Its title is "Fork: …".
- **Scope** (`ThreadScope`; `RecordScope` in `sources`): the records of one source a thread
  uses, held by id. A scope names at least one record. Attaching records sets it.
- **Placement** (`ThreadPlacement`, `placeThreadAction`): where a thread sits in the sidebar. A
  thread is active, settled, snoozed or woken, and at most one timestamp is set. The server
  applies a change with its own clock.
- **Shelf** (`ThreadShelf`, `shelfOf`): the sidebar group a placement puts a thread in:
  `active`, `snoozed` or `settled`. A woken thread shelves as active.
- **Active**: no placement set. This is the default.
- **Parked**: settled or snoozed.
- **Settle** (`settle`): mark a thread as done for now. "Un-settle" is a restore.
- **Snooze** (`snooze`, `SnoozePreset`, `customSnoozeTime`): park a thread until a time in the
  future.
- **Wake** (`wake`, `wakeIfDue`): a snooze whose time has come returns the thread to active,
  marked as **woken** (`wokeAt`). Nothing runs at the deadline: the thread reads as woken when it
  is next read.
- **Acknowledge wake** (`acknowledgeWake`): opening a woken thread clears its "Woke" mark.
- **Restore** (`restore`): un-settle or wake a thread by hand.
- **Return** (`withPlacement`, change `return`): an undo that puts back the placement the
  browser saw before.
- **Branch** (`Thread.branch`): shown on the thread row. It is always `main` today.

## agent

- **Agent** (`runAgent`): the runtime AI that answers a message. It's an AI SDK tool loop on the
  Vercel AI Gateway, with at most 5 steps.
- **Model** (`AgentModel`, `ModelChoice`, `models.ts`): one entry of the allowlist. The browser
  sends only its id, and the server resolves the gateway id.
- **Model provider** (`ModelProvider`: `claude` | `openai`): the vendor behind a model, which a
  thread records. This is not an integration's provider.
- **Chat options** (`ChatOptions`): the ids sent with every message: the model, the picked
  skill, the switched-on skills and the scope.
- **Agent context** (`AgentContext`, `resolveContext`): what one answer runs with, resolved on
  the server from the chat options: the user, the model, the picked skill, the offered skills
  and the attached records. An unknown id is a `NotFound`.
- **Instructions** (`instructions/*.md`, `instructions.ts`): the system prompt. It holds the
  workspace's instructions, then the picked skill, the offered skills and the attached records.
- **Tool** (`tools`, `toolsFor`, `WorkspaceUITools`): a function the model may call. It lives in
  the module it acts on, and its context comes from the server, never from the model. Its name is
  permanent, because stored conversations hold it. The current tools are `html_render` (agent),
  `search_records` (sources) and `load_skill` (skills).
- **Tool card** (`RecordSearchCall`, `SkillLoadCall`): how a tool call shows in the conversation.

## sources

- **Source** (`Source`): a collection of records in one of the user's connections, such as a
  Jira project, a Confluence space or a GitHub repository. Its id is
  `<connectionId>:<sourceKey>` (`sourceIdOf`), and threads store that id.
- **Source key** (`SourceRef.sourceKey`, `SourceSummary.key`): the source's id within its
  connection, as the provider names it.
- **Record** (`SourceRecord`): one item of a source, such as a ticket, a page or a test case. The
  type is `SourceRecord` because TypeScript already has a `Record`.
- **Record status** (`RecordStatus`): the provider's status mapped onto the workspace's four:
  To do, In progress, In review, Done.
- **Attach**: put records of a source into a thread's scope. A new thread attaches all of a
  source's records unless the user picks fewer. The records a thread holds are its
  **attached records** (`AttachedRecords`).
- **Source session** (`data-session="source"`): a thread with a scope, which gets the denser
  layout. A thread without one is `plain`.
- **Source explorer** (`SourceExplorer`) and **source panel** (`ResizableSourcePanel`): the panel
  that shows the attached records as a list, a board or a single record.

## integrations

- **Provider** (`Provider`, `defineProvider`, `providers/<id>/`): a system the workspace connects
  to. Today these are `sample` and `github`; Atlassian, codebeamer, PostHog, Stripe and Supabase
  are planned. A provider is code, not rows. This is not a model provider.
- **Product** (`ProductPresentation`): one of a provider's products (Jira, Confluence). It gives
  its sources their icon, nouns and views.
- **Connection** (`Connection`, `connections`): one user's link to one account of a provider at
  one base URL. It never holds a secret.
- **Sample connection** (`builtIn`): the built-in connection to sample data. Every user has it,
  and it is never stored.
- **Connect**, **test**, **disconnect** (`connectAction`, `testConnectionAction`,
  `disconnectAction`): verify and store a connection, check it again, or delete it.
- **Auth method** (`AuthMethod`: `none` | `token` | `basic`): how a user connects to a provider.
- **Credential** (`Credential`): what the user enters to connect. Only the vault keeps it,
  encrypted.
- **Verify** (`verify`, `VerifiedAccount`): ask the provider whether a credential works and whose
  account it belongs to.
- **Needs reconnect** (`ConnectionStatus`): the provider refused a stored credential.
- **Scopes** (`Connection.scopes`): the permissions the provider reports for a credential. These
  are not a thread's scope.
- **Vault** (`vault.ts`, `connection_secrets`): the only reader and writer of credentials.
- **Access** (`ProviderAccess`, `ConnectionAccess`): a base URL and an `Authorization` header,
  built per request. It's the only form in which a credential leaves the vault.
- **Record reader** (`RecordReader`): a provider's code that lists its sources and reads their
  records.

## skills

- **Skill** (`Skill`, `catalog/<id>/SKILL.md`): instructions a user can apply to a message, such
  as "Risk review". Its id is its folder name.
- **Catalogue** (`catalog.ts`): every skill. It's shared by all users and bundled with the server code.
- **Switched on** (`useSkillPreferences`, `toggleSkill`, `activeSkills`, `enabledByDefault`): the
  skills this browser offers the agent. The setting lives in `localStorage`. In code it's also
  called active or enabled.
- **Picked skill** (`skillId`): the skill chosen for one message. It goes into the prompt in
  full.
- **Offered skills** (`offeredSkills`): the switched-on skills besides the picked one. They're
  listed by name, and the model loads one with `load_skill`.

## projects

- **Project** (`Project`, `projects`): a named group of a user's threads. Names are unique per
  user. A thread has at most one project, and a thread without one is listed under "No project".
- **Project filter** (`ProjectFilter`): the sidebar filter that narrows threads to the chosen
  projects.

## Words with two meanings

| Word | Here it means | Not |
| --- | --- | --- |
| thread / chat | Thread: the stored conversation. Chat: the AI SDK's browser session for it. | Our domain is never "chat". |
| provider | Integration provider (`Provider`) or model provider (`ModelProvider`). Always qualify the word outside its module. | — |
| scope | A thread's records (`ThreadScope`). | A credential's `scopes`. |
| session | The sign-in session (Better Auth), or a source session (layout). | — |
| shell | The workspace's page frame. | t3code's `ThreadShell`, a thread summary. |
| workspace | The app. | `Source.workspace`, the provider's workspace name. |
