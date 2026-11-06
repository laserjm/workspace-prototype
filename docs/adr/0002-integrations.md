# 0002. Integrations: connected systems, credentials and their agent tools

- **Status:** Accepted (design and decisions, 2026-11-06); no phase implemented yet
- **Date:** 2026-11-05
- **Deciders:** Michael Laser
- **Related:** `ARCHITECTURE.md` (Modules, Data ownership, Cross-module references are ids, Agent
  tools live in their module, Answers come from the Vercel AI Gateway, Sign-in); the user-context
  branch (the user reaches `runAgent`). Supersedes the untracked draft
  `docs/architecture/integrations.md` on `t3/research-integration-architecture`, which was written
  against the layered codebase before the `agent` module.

## Context

The only data sources are mock data: `sources/catalog.ts` is shared, read-only sample data,
and every `Source` carries all its records. GitHub is the first real system. Jira,
Confluence and codebeamer come after it, and PostHog, Supabase and Stripe may follow. Adding
the next one should mean adding a folder, not reshaping modules.

The task names four pieces: a user context, stored credentials, a tool for the harness and a
sources view. The code shows that four more come with them:

| Piece | Today | What real systems need |
| --- | --- | --- |
| 1. User context | `answerThread` has the `User`; `runAgent` does not (`AgentRequest` carries no user) | The user reaches `AgentContext`, because a tool resolves that user's credential. This is the parallel branch. |
| 2. Credentials | None. Better Auth's `accounts` table holds Keycloak's tokens only | A store for each user's API keys and OAuth tokens, encrypted, which never reaches the browser, the prompt or the logs |
| 3. Agent tool | `search_records` over the attached records (`sources/tools.ts`) | Live reads against the system with the user's credential, and vendor tools (GitHub code search, PostHog insights) |
| 4. Sources view | "Manage data sources" opens a picker of the three sample sources | Connect, show status, reconnect and disconnect, per user |
| 5. Records are live | `Source.records` is embedded, and `resolveContext` filters it synchronously | A repo has thousands of issues. Records load lazily, page by page, per user |
| 6. Record shape | `status` is one of four fixed values; `summary`, `risk` and `nextStep` are required | A system's own status workflow, a URL, and no AI-written fields |
| 7. Prompt safety | Attached records are written into the **system** instructions (`instructions.ts`, `sourceContext`) | Real issue bodies are untrusted input and must not sit in the system prompt |
| 8. Presentation | `SourceIcon` keys its icon and tint on `source.id` (`jira`, …) | Source ids become per connection, so presentation keys on the provider |

Constraints from `ARCHITECTURE.md` that shape the design:

- Modules are reached through `index.ts` or `server.ts`. The graph is a DAG today
  (`threads → agent → skills | sources`, `threads → projects`), and it stays one.
- Each user owns their data. Every query on owned rows takes the user first, and each module
  with stored data has a command or action test that calls `assertIsolation()`.
- A tool lives in the module it acts on. Its context comes from the server, never from the
  model. Static tool names are stored in conversations and are never renamed.
- Presentation is data on the source, not a branch on its id.
- Module shape is flat by default. A module adds a file only for a real need.

## Decision drivers

1. **Adding a provider is local.** Jira is a folder and one registry line. It needs no new
   table, route or module.
2. **Secrets have one owner.** One file decrypts. The rest of the app sees a connection id.
3. **The server decides what the agent may reach.** The thread's scope and the user's
   connections decide it, as `search_records` and `load_skill` already do.
4. **Two kinds of systems are first-class.** Record systems (GitHub, Jira, Confluence,
   codebeamer) are browsed and attached to threads. Tool-only systems (PostHog, Supabase,
   Stripe) are only called by the agent.
5. **The prototype keeps working without accounts.** The sample data becomes a provider like
   any other, so tests and demos run the same code path.

## Vocabulary

