# 0003. Attached items and record views

- **Status:** Accepted (2026-11-13); being implemented (attached items, the record panel and
  the issue view so far). Replaces the records, scope and panel parts of ADR 0002:
  - the "Source" vocabulary and the products;
  - §1's exception for type-only imports into `integrations`;
  - §2's `RecordReader` and `ExternalRecord`;
  - §4 (sources as views of connections) and §7's sources records route;
  - §5's record tools;
  - §6's source picker, thread context card and sample connection;
  - decision drivers 3 (the thread's scope decides) and 5 (works without accounts), and decision
    4 (grants per thread);
  - the provider author's "at most three files";
  - phase 5's Atlassian provider, which becomes `confluence` (and a separate Jira provider).

  It also reverses two decisions, below. The rest of ADR 0002 stands.
- **Date:** 2026-11-13
- **Deciders:** Michael Laser
- **Related:** `docs/adr/0002-integrations.md` (partly superseded by this ADR); `GLOSSARY.md`;
  the spec #53 and the map #36, whose closed tickets (#37–#47, #49–#51) hold the detail;
  `ARCHITECTURE.md` (Modules, Cross-module references are ids, Agent tools live in their module,
  Integrations are provider folders).

## Context

ADR 0002 planned GitHub records as **sources**: a repository inside a connection, browsed in a
generic explorer and fixed to a thread as its scope (one source, a list of record ids). The
attached records were written into the system prompt, and a built-in sample provider kept the
prototype working without accounts.

Working the first real provider through that plan showed four problems:

- **A thread is pinned to one source when it starts.** A later question can't bring in a
  different issue, but people ask about the record in front of them, question by question.
- **Real issue bodies are untrusted.** Writing them into the system prompt lets an issue author
  instruct the agent.
- **One fixed record shape fits nothing well.** A pull request needs its reviews, changed files
  and CI next to its description; a page needs its comments and none of that.
- **The sample provider is a second code path.** It needs `auth: none`, a virtual connection
  and a vault bypass, and it hides what a real provider has to answer.

The vocabulary is `GLOSSARY.md`: **Provider**, **Connection**, **Record**, **Attached item**,
**Attached connection**, **Record view**, **View kind** and **Pinned view**. **Source** is
dropped. "Data source" appears only in end-user copy.

## Decision

### 1. Attached items live on the message, as a focus and not a fence

- The user attaches records to the **message** that asks about them, the way they attach files.
  An attached item is `{ connectionId, type, key }`: the connection's id, the provider's record
  type (`issue`, `pull-request`) and an opaque key the provider defines and parses
  (`acme/web#482`). No URL and no repository field are stored; the provider builds the URL from
  the connection's base URL and the key.
- Each item carries a snapshot `{ label, title, state }` as of attaching, so a chip draws without
  a fetch. The server never verifies it, and a record view always shows live data.
- The carrier is one data part on the user message, `data-attached-items`, grouped by
  connection. A connection with `items: []` is an **attached connection** with no items: the user
  asks about it as a whole. At most 10 items and 5 connections go on one message. The part name is
  permanent, like a tool name.
- A thread's attached items are a pure function over its messages, in order, deduplicated by
  `(connectionId, type, key)`. There is no thread scope: `threads.source_id`,
  `threads.record_ids` and `chatOptionsSchema.scope` go, with nothing in their place.
- **A focus, not a fence.** The attached items tell the agent what the question is about. They
  don't limit what it may read. The agent may use any connection the thread has attached, on any
  of its messages, including one attached with zero items.
- **The server decides which connections are allowed, never the model.** The allowed connections
  are the union of the thread's attached connections, intersected with the user's current
  connections, minus those that need reconnecting. A connection that isn't the user's is refused
  on a new message and skipped on a stored one (so Try again still answers).
- **The model sees references, never bodies.** The data part becomes an `<attached_items>` block
  of reference lines in the user message. Bodies, comments, reviews and diffs reach the model only
  as tool results. The system prompt holds only server-written text: a fixed paragraph about
  attached items, the allowed connections and each one's provider guide. Sending a message fetches
  nothing.

Rejected: inlining the new question's bodies when it is sent, and inlining every body on every
turn (up to 50 requests a send, and untrusted text in the prompt).

### 2. `records` is the provider-neutral home; `integrations` is a strict leaf

- `sources` is renamed **`records`**. It owns the attached-item model and its prompt text, the
  allowed connections, the attach dialog and its chips, the record panel with its pinned view, the
  frame every record view shares, and the tools every provider answers.
- The module graph is `threads → agent, records, skills, projects`; `agent → records, skills`;
  `records → integrations`; `integrations → nothing`.
- `integrations` becomes a **strict leaf**: it imports no other module, not even types. ADR 0002
  let it import the record shape from `sources` as types; that goes, because `integrations` now
  owns the record vocabulary (`RecordSummary`, `RecordError`, the tone set, the declared types and
  states).
- Two ESLint `no-restricted-imports` blocks enforce it: nothing under `integrations` imports
  `@/modules/*`, and `records` imports only `@/modules/integrations` and
  `@/modules/integrations/server`.
- A record view's frame (kind mark, where, state badge, title, pin, refresh, open, close) belongs
  to `records`. Its body belongs to the provider. So `integrations` never needs `records`.

### 3. Providers declare their record types, states, tones and filters

- A provider's manifest declares `records`: one entry per record type, with a singular and a
  plural label and its states. Each state has a label and a **tone**. It also declares which
  dialog filters its search supports, its search function and one detail reader per type.
- **Tones** are a fixed set: `open`, `draft`, `done`, `closed`, `neutral`. An unknown state draws
  `neutral`, so an old snapshot never breaks. GitHub's states are `open`, `draft`, `merged`,
  `closed` and `not_planned`.
- **Dialog filters** come from a fixed, generic set, `type` and `includeClosed`. A provider says
  which it supports; it declares no filter schema of its own. The type toggle also hides when only
  one type is declared.
- The **view kind** is derived, `${provider}.${type}-view` (`github.pull-request-view`), never
  declared, so the names can't drift.
- Each provider's `views/` maps its types to `{ view, icon }`: a lazy, body-only view and the
  type's kind mark. The provider icon is keyed on the provider id. A registry test fails when a
  declared type has no reader, view or icon, or a view has no declared type.
- Detail shapes belong to the provider (`GithubIssueDetail`, `GithubPullRequestDetail`, each
  with a zod schema). There is no generic detail type and no `ExternalRecord`.
- Errors are a shared union, `RecordError`: `not_found`, `no_access`, `needs_reconnect`,
  `rate_limited { retryAt }`, `unreachable`, `invalid_query { message }`. Providers return it as a
  result and never throw; each provider owns its classifier.
- Search pages by an **opaque cursor**. The provider encodes its own paging in it.
- A provider folder holds `index.ts` (the manifest), `api.ts`, `records.ts` (search, detail
  readers, detail types and the model trimming), `views/`, an optional `guide.md` and an optional
  `tools.ts`. This replaces ADR 0002's "at most three files". Adding a provider is still its
  folder plus one line in the provider registry and one in the view registry.

### 4. Native tools over REST

- Tools every provider answers live in `records` and dispatch to the provider's search and
  readers, the same code the dialog and the record views use:
  `search_records({ connectionId, query, type?, includeClosed? })` and
  `read_record({ connectionId, type, key })`.
- Tools only one provider has live in its folder, prefixed with its id, gathered as
  `integrationTools`: `github_pull_request_diff({ connectionId, key, path? })`.
- The shared tools are offered while at least one connection is allowed, and a provider's own
  tools while one of its connections is. Every call checks `connectionId` against the server-filled
  context and answers `no_access` outside it.
- Each provider trims its detail for the model next to its readers, with limits kept in one place
  (bodies 8,000 characters; the newest 30 comments at 2,000 each; diffs 4,000 per file and 40,000
  in total; 20 search results). Every cut says what was cut. Errors come back as `RecordError`,
  as data.
- The old `search_records` keeps no stub. Its name is reused with the new schema, and the database
  is reset with or before the change. The rule "a removed tool keeps a stub" stays for later
  removals.

### 5. Tests run the real GitHub provider on recorded answers; no sample provider

- The sample provider goes, with `builtIn`, `auth: { kind: "none" }`, the sample connection at
  the head of `listConnections`, the vault bypass in `accessFor` and `INTEGRATIONS_SAMPLE`. A new
  user connects GitHub to get started.
- Every test that reaches GitHub runs the **real** provider. Only `fetch` is answered, from plain
  GitHub JSON captured once with `gh api` from a small public sandbox repository; an unlisted
  request fails the test and names it. Error answers are written inline.
- There is no live test, no record mode and no CI secret. Capturing the fixtures is a human
  checklist step.

This replaces ADR 0002's driver 5 ("the prototype keeps working without accounts"). The cost: no
demo without a GitHub token, and the fixtures go stale until someone captures them again. In
return the tests exercise the query building, parsing and error classifier that users hit.

## Two reversals of ADR 0002

### The Confluence provider's id is `confluence`, not `atlassian`

ADR 0002 named the provider `atlassian`, because one Atlassian grant covers Jira and Confluence,
and gave it two **products**. This design has no products, and the view kind is the provider plus
the type. A provider called `atlassian` would yield `atlassian.page-view`, which names neither the
system nor the glossary's `confluence.page-view`. So the provider is `confluence`, in
`providers/confluence/`.

**Cost:** a future Jira provider is a **separate connection**. The user enters the same email and
token again, or gives one consent per provider under OAuth in phase 5. A shared Atlassian helper
can come with Jira.

Rejected: `atlassian` with each type declaring a product that names the view kind, which brings
products back; and an `atlassian.page-view` kind.

### Native REST tools, not GitHub's MCP server, for the first slice

ADR 0002's rule was "MCP when the vendor offers a server", with GitHub's read-only MCP tools as
its vendor tools. For the first slice the tools are native, over REST, and phases 3 and 4 stay
apart. The reasons (#38, #44):

- **Cheaper per step.** GitHub's tool definitions cost about 3.5k–9k tokens on every step, plus
  round trips before the first one. Three native tools cost a fraction of that.
- **Output we can cap.** The MCP server has no overall cap (raw diffs, files up to 1 MB inline).
  Native tools trim next to the readers and say what they cut.
- **The readers exist anyway.** The record views need REST readers, so a tool and a view read a
  record the same way.

**Cost:** open-ended exploration (code search, file contents, commits, branches) waits. GitHub's
MCP tools, with their allowlist, grants, toggles and the generic `IntegrationToolCall` card, stay
with **phase 4**. ADR 0002's rule still holds for phase 4 and for vendors without records.

## What stays from ADR 0002

The `integrations` module with one folder per provider, `defineProvider` and the explicit
registry; per-user connections; credentials in our own encrypted table, read only by the vault,
on the `INTEGRATION_KEYS` keyring; `accessFor` and `ConnectionAccess`; verify on save; tool
context from the server, never the model; read-only first; and the phases, with phase 3 now meaning
this design.

## Checked against a second provider

The design was walked through Confluence (`confluence.page-view`) to test that a second provider
needs no special cases (#50). It does, once four generic contracts change. None of them mentions
Confluence in code, and **no Confluence provider is built**.

1. **The provider id is the system's**, `confluence`, not `atlassian` (the reversal above).
2. **Paging by an opaque cursor.** The search route takes `?cursor=` and answers `next?`;
   `total` is optional. GitHub encodes its page number as the cursor; Confluence would pass its
   `_links.next` through.
3. **`RecordError` gains `invalid_query { message }`.** A malformed query is a 422 from GitHub and
   a 400 from Confluence. The dialog never produces one, because the server builds and escapes its
   query. The tool returns it as data, so the model fixes the query and tries again.
4. **Declared filters, type labels and icons.** Dialog filters come from the fixed set (`type`,
   `includeClosed`), and each provider declares which it supports; Confluence declares neither, so
   its dialog has no toggles, and a space is narrowed by typing its key or name. Each type carries
   a singular and a plural label, from which the dialog builds its title ("Attach issues and pull
   requests", "Attach pages") and its type toggle. Each type's icon sits beside its view, and the
   provider icon is keyed on the provider id. Rejected: a filter schema each provider defines and
   the dialog renders.

Everything else held unchanged: the reference `{ connectionId, type: "page", key: <page id> }`,
its snapshot (the space key as label), the tone set (`current` → `neutral`, `archived` and
`trashed` → `closed`), one detail reader per type, the trimming next to it, the shared tools with
the provider's own query language (CQL), and the provider guide as the home for what needs
interpreting.

The Confluence folder would be:

```
src/modules/integrations/providers/confluence/
  index.ts      # manifest: email + unscoped API token (Basic), the site as base URL,
                # verify via /wiki/rest/api/user/current, type `page` and its states
  api.ts        # fetch + zod: the v2 page with its export_view body, the space,
                # footer and inline comments, users-bulk
  records.ts    # CQL search, the page reader (export_view HTML to Markdown),
                # the model trimming, the classifier
  views/
    page.tsx    # body only: the page and its root comments
    index.ts    # page → { view, icon }
  guide.md      # CQL, what the export view loses, footer versus inline comments
```

The only change outside the folder is one line in `providers.ts` and one in
`integrations/record-views.ts`.
