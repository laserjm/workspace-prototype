# GitHub's remote MCP server with a fine-grained token

Research for issue #38 (map #36). Question: can the agent's GitHub tools be GitHub's hosted MCP
server (`https://api.githubcopilot.com/mcp/`, read-only), called from our server with the user's
fine-grained PAT, and what does that give us compared with native tools over REST?

Read on 2026-11-12. Nothing here was checked against the live server: we had no credentials, and
the ticket said not to call it. Claims marked **unconfirmed** come from docs or source, not from
a real call.

## Sources

- `github/github-mcp-server` at commit `6fbcd00` (2026-11-09), shortened below to `GMS:`.
  Permalink base: <https://github.com/github/github-mcp-server/blob/6fbcd00b2034502ba3001a49dfaf93593aee7069/>
  - `README.md`, `docs/remote-server.md`, `docs/server-configuration.md`, `docs/scope-filtering.md`,
    `docs/policies-and-governance.md`, `docs/feature-flags.md`, `docs/insiders-features.md`,
    `docs/typed-tool-schemas.md`, `docs/streamable-http.md`
  - `pkg/github/tools.go`, `pkg/github/__toolsnaps__/*.snap` (the tool definitions the server
    sends, as the repo's own snapshot tests record them), `pkg/github/csv_output.go`,
    `pkg/github/feature_flags.go`, `pkg/github/pullrequests.go`, `pkg/github/repositories.go`,
    `pkg/github/minimal_types.go`, `pkg/sanitize/sanitize.go`, `pkg/http/headers/headers.go`,
    `pkg/inventory/typed_output.go`, `pkg/utils/token.go`
  - The remote server is "built using this repository as a library" and "regularly" updated from
    it (`docs/remote-server.md`, "About"). So the hosted tool list can lag behind or run ahead of
    `main`. That gap is **unconfirmed**.
- `@ai-sdk/mcp` **2.0.90**, the version in `pnpm-lock.yaml` (pulled in by `@ai-sdk/react`): files
  `src/tool/mcp-client.ts`, `src/tool/mcp-transport.ts`, `src/tool/mcp-http-transport.ts`,
  `src/tool/types.ts` and `README.md`, from the npm tarball.
- `ai` **7.0.162** (lockfile): `docs/03-ai-sdk-core/16-mcp-tools.mdx` (the same page as
  <https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools>), `docs/08-migration-guides/23-migration-guide-7-0.mdx`,
  `src/agent/tool-loop-agent-settings.ts`, `src/ui-message-stream/ui-message-stream-on-end-callback.ts`.
- docs.github.com: [Permissions required for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens),
  [REST search](https://docs.github.com/en/rest/search/search).

`node_modules` is not installed in this worktree. Both packages were read from their published
tarballs at the exact lockfile versions.

## 1. Fine-grained PAT, permissions, GHES

**A fine-grained PAT is accepted as `Authorization: Bearer`.** The README's PAT setup for the
remote server is exactly `"headers": { "Authorization": "Bearer ${input:github_mcp_pat}" }`
(`GMS: README.md` "Install in VS Code"). It adds that "any host application that supports remote
MCP servers should support the remote GitHub server with PAT authentication". The server
recognises `github_pat_` as a fine-grained PAT (`GMS: pkg/utils/token.go`). The policy doc lists
fine-grained PATs as the recommended token type for "both local & remote GitHub MCP servers"
(`GMS: docs/policies-and-governance.md` §3).

- **The server does not filter tools for fine-grained PATs.** Scope filtering works only for
  classic `ghp_` tokens, which report `X-OAuth-Scopes`. With `github_pat_` tokens "all tools
  [are] shown, API enforces permissions" (`GMS: docs/scope-filtering.md`). So the tool list
  depends only on our headers, not on the user's token, and can be cached across users (§3).
  A tool the token cannot use fails at call time with a GitHub API error.
- **Permissions** come from what each tool calls on the REST API. For the reads this slice needs
  (docs.github.com permissions page):

  | Tool (method) | REST endpoint | Fine-grained permission (read) |
  | --- | --- | --- |
  | `issue_read` get / `list_issues` | `GET /repos/{o}/{r}/issues[/{n}]` | Issues |
  | `issue_read` get_comments | `GET …/issues/{n}/comments` | Issues **and** Pull requests (needed for PR conversation comments) |
  | `pull_request_read` get | `GET …/pulls/{n}` | Pull requests **and** Contents |
  | `pull_request_read` get_files / get_reviews / get_review_comments | `GET …/pulls/{n}/files` etc. | Pull requests |
  | `pull_request_read` get_status | `GET …/commits/{ref}/status` | Commit statuses |
  | `pull_request_read` get_check_runs | check-runs | Checks (**unconfirmed**, not on that page) |
  | `get_file_contents`, `list_commits` | `GET …/contents/{path}`, `GET …/commits` | Contents |
  | `search_code`, `search_issues`, `search_pull_requests` | `GET /search/code`, `/search/issues` | Not listed on the permissions page; **unconfirmed**. Code search is authenticated-only, 10 requests/min, default branch only (REST search docs). |

  Metadata (read) is granted to every fine-grained PAT. Recommended token: **Metadata, Contents,
  Issues and Pull requests, all read**, plus Commit statuses and Checks if CI state matters. Some
  tools use GraphQL (sub-issues, review threads). Their permissions are **unconfirmed**.
  Organisations can require approval before a fine-grained PAT may read their repositories
  (`policies-and-governance.md` §3).
- **Copilot licence:** none of the docs I read require a Copilot seat for PAT access to
  `api.githubcopilot.com/mcp/`. The "MCP servers in Copilot" policy governs Copilot editors, and
  third-party hosts are governed by PAT/OAuth-app policies (`policies-and-governance.md` §1–3).
  Whether a user without Copilot can call the server is **unconfirmed**.
- **Rate limits:** the server calls GitHub's API with the user's token, so each tool call spends
  the user's own REST/GraphQL rate limit, plus the 10/min code-search limit. This is an
  inference from how the server is built, **unconfirmed** for the hosted server.

**GitHub Enterprise Server is not supported by the remote server.** The README says: "GitHub
Enterprise Server does not support remote server hosting" (`GMS: README.md` "GitHub Enterprise
Server"). The options are:

- **GHE.com (data residency)** has its own hosted endpoint, `https://copilot-api.<sub>.ghe.com/mcp`,
  with the same Bearer PAT.
- **GHES** needs a server we run ourselves, `github-mcp-server http` with
  `--gh-host https://<host>` / `GITHUB_HOST`. HTTPS is required (`README.md` "GitHub Enterprise
  Server and Enterprise Cloud…", `docs/streamable-http.md`). A GHES connection would then need
  our own deployment per instance, or a stdio server we spawn. That is a new piece of infra,
  where native REST against the instance's API needs nothing extra.

## 2. The read-only toolset: contents, shape, filtering

**Server-side filtering is available on every request** (`GMS: docs/remote-server.md`
"Optional Headers", `pkg/http/headers/headers.go`):

| Control | How |
| --- | --- |
| Read-only | `/readonly` URL suffix, or `X-MCP-Readonly: true`. Write tools are dropped even when named in `X-MCP-Tools`. |
| Toolsets | `/x/{toolset}` (one) or `X-MCP-Toolsets: issues,pull_requests` (several). Unknown names are silently ignored. |
| Individual tools | `X-MCP-Tools: issue_read,pull_request_read,…`. Given alone, it exposes only those tools. With toolsets it adds to them. **An unknown name fails the request.** |
| Exclude | `X-MCP-Exclude-Tools: …` wins over everything (`docs/server-configuration.md`). |
| Lockdown | `X-MCP-Lockdown: true` (see §4). |
| Feature flags | `X-MCP-Features: csv_output,…` (allowlisted flags only, `feature_flags.go`). |

So the ADR's allowlist can be enforced by GitHub, not only by us: send `X-MCP-Readonly: true`
plus `X-MCP-Tools: <allowlist>`. Because an unknown tool name fails the request, a tool GitHub
renames or removes breaks the connection loudly instead of quietly. Old names are kept as aliases
(`README.md`, `docs/tool-renaming.md`). We should still filter on our side too (§3).

**The default toolset is `context, repos, issues, pull_requests, users`** (`README.md` "default
toolset"). `copilot` is also marked `Default: true` in `tools.go`, but all its tools are writes.
In read-only mode, without feature flags, that leaves **26 tools** (taken from
`__toolsnaps__/*.snap` `readOnlyHint` plus each tool's toolset in the Go source; the exact hosted
list is **unconfirmed**):

- context: `get_me`, `get_teams`, `get_team_members` (`ui_get` is app-only and hidden from models)
- repos: `search_repositories`, `get_file_contents`, `list_commits`, `search_code`,
  `search_commits`, `get_commit`, `list_branches`, `list_tags`, `get_tag`, `list_releases`,
  `get_latest_release`, `get_release_by_tag`, `list_repository_collaborators`
- issues: `issue_read`, `search_issues`, `list_issues`, `list_issue_types`, `list_issue_fields`,
  `get_label`
- pull_requests: `pull_request_read`, `list_pull_requests`, `search_pull_requests`
- users: `search_users`

These are hidden behind feature flags or insiders mode: `get_file_blame`,
`issue_dependency_read`, `issue_artifact_read` and `find_duplicate` (`feature_flags.go`,
`docs/insiders-features.md`).

**Inputs.** Reads are grouped into "method" tools. `issue_read` takes
`{method: get|get_comments|get_sub_issues|get_parent|get_labels, owner, repo, issue_number,
page?, perPage? (≤100)}` (`issue_read.snap`). `pull_request_read` takes `{method: get|get_diff|
get_status|get_files|get_commits|get_review_comments|get_reviews|get_comments|get_check_runs,
owner, repo, pullNumber, page?, perPage?, after?}` (`README.md`, `pull_request_read.snap`).
Every tool takes free-form `owner`/`repo`. **The server does not limit which repositories the
model may name. Only the PAT's repository selection does.**

**Output shape.**

- Results are JSON text. Bodies are reduced to "minimal" types: issue `{number, title, state,
  body, user{login,id}, labels[], assignees[], html_url, timestamps, reactions,
  closed_by_pull_requests (≤5 refs), sub_issues_summary, …}`, comments `{id, body, user,
  author_association, html_url, timestamps, reactions}` (`issue_read.snap` outputSchema,
  `minimal_types.go`).
- For MCP protocol `2026-07-28` and later, the server also sends `outputSchema` and
  `structuredContent`, and the text is the same JSON. Older protocols get text only
  (`docs/typed-tool-schemas.md`, `pkg/inventory/typed_output.go`).
- `list_*` tools in default toolsets can return **CSV** instead of JSON with
  `X-MCP-Features: csv_output` (on in insiders mode), to save context (`csv_output.go`,
  `docs/insiders-features.md`).

**Size: no overall cap.**

- `pull_request_read get_diff` returns the raw diff unchanged (`pullrequests.go`
  `getPullRequestDiff`).
- `get_file_contents` embeds a file **up to 1 MB** as an MCP resource. Above that it returns a
  link (`repositories.go`, `maxContentSize = 1024*1024`).
- Lists page at `perPage` ≤ 100. Comments are not truncated.
- Only Actions job logs have a content window (`tail_lines`, `ContentWindowSize`).

## 3. `@ai-sdk/mcp` 2.0.90 with `ai` 7: per-request client, tools, close

**Open a client per answer** with the user's token and our filter headers:

```ts
import { createMCPClient } from "@ai-sdk/mcp";

const client = await createMCPClient({
  transport: {
    type: "http",
    url: "https://api.githubcopilot.com/mcp/readonly",
    headers: {
      Authorization: `Bearer ${token}`, // from accessFor(user, connectionId), server-side only
      "X-MCP-Readonly": "true",
      "X-MCP-Tools": GITHUB_ALLOWLIST.join(","),
      "X-MCP-Lockdown": "true", // optional, see §4
    },
    // redirect defaults to 'error' in ai 7 (SSRF guard); keep it.
  },
  initializationOptions: { signal, timeout: 5_000 },
  clientName: "workspace",
});
```

(`MCPClientConfig` and `MCPTransportConfig` in `mcp-client.ts` / `mcp-transport.ts`. The
`redirect` default changed to `'error'`: migration guide 7.0, "MCP Package".)

**Turn the tools into AI SDK tools.**

- `await client.tools()` lists every tool, following `nextCursor`, and wraps each one as a
  **`dynamicTool`**. Its input schema is the server's JSON schema with
  `additionalProperties: false`. Its `execute` calls `tools/call` with the step's `abortSignal`.
  Its `toModelOutput` passes text parts through, turns images into files, and **`JSON.stringify`s
  any other part**, so an embedded file resource reaches the model whole (`mcp-client.ts`
  `toolsFromDefinitions`, `mcpToModelOutput`). An `isError` result is returned to the model as a
  result, not thrown.
- MCP annotations (`readOnlyHint` and the others) land on `tool.metadata.annotations`. The SDK
  says they are untrusted hints and never turns them into a policy (`16-mcp-tools.mdx`, "Tool
  Annotations and Approval").
- `client.tools({ schemas: { issue_read: { inputSchema, outputSchema? } } })` is a **client-side
  allowlist**. It wraps only the named tools, as static `tool()`s with our own zod schema, and
  optionally validates `structuredContent` against `outputSchema` (`16-mcp-tools.mdx`, "Schema
  Definition" and "Typed Tool Outputs"). That gives typed parts and lets the "never renamed" rule
  hold for vendor tools too. The cost is that we track GitHub's schemas by hand.
- Prefixing names (`github_issue_read`) is our own rename of the returned record's keys. The
  client calls by the original name it closed over, so a rename is safe (`toolsFromDefinitions`
  captures `name`).

**Fit with `runAgent`.**

- `prepareCall` may be async (`MaybePromiseLike`) and may return `tools` and `activeTools`
  (`tool-loop-agent-settings.ts`). So `runAgent` can open the client before
  `createAgentUIStreamResponse`, pass the toolkit in `AgentContext`, and have `toolsFor` merge it.
- `prepareCall`'s `tools` is typed as the agent's `TOOLS`. Merging dynamic tools will need a
  widened tool-set type. The ADR's claim that `dynamic-tool` parts validate by schema was not
  re-checked here.

**Close on finish, stop, failure and abort.**

- `client.close()` closes the transport. For a legacy session it sends `DELETE` with the
  `mcp-session-id`, unless `terminateSessionOnClose: false`. A second call does nothing
  (`mcp-client.ts` `close`, `mcp-http-transport.ts`). The SDK's advice for streaming is to close
  in `onEnd` (`16-mcp-tools.mdx`, "Closing the MCP Client").
- In this app, the UI-stream `onEnd` that `runAgent` already passes to
  `createAgentUIStreamResponse` runs for finished, stopped and failed replies, and gets
  `isAborted` (`ui-message-stream-on-end-callback.ts`). Close there, in a `try/finally` beside
  the existing `onEnd(…)` call. Also close if `runAgent` returns early (validation error) or if
  creating the stream throws, after the client was opened.
- An abort mid-tool also cancels the in-flight `tools/call`, because `execute` passes
  `options.abortSignal` through.

**Cost per turn: latency (estimated, not measured).** A fresh client per answer, before the
first model call, costs:

1. **Handshake.** With `protocolVersionDiscovery` on (the default), the client first sends
   `server/discover` for protocol `2026-07-28`. The HTTP transport waits for the reply rather
   than timing out after 1 s. If the server is legacy, it falls back to `initialize` and
   `notifications/initialized` (`tryProtocolDiscovery`, `init`). So that is one round trip
   against a modern server and about 2–3 against a legacy one. Which protocol the hosted server
   negotiates is **unconfirmed**. The open-source server supports `2026-07-28`
   (`typed-tool-schemas.md`).
2. **Listing.** `tools/list` is one more round trip.
3. **Tool calls.** Each one is one round trip to GitHub's MCP server, plus that server's own
   GitHub API calls. Native REST makes only those API calls.

Both of the first two steps can be skipped:

- `initialInitializeResult` reuses a cached handshake.
- `client.toolsFromDefinitions(cachedListToolsResult)` wraps a cached list without fetching it.

With fine-grained PATs the list depends only on our headers (§1), so a list cached per
deployment is valid for every user. Refresh it on a timer and check it for drift (§4).

**Cost per turn: tool-definition tokens.** These were measured from the snapshot definitions
(name + description + inputSchema, minified JSON, which is what the model receives; `outputSchema`
is not sent). Tokens are estimated at 3–4 bytes per token and vary by provider:

| Tool set | Tools | Bytes | ≈ Tokens per model step |
| --- | --- | --- | --- |
| Default read-only (above) | 26 | 26,849 | 6,700–9,000 |
| Proposed allowlist: `issue_read`, `pull_request_read`, `search_issues`, `search_pull_requests`, `list_issues`, `list_pull_requests`, `get_file_contents`, `search_code` | 8 | 14,057 | 3,500–4,700 |

- Per tool: `pull_request_read` 2,517 B, `list_issues` 2,295, `search_issues` 1,904,
  `search_pull_requests` 1,747, `list_pull_requests` 1,584, `search_code` 1,540, `issue_read`
  1,335, `get_file_contents` 1,135.
- The cost is paid on **every step** of the loop (`stopWhen: stepCountIs(5)`), unless the
  provider caches the prompt prefix.
- Native tools written for this slice (for example a `get_record` that takes one attached-item
  id) could plausibly be a few hundred bytes each. That is an estimate, not a measurement.
- The server's `instructions` (per-toolset guidance) are not added to the prompt. They appear
  only on `client.instructions` (`MCPClient` interface).
- If the list grows, `ai` 7's `toolSearch()` with `deferLoading` can keep definitions out of the
  first step (`19-tool-search.mdx`).

## 4. Shaped for a model? Injection precautions

**What GitHub's server does for us.**

- **Sanitising.** Issue, PR, comment and review bodies go through `sanitize.Content`, which
  strips invisible and bidirectional Unicode. Titles go through `sanitize.PlainText`, which also
  strips HTML and code-fence metadata. `sanitize.Sanitize` (an HTML allowlist via bluemonday,
  plus a second pass after decoding entities) is used for some fields (`pkg/sanitize/sanitize.go`,
  `minimal_types.go`).
- **Minimal types.** Large REST payloads are cut down to the fields above.
- **Lockdown mode** (`X-MCP-Lockdown: true`). It applies to **public** repositories only:
  - `issue_read:get` and `pull_request_read:get|get_diff|get_files|get_commits` **return an
    error** when the author lacks push access.
  - `get_comments`, `get_sub_issues`, `get_reviews` and `get_review_comments` **filter out** such
    authors.
  - `github-actions[bot]` and `copilot` are always trusted.
  - GitHub calls lockdown "a best-effort content filter … **not** an authorization boundary"
    (`README.md` "Lockdown Mode").
  - The catch for us: under lockdown, an attached public issue from an outside contributor
    cannot be read through MCP at all.
- **IFC labels.** An experimental `ifc_labels` flag annotates results with
  integrity/confidentiality labels (`pkg/ifc`). The enforcement engine "lives in a separate
  service", so this is not usable by us yet.

**What it does not do.**

- There is no overall output cap (§2).
- Bodies are not marked as untrusted inside the text.
- The model can name any repository the PAT can read.

**What the AI SDK gives us** (`16-mcp-tools.mdx`):

- Annotations are untrusted. Combine them with our own allowlist, scoped credentials, and
  `toolApproval`.
- `fingerprintTools` and `detectToolDrift` (from `ai`) pin approved definitions and flag a
  changed description or schema ("rug pull"). The SDK cannot detect a behaviour change behind an
  unchanged definition.
- `redirect: 'error'` is the default.

**What we still have to do either way** (these match ADR 0002 §5 "Untrusted output"):

- Cap each result's size in our own `toModelOutput` or `execute` wrapper. This matters most for
  `get_diff` and `get_file_contents`.
- Tell the model that tool results are data.
- Keep attached records out of the system prompt.
- Keep the PAT on the server, sent only in the transport header.

## Verdict for the first slice

MCP is workable. A fine-grained PAT works as Bearer. Read-only mode and a per-request tool
allowlist are enforced by GitHub through headers. `@ai-sdk/mcp` 2.0.90 fits `runAgent`'s
per-answer lifecycle.

What MCP buys:

- a tool surface GitHub maintains
- body sanitising
- lockdown mode as an option

What it costs:

- about 3.5–4.7k definition tokens per step for 8 tools
- 2–4 extra round trips per answer unless we cache the handshake and the list
- uncapped diffs and file contents
- dynamic, untyped parts, unless we pin `schemas`
- no remote GHES, so a GHES connection means running the server ourselves
- a dependency on `api.githubcopilot.com`

The record views need REST regardless. So native tools over the same REST client are the
cheaper and more controllable first slice, especially for "read this attached item". GitHub's
MCP tools can be added later for open-ended exploration such as code search, behind the
allowlist.

## Open, unconfirmed

- The exact tool list and protocol version the hosted server serves today.
- Whether a user without a Copilot seat can use `api.githubcopilot.com/mcp/` with a PAT.
- Fine-grained permissions for `/search/code`, `/search/issues` and the GraphQL-backed methods.
- Real latency of the handshake, `tools/list` and `tools/call` from our deployment region.
- Whether it rate-limits per token beyond GitHub's API limits.