| Term | What it is | Examples | Kind of data |
| --- | --- | --- | --- |
| **Provider** | A system the workspace can connect to: its auth methods, settings, capabilities and presentation. Code, not rows. | `github`, `atlassian`, `codebeamer`, `posthog`, `stripe`, `supabase`, `sample` | Shared catalogue |
| **Connection** | One user's authenticated link to one account or site of a provider, with its credential | "@micha on github.com", "acme.atlassian.net" | **Owned** (`user_id`) |
| **Source** | A collection of records inside a connection that a thread can browse and attach | A repository, a Jira project, a Confluence space, a codebeamer tracker | Derived, read live |

A provider declares **capabilities**:

- **`records`**: it has sources and records. It appears in the source picker and explorer, and
  its records can be attached to a thread.
- **`tools`**: the agent can call it during an answer.

PostHog, Supabase and Stripe have only `tools`. This one distinction is what lets a payments
system and an issue tracker use the same machinery.

One connection can yield several products. One Atlassian grant (OAuth 3LO, or an email and API
token) covers Jira and Confluence on a site. The provider is therefore `atlassian`, and its
`records` capability lists two *products*, `jira` and `confluence`, each with its own reader
and presentation. Today's three sample sources work the same way: one `sample` provider with
three products.

## Decision

### 1. A sixth module, `integrations`, with one folder per provider

`integrations` owns the provider catalogue, connections, credentials, the OAuth flow, the
Sources settings view and the providers' agent tools. It is a leaf: it imports no other module
except type-only imports. `sources` stays the vendor-neutral record domain (scope, explorer,
`search_records`) and reads records through `integrations/server.ts`.

```
src/modules/integrations/
  contracts.ts             # Provider, Capability, AuthMethod, ConnectionDto (no secrets),
                           # ExternalRecord, RecordQuery, RecordPage, connect-input schemas
  providers.ts             # the registry: `export const providers = [sample, github] as const`
  providers/
    sample/                # today's catalog.ts behind the same contract; auth: none
      index.ts  data.ts
    github/
      index.ts             # defineProvider({...}): manifest, auth, settings, capabilities
      api.ts               # fetch + zod-parsed responses (the vendor JSON is validated here once)
      records.ts           # RecordReader: repos → sources, issues and PRs → records
      records.test.ts      # mapper tests on recorded fixtures, no network
    atlassian/  codebeamer/  posthog/  stripe/  supabase/   # later, the same shape
  queries.ts               # listConnections(user), getConnection(user, id): no secrets
  actions.ts               # connectWithTokenAction, disconnectAction, testConnectionAction
  vault.ts                 # the only reader/writer of connection_secrets; encrypt, decrypt, refresh
  access.ts                # accessFor(user, connectionId): ConnectionAccess, refreshing when due
  oauth.ts                 # start/complete authorization (PKCE, state); phase 4
  records.ts               # readerFor(user, sourceId): picks the provider's reader with access
  tools.ts                 # integrationTools (static, native) + openToolkits(user, grants) (MCP)
  components/
    sources-settings-panel.tsx   # Settings → Sources
    connect-dialog.tsx           # OAuth button or token form, built from the auth method
    connection-status.tsx  provider-icon.tsx  integration-tool-call.tsx
  index.ts  server.ts
```

The registry is an explicit, typed list, like `tools` in `agent/tools.ts`. It is not a glob,
because the TypeScript of each provider has to type-check against the contract. Adding Jira
means adding `providers/atlassian/` and one line in `providers.ts`.

**Why vendor code is grouped by vendor and not split by capability.** The earlier draft put
readers in `sources/infra/` and toolkits in `threads/infra/`, so a new vendor touched three
modules. Since then the project decided that "a tool lives in the module it acts on". A GitHub
tool acts on the GitHub connection, so it belongs next to the GitHub credential and reader. The
skills catalogue set the precedent that adding a thing is adding a folder. The cost is that the
record shape (`ExternalRecord`) is declared in `integrations/contracts.ts`, and
`sources/contracts.ts` re-exports it as `SourceRecord`. The record shape is defined by the
readers that produce it, and the graph stays a DAG:

```
threads ──► agent ──► skills
   │          │
   │          ├────► sources ──► integrations
   │          └──────────────────► integrations   (tools, accessFor)
   └──► projects, sources, skills
```

### 2. The provider contract

```ts
// integrations/providers/github/index.ts (sketch)
export const github = defineProvider({
  id: "github",
  name: "GitHub",
  description: "Repositories, issues & pull requests",
  auth: [
    {
      kind: "token",
      label: "Fine-grained personal access token",
      fields: { token: secretField({ placeholder: "github_pat_…" }) },
      help: "Repository access: Issues and Pull requests (read), Metadata (read).",
    },
    // A legacy system without tokens: { kind: "basic", fields: { username: textField(), password: secretField() } }
    // phase 5: { kind: "oauth", flow: "authorization_code_pkce", authorizeUrl, tokenUrl, scopes }
  ],
  // Non-secret, per connection: GitHub Enterprise Server, a codebeamer instance, a Jira site.
  settings: z.object({ apiUrl: z.url().default("https://api.github.com") }),
  /** Called on connect and on "Test": who is this, what may it do, when does it expire. */
  verify: async (access) => verifyGithubToken(access),   // GET /user, scopes and expiry headers
  records: {
    products: {
      github: {
        presentation: { singular: "issue", plural: "issues", listLabel: "Issues", hasBoard: true,
                        icon: "github", tone: "neutral" },
        reader: githubRecords,                          // RecordReader, below
      },
    },
  },
  tools: {
    kind: "mcp",
    url: "https://api.githubcopilot.com/mcp/readonly",
    allow: ["search_issues", "get_issue", "search_code", "get_file_contents", "list_pull_requests"],
  },
});
```

```ts
// integrations/contracts.ts (sketch)
export type RecordReader = {
  listSources(access: ConnectionAccess): Promise<SourceSummary[]>;          // repos, projects, spaces
  searchRecords(access: ConnectionAccess, sourceKey: string, query: RecordQuery): Promise<RecordPage>;
  getRecords(access: ConnectionAccess, sourceKey: string, ids: readonly string[]): Promise<ExternalRecord[]>;
};

export type ExternalRecord = {
  id: string;                    // stable within the source: "42" for laserjm/workspace-prototype#42
  title: string;
  type: string;                  // "Issue", "Pull request", "Story", "Page"
  url: string;                   // "Open in GitHub"
  status: RecordStatus;          // the existing four, as a category: To do, In progress, In review, Done
  statusLabel: string;           // the system's own: "open", "Ready for QA", "merged"
  priority?: RecordPriority;
  owner?: string;
  body: string;                  // Markdown, truncated for the prompt
  updated: string;               // ISO timestamp; the UI formats it
  fields?: Record<string, string>;  // provider-specific facts the card and prompt list
  summary?: string; risk?: string; nextStep?: string;   // sample data only, optional from now on
};
```

`tools` is either `{ kind: "mcp", url, allow, auth? }` (a remote MCP server the vendor runs) or
`{ kind: "native", tools }` (AI SDK tools written here over the vendor's REST API). The rule:
**MCP when the vendor offers a server, native over REST otherwise.** Both are optional, so a
provider can have records only, tools only, or both.

`auth` lists one or more methods, and the provider picks what the system supports:

| Kind | Secret stored | Header built by `accessFor` | For |
| --- | --- | --- | --- |
| `token` | an API key or personal access token | `Bearer …` (or what the method declares, such as Atlassian's `Basic email:token`) | GitHub PAT, PostHog, Stripe restricted key |
| `basic` | username and password | `Basic …`, or a session login the provider's `api.ts` performs | legacy systems, older codebeamer |
| `oauth` | access and refresh token | `Bearer …`, refreshed when due | GitHub App, Atlassian 3LO (phase 5) |
| `none` | nothing | nothing | `sample` |

### 3. Credentials: our own encrypted table, not Better Auth's `accounts`

```
connections                         -- owned; a listing never touches a secret
  id uuid pk
  user_id text not null → users(id) on delete cascade
  provider_id text not null          -- "github"
  account_label text not null        -- "@micha", "acme.atlassian.net"
  account_ref text not null          -- the provider's stable account id, for the unique key
  settings jsonb not null            -- validated by the provider's settings schema
  auth_kind connection_auth_kind     -- 'token' | 'basic' | 'oauth' | 'none'
  status connection_status           -- 'active' | 'needs_reconnect'
  scopes text[], last_verified_at, created_at, updated_at
  unique (user_id, id)               -- target of the secrets' reference
  unique (user_id, provider_id, account_ref)

connection_secrets                  -- 1:1, read only by vault.ts
  connection_id uuid pk, user_id text,
  (connection_id, user_id) → connections(id, user_id) on delete cascade
  key_version int not null, iv bytea not null, ciphertext bytea not null   -- AES-256-GCM, tag included
  expires_at timestamptz, refresh_expires_at timestamptz, updated_at

connection_authorizations           -- phase 4: in-flight OAuth, minutes long
  state_hash text pk, user_id, provider_id, pkce_verifier_ciphertext, return_to, expires_at
```

- **One blob per connection.** The secret (token; access and refresh token; Atlassian's email
  and API token) is one JSON value, encrypted whole with AES-256-GCM. The additional
  authenticated data is `connectionId:userId`, so a ciphertext copied to another row or user
  does not decrypt.
- **Keys.** `INTEGRATION_KEYS="2:base64…,1:base64…"` is a keyring with the newest key first,
  validated in `lib/env.ts`. It is separate from `BETTER_AUTH_SECRET`, so rotating one does not
  break the other. `key_version` lets a re-encrypt job rotate keys. KMS or Vault Transit can
  later replace the inside of `vault.ts`.
- **Who sees what.** `ConnectionDto` (browser) has no secret fields. `ConnectionAccess` is built
  per request on the server by `accessFor(user, connectionId)` and holds a ready
  `Authorization` header value and the API base URL. It is never exported from `index.ts`,
  stored or logged. Logs name the `connectionId`.
- **Refresh.** `accessFor` refreshes when a token expires within 60 s. It runs in a transaction
  that locks the secret row (`SELECT … FOR UPDATE`). GitHub App and Atlassian **rotate refresh
  tokens**: a used refresh token stops working, so two answers that refresh at once would
  disconnect the user. A 401 or `invalid_grant` sets `needs_reconnect`, and the Sources view
  shows "Reconnect".
- **Verify on save.** A token is checked before it is stored (`provider.verify`). The check
  records the account label, the granted scopes and the expiry. A token that fails is not
  stored.

Why not the existing pieces:

- **Better Auth `accounts` + `linkSocial`.** It is tempting, because GitHub is a built-in
  provider and its tokens are already encrypted and refreshed. But `accounts` is the sign-in
  identity: `accountLinking` is deliberately off, and a linked GitHub account becomes a way to
  sign in. It cannot hold API keys (codebeamer, PostHog, an Atlassian token or a Stripe
  restricted key). It cannot hold a site URL (GitHub Enterprise, Jira Data Center) or two
  connections to the same provider. It would also make `lib/auth/` a dependency of every
  integration.
- **Keycloak identity brokering.** It has the same limits, and it ties integrations to the
  sign-in. Keycloak stays who you are. `integrations` holds what you have connected.

### 4. Sources become views of connections, with live records

- `listSources(user)` in `sources/queries.ts` takes the user's active connections whose provider
  has `records`, asks each product's reader for its `SourceSummary`s, and returns `Source`s
  without records. Presentation comes from the product's manifest. A source's id is opaque,
  `<connectionId>:<sourceKey>`. The sample sources keep the ids `jira`, `confluence` and
  `codebeamer`, so stored threads (`threads.source_id`, `record_ids`) stay valid.
- The explorer loads records page by page from a route,
  `GET /api/sources/[sourceId]/records?query=&cursor=`. The route reads the user and calls
  `sources/server.ts searchSourceRecords(user, …)`. Search goes to the provider (GitHub's
  issue search, JQL, CQL).
- The thread scope stays `{ sourceId, recordIds }`. On every answer, `resolveContext` becomes
  async and fetches the attached records with `getRecords`, so record content is fresh and
  always comes from the server. A record that has gone, or a connection that lost access,
  degrades the way a missing record does today: it is left out and the count stays. The
  `chatOptionsSchema` length limits grow to fit the longer ids.
- `SourceIcon` takes the product's `presentation.icon` and `tone`, not the source id.

GitHub mapping (`providers/github/records.ts`): a source is a repository. Its records are issues
and pull requests (`GET /repos/{owner}/{repo}/issues` returns both).

| GitHub state | Status category |
| --- | --- |
| Open issue, no assignee | To do |
| Open issue, assigned; draft PR | In progress |
| Open PR | In review |
| Closed issue; merged or closed PR | Done |

### 5. Agent tools: generic record tools, plus vendor tools from MCP or native code

**Record tools stay in `sources` and work for every records provider.** `search_records` keeps
its name and its scope context, and it reads through the reader instead of the catalogue. Two
generic tools join it later: `get_record` (the full body and comments of an attached record)
and `search_source` (live search in the scoped source beyond the attached records). Because
they are static and generic, the "never renamed" rule and `WorkspaceUITools` keep working
however many providers arrive.

**Vendor tools live in `integrations/tools.ts`**, in one of two ways:

| Provider | Vendor tools via | Credential sent | Records via |
| --- | --- | --- | --- |
| GitHub | Remote MCP `api.githubcopilot.com/mcp/` (read-only toolset) | Bearer: fine-grained PAT; later a GitHub App user token | REST |
| Atlassian | Remote MCP `mcp.atlassian.com/v1/mcp` | OAuth 2.1 or API token | REST (Jira, Confluence) |
| codebeamer | **Native** AI SDK tools (no official MCP server found) | Basic or OAuth (r3.3+) against the instance | REST v3 (Swagger) |
| Stripe | Remote MCP `mcp.stripe.com` | Restricted key or OAuth | none, tools only |
| Supabase | Remote MCP `mcp.supabase.com/mcp` (read-only, project-scoped) | OAuth or a personal access token | none |
| PostHog | Remote MCP (check the auth method when it comes) | Personal API key | none |

The Stripe, Supabase and PostHog rows come from vendor directories, not from their own docs. Check them when their phase comes.

- **MCP where the vendor runs a server.** It covers five of the six targets, and the vendor
  maintains the tool surface. A provider's MCP entry is only data: a URL, how the credential is
  sent, and an allowlist. `openToolkits(user, grants)` opens one `@ai-sdk/mcp` client per granted
  connection with `headers: { Authorization }` from `accessFor`. It keeps only the allowlisted
  tools and closes the clients when the answer ends or is aborted. `@ai-sdk/mcp` 2.0.90 is
  already in the lockfile as a dependency of `@ai-sdk/react`. It becomes a direct dependency.
- **How dynamic tools fit `runAgent`.** `prepareCall` may return `tools` as well as
  `activeTools`, so `toolsFor` merges the opened toolkit into the static set for that call. MCP
  tools are *dynamic* tools. They are stored as `dynamic-tool` parts, which
  `safeValidateUIMessages` checks against the generic part schema, not against the static
  registry. A stored conversation therefore stays valid after a vendor renames or removes a
  tool. The "never renamed" rule stays a rule for static tools only.
- **Names.** Vendor tools are prefixed with the provider (`github_search_code`), and at most one
  connection per provider is granted per answer, so names never collide.
- **Context, not trust, extended.** The use case, not the model, decides the **grants** for an
  answer: the connection behind the thread's attached source, plus connections the user switched
  on for the thread (like skills). A tool's context is `{ connectionId }`. Its `execute`, or the
  MCP client, gets the credential from `accessFor(user, connectionId)`, which refuses a
  connection that is not the user's. This is why the user has to reach `AgentContext`.
- **Read-only first.** Use the vendor's read-only toolsets and our allowlist, about 5 to 10 tools
  per provider. GitHub's full server has dozens of tools, far too many to send on each turn.
  Writes (comment on an issue, create a ticket, refund a payment) come later and use AI SDK
  tool approval (`needsApproval` / `toolApproval`, supported by `ai` 7), with an approve or deny
  card in the chat.
- **Untrusted output.** Issue bodies and tool results can carry prompt injection. Attached
  records move out of the system instructions into a context message, marked as data. The
  instructions say tool results are data, never instructions, and each result's size is capped.
- **UI.** One generic `IntegrationToolCall` card renders `dynamic-tool` parts ("Searched GitHub
  code · 12 results", collapsible, with the provider's icon). `message-parts.tsx` maps
  `dynamic-tool` onto it.

### 6. The Sources view

- **Settings → Sources**, a third section beside General and Skills. The existing "Manage data
  sources" button opens it. Each provider in the registry gets a card. An unconnected provider
  shows Connect. A connected one shows "Connected as @micha · token expires in 23 days" with
  Test, Reconnect and Disconnect. `needs_reconnect` shows as a warning.
- **The connect dialog is built from the auth method**: a token form from its `fields`, using the
  same schema the action validates; or an OAuth button that goes to
  `/api/integrations/[providerId]/authorize`. Settings fields (an instance URL) come from the
  provider's `settings` schema.
- **The source picker** lists sources grouped by connection. Tool-only providers never appear
  there. With nothing connected, it shows the sample sources and a link to Settings → Sources.
- **The thread context card** shows which connections the agent may use in this thread, with
  toggles, the way skills are shown.
- The sample provider is always connected (a virtual connection, no row) while
  `INTEGRATIONS_SAMPLE` is on. It is on by default in development and tests.

### 7. Routes

```
app/api/sources/[sourceId]/records/route.ts                 → sources/server.ts searchSourceRecords
app/api/integrations/[providerId]/authorize/route.ts        → integrations/server.ts startAuthorization   (phase 4)
app/api/integrations/[providerId]/callback/route.ts         → integrations/server.ts completeAuthorization (phase 4)
```

Connecting with a token, testing and disconnecting are server actions in
`integrations/actions.ts`, under the existing `action(…)` rules (ACTION-01 to 03).

## The pattern a provider author follows

A provider author learns one contract and writes at most three files:

1. **`providers/<id>/index.ts`**: `defineProvider({ id, name, auth, settings, verify, records?, tools? })`.
   It is all data, apart from `verify`.
2. **`providers/<id>/api.ts`**: `fetch` against the vendor with the `ConnectionAccess` it is
   given, with every response parsed by a zod schema. It never reads a secret, an env var or the
   database.
3. **`providers/<id>/records.ts`** (only with `records`): the `RecordReader`, mapping vendor JSON
   to `ExternalRecord`, with `records.test.ts` on recorded fixtures.

Then one line in `providers.ts`. Connecting, storing, encrypting, refreshing, the Sources view,
the picker, scoping, the agent's grants and the tool card all come from the contract. A provider
that needs anything outside these files is a sign the contract is missing something.

## Adding a provider: the checklist

**Jira and Confluence** (records and tools): add `providers/atlassian/` with a manifest (auth
methods OAuth 3LO and email plus API token; setting `site`; products `jira` and `confluence`;
tools from MCP with an allowlist), `api.ts`, the two readers with fixture tests, and one line in
`providers.ts`. Run the shared `describeRecordReader()` contract suite on the fixtures.

**Stripe, PostHog or Supabase** (tools only): a manifest with `auth`, `verify` and `tools`. No
`records` and no reader.

**codebeamer**: a manifest, a reader, and `tools: { kind: "native", tools }` written against REST
v3.

If a new provider needs a new table, route or module, the design is missing a capability. Fix
the design, not the provider.

## Enforcement (for the ARCHITECTURE.md entries)

- **CRED-01** (in `scripts/check-actions.mjs`, or a sibling script): only
  `integrations/vault.ts` imports `connectionSecretsTable`, and only `integrations/` imports
  `vault.ts` or `access.ts`.
- `ConnectionAccess` is not exported from `integrations/index.ts` (`tsc`, review).
- `integrations/actions.integration.test.ts`: connect, list, test and disconnect as the browser
  does, and `assertIsolation()`. Another user can neither list a connection, get access to it,
  nor delete it.
- `vault.test.ts`: a round trip, a tampered ciphertext, the wrong additional data, an old key
  version that still decrypts. `access.test.ts`: refresh when due, a concurrent refresh that
  refreshes once, `needs_reconnect` on 401.
- `providers/*/records.test.ts`: vendor fixtures mapped and asserted, with no network. One opt-in
  live smoke test per provider runs only when its token variable is set.
- `agent/tools.test.ts` and `run.test.ts`: grants become tools only for the user's connections,
  and a `dynamic-tool` part in a stored conversation validates.

## Phases (each one shippable)

| Phase | Depends on | Delivers |
| --- | --- | --- |
| **0. User in the agent** ✓ | nothing | `AgentRequest.user` and `AgentContext.user`; `toolsFor` hands the user to `search_records` |
| **1. Reshape sources** ✓ | nothing | `integrations` with the provider contract, the registry and the `sample` provider; `Source` without records, named `<connectionId>:<sourceKey>`; the scope's records read for the user before `resolveContext`; the records route and `SourceRecordsStore`; `SourceIcon` on presentation data; the contract test over every provider. **No visible change.** Moved to phase 3, where GitHub shows what is needed: the generalised `ExternalRecord` (URL, status label, optional fields), the explorer reading scoped records by id, the "Sample data" labels as data, and records out of the system prompt. |
| **2. Connections and the Sources view** | 0 | Tables and migration, `vault.ts`, `access.ts`, token connect, test and disconnect, Settings → Sources |
| **3. GitHub records** | 1, 2 | `providers/github/`: a fine-grained PAT, repos in the picker, issues and PRs in the explorer, attached records fetched live, `search_records` live, `get_record` |
| **4. Vendor tools** | 3 | `openToolkits` over `@ai-sdk/mcp`, the GitHub read-only allowlist, grants and their toggles, the generic tool card, the untrusted-output instructions |
| **5. OAuth** | 2 | The authorization table and routes on `oauth4webapi` (PKCE, state in the database), a GitHub App (8 h user tokens, 6-month rotating refresh tokens, locked refresh). Then Atlassian 3LO with the Jira and Confluence readers and Atlassian MCP |
| **6. Breadth** | 4, 5 | codebeamer (native); PostHog, Supabase, Stripe as tool-only providers; write tools behind approval |

Start GitHub with a fine-grained PAT. It runs the whole pipeline without OAuth plumbing. When
OAuth comes, prefer a **GitHub App** to an OAuth App: its permissions are fine-grained, the user
picks the repositories, and its tokens expire. GitHub itself recommends Apps over OAuth Apps.

## Decisions taken (2026-11-06)

1. **Per-user connections.** Organisation-level connections would come with the organisation
   migration that "Data ownership" names.
2. **Tools: MCP when the vendor offers it, native over REST otherwise.** Systems with no token
   support use `basic` (username and password). GitHub starts with a fine-grained PAT, which works
   for its REST API and its remote MCP server alike.
3. **Keys from an env keyring** (`INTEGRATION_KEYS`). KMS or Vault can replace the inside of
   `vault.ts` later.
4. **Grants per thread**: the attached source's connection plus connections the user switches on
   for the thread.

## Sources

- AI SDK MCP tools (`createMCPClient`, `headers`, `authProvider`): <https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools>
- GitHub MCP server, remote endpoint and OAuth or PAT: <https://pkg.go.dev/github.com/github/github-mcp-server@v1.3.0/pkg/http/oauth>, <https://www.scalekit.com/blog/github-mcp-server-per-user-oauth>
- GitHub App user access tokens (8 h, refresh 6 months, single-use refresh): <https://docs.github.com/en/enterprise-server@3.7/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens>
- Atlassian Rovo MCP server (OAuth 2.1 or API tokens): <https://github.com/mcp/com.atlassian/atlassian-mcp-server>, <https://www.atlassian.com/de/platform/remote-mcp-server>
- codebeamer REST v3 (Swagger, authentication, OAuth 2.0 in r3.3): <https://support.ptc.com/help/codebeamer/r3.3/en/codebeamer/developers_guide/swagger/dg_swagger_web_based_authentication.html>, <https://support.ptc.com/help/codebeamer/r2.2/en/codebeamer/developers_guide/5250839.html>
- Better Auth OAuth, `linkSocial` and `getAccessToken`: <https://www.better-auth.com/docs/concepts/oauth>
- Local: `ai` 7.0.162 (`prepareCall` may return `tools`; `toolApproval`; `dynamic-tool` parts validated by schema); `@ai-sdk/mcp` 2.0.90 in `pnpm-lock.yaml`.
