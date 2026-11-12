# GitHub's REST and search APIs for picking and viewing issues and pull requests

Research for issue #37 (map #36). Question: what can GitHub's REST and search APIs do for the
attach dialog and the record views when called with a **fine-grained personal access token**
(FG PAT)?

- **Researched:** 2026-11-12, against docs.github.com (Free/Pro/Team "fpt" docs, REST API
  version `2022-11-28`; GHES docs at 3.22), the GitHub changelog and GitHub's published GraphQL
  schema.
- **No token was used.** A few **unauthenticated** requests to public `octocat/Hello-World`
  checked headers (ETag, `x-ratelimit-resource`). Anything that needs an FG PAT to observe is
  marked **Unconfirmed**.
- Docs quotes come from the Markdown article API (`https://docs.github.com/api/article/body?pathname=…`)
  and the rendered endpoint pages, which carry a "Fine-grained access tokens for …" box per
  endpoint.

## Summary: the facts later decisions depend on

1. **An FG PAT reaches one resource owner, plus all of public GitHub.** "Each token is limited to
   access resources owned by a single user or organization", and "Tokens always include read-only
   access to all public repositories on GitHub." Accessing "multiple organizations at once" is a
   listed gap. So one connection = one owner's selected repositories + public read. [1]
2. **`GET /search/issues` works with an FG PAT and needs no permission.** Results are filtered to
   what the token can read. An unscoped query searches all of public GitHub too, so the picker
   must always add `user:OWNER`/`org:OWNER` or `repo:` qualifiers. A `repo:`/`org:`/`user:` the
   token cannot read fails the whole query with **422**. With several, the unreadable ones are
   **silently dropped**. [2][3]
3. **Search limits:** 30 requests/minute (`search` bucket, separate from `core`), 1,000 results per
   query, 100 per page, at most 4,000 repositories searched, queries ≤ 256 characters
   (qualifiers excluded) and ≤ 5 `AND`/`OR`/`NOT`. The response sets `incomplete_results` on
   timeout. [3]
4. **Two query dialects.** Legacy (default): a space between several `repo:`/`org:`/`user:` is
   **OR**. `advanced_search=true`: that space is **AND**, and you write
   `(repo:a/x OR repo:b/y)`, which spends the 5-operator budget. Advanced search is opt-in in the
   API. [4][5]
5. **Core limit 5,000 requests/hour per user** (all PATs share it), GraphQL 5,000 points/hour,
   plus secondary limits (100 concurrent, 900 REST points/min, 2,000 GraphQL points/min). An
   exceeded limit answers **403 or 429**. [6][7]
6. **Cost per view (REST):** issue = **2** requests (issue + comments), more when comments run
   past 100. PR = **5** (pull, issue comments, reviews, files, combined status), more when any list
   runs past 100. One GraphQL query can fetch either view for **~1 point**, but gives up ETags. [8][7]
7. **ETags work on the detail endpoints, not on search.** Every detail endpoint returned an
   `etag`. An authorized conditional `GET` that gets a **304 does not count** against the primary
   limit. An unauthenticated 304 *did* count, as the docs imply. `/search/issues` answered
   `cache-control: no-cache` with no ETag. GraphQL is `POST`, and conditional requests are not
   supported for `POST`. [9][observed]
8. **Checks are a hole.** The Checks API (check runs, check suites) **does not accept FG PATs**:
   it works with GitHub App tokens only, and "call the Checks API" is a documented FG PAT gap. For
   private repositories an FG PAT can read only **commit statuses** (`Commit statuses: read`),
   which do not include GitHub Actions results. GraphQL `statusCheckRollup` via an FG PAT is
   **Unconfirmed**. [1][10]
9. **Permissions for the views:** `Metadata: read` (repository list), `Issues: read` (issue,
   comments), `Pull requests: read` (reviews, files; the pull itself also takes `Contents: read`),
   `Commit statuses: read`. A repository the token cannot see answers **404**, not 403. A visible
   repository with a missing permission answers *"Resource not accessible by personal access
   token"*, and the `X-Accepted-GitHub-Permissions` header names what is needed. [11][12]
10. **GHES (`https://HOST/api/v3`, GraphQL `https://HOST/api/graphql`):** rate limits are **off
    by default** (set by the admin). The same search parameters (`advanced_search`, `search_type`)
    are documented at 3.22. FG PATs exist there too, and the Checks API is again missing from the
    FG PAT endpoint list. [13][14]

## 1. Search across repositories

### Endpoint and token behaviour

`GET /search/issues?q=…&sort=…&order=…&per_page=…&page=…[&advanced_search=true][&search_type=…]` [3]

- FG PAT box on the endpoint: *"This endpoint works with … Fine-grained personal access tokens.
  The fine-grained token does not require any permissions. This endpoint can be used without
  authentication if only public resources are requested."* It is also listed on "Endpoints
  available for fine-grained personal access tokens". [3][15]
- Issues and PRs come back together. The note that you *must* add `is:issue` or `is:pull-request`
  (else 422) applies to **GitHub App user access tokens**, not PATs. [3] Adding `is:issue`/`is:pr`
  for the type filter is still the clean way to filter.
- `sort`: `comments`, `reactions`, `reactions-+1`, … , `interactions`, `created`, `updated`. The
  default is best match. `order` (`desc`/`asc`) is ignored without `sort`. [3]
- `search_type`: lexical by default. `semantic`/`hybrid` (GA 2026-04-02) "require authentication
  and are rate limited to 10 requests per minute". [3][16]
- Text highlights: `Accept: application/vnd.github.text-match+json` adds `text_matches`
  (fragments with offsets) for title, body and comment body. [3]

### What the token sees, and how unreadable repositories behave

From "Access errors or missing search results" [3]:

> You need to successfully authenticate and have access to the repositories in your search
> queries, otherwise, you'll see a `422 Unprocessable Entry` error with a "Validation Failed"
> message. For example, your search will fail if your query includes `repo:`, `user:`, or `org:`
> qualifiers that request resources that you don't have access to …
>
> When your search query requests multiple resources, the response will only contain the
> resources that you have access to and will **not** provide an error message listing the
> resources that were not returned.

Combined with the FG PAT model [1]:

- **No owner qualifier = all of public GitHub.** "Tokens always include read-only access to all
  public repositories", so `q=crash is:open` returns public results from everywhere. The picker
  should always scope by the connection's owner (`user:OWNER` or `org:OWNER`) or by the chosen
  `repo:` values.
- **The token does not say who its resource owner is.** No documented REST endpoint returns an
  FG PAT's resource owner or repository selection. Derive it from `GET /user/repos` (section 2),
  or ask the user at connect time. **Unconfirmed** whether a cheaper way exists.
- **Search hits in private repos outside the token's selection:** expected to be filtered out,
  as "only … the resources that you have access to". **Unconfirmed** for FG PATs with
  "Only select repositories". Verify with a recorded fixture.
- **Pending org approval:** while an org reviews the token it "will only be able to read public
  resources". Search then silently returns only public results. [1]
- **Also documented:** organisations can block FG PATs outright, and SAML SSO orgs need the
  token authorised (Enterprise Cloud). [1]

### Qualifiers the picker needs

From "Searching issues and pull requests" [17]:

| Filter | Qualifier | Notes |
| --- | --- | --- |
| Type | `is:issue`, `is:pr` (also `type:issue`, `type:pr`) | |
| Repository | `repo:OWNER/NAME` | Several: see dialects below |
| Owner | `user:LOGIN`, `org:ORG` | The connection's resource owner |
| State | `is:open`, `is:closed` (`state:open`), `is:merged`, `is:unmerged`, `draft:true` | `reason:"not planned"` for closed issues |
| Author | `author:LOGIN`, `author:@me`, `author:app/NAME` | Prefix `-` to exclude |
| Assignee | `assignee:LOGIN`, `no:assignee` | `assignee:*` only within one repo |
| Label | `label:bug label:ui` (AND), `label:bug,ui` (OR), `-label:wontfix`, `no:label` | Quote labels with spaces |
| Involvement | `involves:`, `mentions:`, `commenter:`, `review-requested:`, `reviewed-by:` | |
| Review state | `review:none\|required\|approved\|changes_requested` | PRs |
| CI status | `status:success\|failure\|pending` | Commit status of the head |
| Text | bare words; `in:title`, `in:body`, `in:comments` | Quote phrases |
| Dates | `created:>2026-01-01`, `updated:2026-10-01..2026-11-01`, `closed:`, `merged:` | |
| Visibility | `is:public`, `is:private`, `archived:false` | |

### Two dialects: legacy and `advanced_search=true`

- Changelog 2025-03-06 and 2025-07-17: REST `advanced_search=true` (GraphQL `type: ISSUE_ADVANCED`)
  enables `AND`/`OR` and parentheses. *"a space between multiple `repo`, `org`, and `user` filter
  qualifiers is treated as an `AND` operator"* there, while *"without advanced search, a space is
  treated as an `OR` operator."* *"API support for issues advanced search will remain opt-in."* [4][5]
- **Picking several repositories:**
  - **Legacy:** `repo:a/x repo:b/y crash` means x OR y, and costs no operators.
  - **Advanced:** write `(repo:a/x OR repo:b/y) crash`. Each extra repository spends one of the
    five operators [3], so about six repositories per query at most.
  - **Recommendation for the picker:** use legacy mode with space-separated `repo:` qualifiers, or
    `user:`/`org:` for "all repositories".
- **Not confirmed:** a third-party report that advanced search became the API default on
  2025-09-04. The 2025-07-17 changelog contradicts it ("remain opt-in"), and the current REST
  reference still documents `advanced_search` as an opt-in flag. Treat legacy as the default. [5]

### Limits on a query

From "About search" [3]:

- 1,000 results per search, `per_page` ≤ 100.
- "The REST API will find up to 4,000 repositories that match your filters".
- ≤ 256 characters "not including operators or qualifiers". More than five `AND`/`OR`/`NOT` gives
  "Validation failed".
- On timeout, returns partial matches with `incomplete_results: true`.

### GraphQL search

`search(query:, type: ISSUE|ISSUE_ADVANCED|ISSUE_SEMANTIC|ISSUE_HYBRID, first:)` also exists,
"returning a maximum of 1,000 results" (schema). [18] It is charged in GraphQL points, not the
REST `search` bucket. **Unconfirmed:** whether GraphQL search has its own per-minute cap
comparable to REST's 30/min.

## 2. Listing the repositories a token can read

`GET /user/repos`: "Lists repositories that the authenticated user has explicit permission (`:read`,
`:write`, or `:admin`) to access." [19]

- FG PAT box: works with FG PATs and needs `"Metadata" repository permissions (read)`. [19][11] (The GitHub UI adds Metadata: read to
  every FG PAT with repository access; **Unconfirmed** from the docs read here.)
- Parameters: `visibility` (`all|public|private`), `affiliation` (`owner,collaborator,organization_member`),
  `type` (422 if combined with `visibility`/`affiliation`), `sort` (`created|updated|pushed|full_name`),
  `direction`, `since`, `before`, `per_page` ≤ 100, `page`. Paginate with the `link` header
  (`rel="next"`). [19][20]
- Each repository's `owner.login` gives the token's resource owner (needed for `user:`/`org:`
  qualifiers).
- **Unconfirmed:** that with an FG PAT the list is exactly the token's selected repositories
  (with "All repositories", every repository of the owner). That is the expected behaviour (the
  docs say the token "will only be able to access resources owned by the selected resource
  owner"), but no page states it for this endpoint. Public repositories of *other* owners should
  not appear, since the user has no "explicit permission" on them. Verify with a real token and
  record it as a fixture.
- For the repository filter's values, `full_name`, `private`, `archived`, `pushed_at` from this
  list are enough. Cache it with its ETag (section 4).

## 3. Detail for the views

### Issue view

| Need | Call | FG PAT permission |
| --- | --- | --- |
| Title, body, state, labels, assignees, author, milestone, timestamps, `comments` count | `GET /repos/{o}/{r}/issues/{n}` | Issues: read |
| Comments | `GET /repos/{o}/{r}/issues/{n}/comments?per_page=100` | Issues: read **or** Pull requests: read |

- Labels and assignees are embedded in the issue. **2 requests**, plus one per extra 100
  comments.
- Body formats via media types (`raw`, `text`, `html`, `full`) on issues and comments. [8]
- "GitHub's REST API considers every pull request an issue … You can identify pull requests by
  the `pull_request` key." Issue endpoints work for PRs too, which is how a PR's conversation
  comments are read. [8]
- Optional: `GET /repos/{o}/{r}/issues/{n}/timeline` for events (labelled, closed,
  cross-referenced).

### Pull request view

| Need | Call | FG PAT permission |
| --- | --- | --- |
| Body, state, draft, merged/`merged_at`, `mergeable`, `mergeable_state`, `rebaseable`, labels, assignees, `requested_reviewers`, `additions`/`deletions`/`changed_files`/`commits`, `head.sha`, `base.ref`, `auto_merge` | `GET /repos/{o}/{r}/pulls/{n}` | Pull requests: read **or** Contents: read |
| Conversation comments | `GET /repos/{o}/{r}/issues/{n}/comments` | Issues: read or Pull requests: read |
| Reviews (state `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, …, chronological) | `GET /repos/{o}/{r}/pulls/{n}/reviews` | Pull requests: read |
| Changed files with per-file `additions`/`deletions`/`status`/`patch` | `GET /repos/{o}/{r}/pulls/{n}/files?per_page=100` | Pull requests: read |
| Checks (statuses only) | `GET /repos/{o}/{r}/commits/{head_sha}/status` | Commit statuses: read |
| Inline review comments (optional) | `GET /repos/{o}/{r}/pulls/{n}/comments` | Pull requests: read |
| Pending reviewers (optional; also on the pull) | `GET /repos/{o}/{r}/pulls/{n}/requested_reviewers` | Pull requests: read |
| Check runs (GitHub Actions etc.) | `GET /repos/{o}/{r}/commits/{ref}/check-runs` | **Not available to FG PATs** |

Sources: [8][10][11][21].

- **Request count:** **5 requests**: pull, comments, reviews, files and status, the last needing
  `head.sha` from the first. Add one per extra 100 comments, reviews or files. Inline review
  comments add one more.
- **Merge state:**
  - `mergeable` "can be true, false, or null. If the value is null, then GitHub has started a
    background job to compute the mergeability. After giving the job time to complete, resubmit
    the request." [8]
  - `mergeable_state` is in the schema, but its values are not documented on the REST page.
    GraphQL's `MergeStateStatus` enum (`BEHIND`, `BLOCKED`, `CLEAN`, `DIRTY`, `HAS_HOOKS`,
    `UNKNOWN`, `UNSTABLE`) is the documented equivalent. [18]
- **Review decision:** REST has no field for it. GraphQL `PullRequest.reviewDecision`
  (`APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`) gives it directly. In REST you can only
  derive it approximately, from each reviewer's latest review. [18]
- **Diff stats:**
  - The pull carries the totals.
  - `/files` "include[s] a maximum of 3000 files", 30 per page by default, 100 at most. `patch`
    is optional in the schema; when it is omitted is not documented.
  - `Accept: application/vnd.github.diff` on the pull returns the raw diff. [8]
- **Checks:** check runs need the Checks API, which FG PATs cannot call. See the next part.

### Checks with an FG PAT

- The Checks endpoints' FG box lists only "GitHub App user access tokens" and "GitHub App
  installation access tokens". `checks` is absent from "Endpoints available for fine-grained
  personal access tokens". The PAT docs list "Using fine-grained personal access token to call the
  Checks API" as a major gap. [1][10][15]
- The same box says the endpoint "can be used without authentication … if only public resources
  are requested". So check runs of **public** repositories are readable, though possibly only
  without the FG PAT in the header. **Unconfirmed** what happens when an FG PAT is sent for a
  public repository.
- The combined status endpoint (`Commit statuses: read`) works with FG PATs. It covers the older
  Statuses API (external CI posting statuses), **not** GitHub Actions check runs. [21]
- The GraphQL schema has `Commit.statusCheckRollup` and `Commit.checkSuites`. [18]
  **Unconfirmed:** whether an FG PAT can read check runs through GraphQL. Given the documented gap,
  assume it cannot until a recorded fixture shows otherwise.
- **Implication:** with FG PATs, the PR view's "checks" section can show commit statuses, plus
  check runs on public repositories at most. A full checks section needs a GitHub App or a classic
  PAT. That decision belongs to the auth tickets.
- The `status:success|failure|pending` search qualifier exists [17]. **Unconfirmed** whether it
  includes check runs.

### Is GraphQL cheaper?

- **Points:** a GraphQL call costs "the number of requests needed to fulfill each unique
  connection … divide the number by 100 and round … minimum … 1". [7] A single PR query with
  `first: 100` on comments, reviews, files, labels, assignees and the head commit's status needs
  roughly 6–10 connection requests, which rounds to **1 point**. The REST view costs 5 requests.
  Read the actual cost with `rateLimit { cost }`.
- **Fields REST lacks:** `reviewDecision`, `mergeStateStatus` and `latestReviews` come for free.
- **FG PAT access:** GraphQL accepts PATs ("select the 'issues:read' permission …", "All
  fine-grained personal access tokens include read access to public repositories"). [22]
- **Against GraphQL:**
  - No conditional requests, because it is `POST` and unsafe methods are unsupported [9]. Every
    refresh of a view costs again.
  - A 10-second timeout, which also "deduct[s] extra points". [7]
  - A second response shape and parser next to REST, whose search the picker uses anyway.
- **Trade-off:** GraphQL is cheaper to *open* a view (1 point vs 5 requests) and gives
  review/merge state directly. REST + ETag is cheaper to *re-open or refresh* an unchanged view,
  since 304s are free. At 5,000/hour either is far from the limit for one interactive user.

## 4. Limits and caching

### Primary limits [6][7][23]

| Bucket | Limit | Notes |
| --- | --- | --- |
| `core` (REST) | 5,000 requests/hour per user | All PATs and user-authorised apps share it. 15,000 applies to GitHub Apps owned by Enterprise Cloud orgs, not PATs. Unauthenticated: 60/hour per IP |
| `search` (REST) | 30 requests/minute | Separate from `core`; unauthenticated 10/min (observed: `x-ratelimit-resource: search`, limit 10). Semantic/hybrid: 10/min |
| `graphql` | 5,000 points/hour per user | 10,000 for Enterprise Cloud-owned Apps |
| `GET /rate_limit` | Free | "Accessing this endpoint does not count against your REST API rate limit". Use `resources.core`; `rate` is removed in API version `2026-03-10` |

- Headers: `x-ratelimit-limit`, `-remaining`, `-used`, `-reset` (epoch seconds), `-resource`.
  The headers are authoritative over `GET /rate_limit`. [6]
- The docs never name FG PATs specifically. They speak of "personal access token". **Unconfirmed**
  whether FG PATs get anything other than 5,000/hour.

### Secondary limits (shared REST + GraphQL) [6]

- At most 100 concurrent requests.
- 900 points/min for REST (GET = 1 point) and 2,000 for GraphQL.
- 90 s of CPU per 60 s.
- Exceeding a limit gives `403` or `429` with a message. Honour `retry-after`, else
  `x-ratelimit-reset`, else wait ≥ 1 minute, then back off exponentially. *"Continuing to make
  requests while you are rate limited may result in the banning of your integration."*
- Best practice: send requests serially, not concurrently, and follow `link` headers instead of
  building page URLs. [9]
- **Note for `api.ts`:** `verifyGithubToken` maps every **403** to "credential rejected". A 403
  can also be a rate limit, so check `x-ratelimit-remaining: 0` or `retry-after` first.

### ETags and conditional requests

- *"Making a conditional request does not count against your primary rate limit if a `304`
  response is returned and the request was made while correctly authorized with an
  `Authorization` header."* Send the saved `etag` in `if-none-match` (or `last-modified` in
  `if-modified-since`). "A different page size, page number, or filter produces a different
  response with a different `etag`." Unsafe methods are not supported. Same wording in the GHES
  docs. [9][13]
- **Observed (unauthenticated, public repository):**
  - ETags are present on `GET /pulls/1`, `/pulls/1/files`, `/pulls/1/reviews`,
    `/issues/1/comments` and `/commits/master/status`.
  - `/issues/1` returned a weak ETag (`W/"…"`) with `last-modified`.
  - Repeating with the same ETag gave **304**, but `x-ratelimit-used` still went up, consistent
    with "correctly authorized".
  - Changing the `Accept` header changed the ETag (`vary: Accept`), so the cache key must include
    the Accept header and the credential.
- **Search:** `GET /search/issues` returned `cache-control: no-cache` and **no ETag**
  (unauthenticated). The REST reference still lists `304` among its status codes. **Unconfirmed**
  whether an authenticated search ever yields an ETag or 304. Even if it did, the docs only exempt
  304s from the *primary* limit, and search counts against the separate `search` bucket. Do not
  plan on cheap repeated searches. Debounce the picker instead.
- **Caveat:** the ETag covers only the one resource. An issue's ETag does not change when only
  its comments change, so each list is validated separately.
- **Unconfirmed:** whether FG-PAT-authorised 304s are exempt in practice. The docs say
  "correctly authorized" without naming token types.

## 5. Permissions and how a missing one shows up

### Minimal FG PAT for the slice

Repository permissions [11]:

- **Metadata: read**, for the repository list. It is reportedly added automatically
  (**Unconfirmed** in the docs read here).
- **Issues: read**.
- **Pull requests: read**.
- **Commit statuses: read**, only if the PR view shows statuses.

Search needs no permission. **Contents: read** is not needed, since `Pull requests: read`
already satisfies `GET /pulls/{n}`.

### Failure modes

| Situation | Response | Source |
| --- | --- | --- |
| Repository outside the token's owner/selection, or the token is unauthenticated for it | **404** — "GitHub uses a `404 Not Found` response instead of a `403 Forbidden` response to avoid confirming the existence of private repositories." | [12] |
| Repository visible (Metadata), permission missing (e.g. no Issues: read) | Error message *"Resource not accessible by personal access token"* plus header `X-Accepted-GitHub-Permissions: issues=read` (alternatives separated by `;`) | [12] |
| Search with an unreadable `repo:`/`org:`/`user:` | **422** "Validation Failed" | [3] |
| Search across several repositories, some unreadable | 200, unreadable ones silently omitted | [3] |
| Org approval pending | Only public resources readable (private ones then look like 404) | [1] |
| Expired/revoked token | 401 (existing `verifyGithubToken` handles it) | [12] |

- **Unconfirmed:** the HTTP status for "Resource not accessible by personal access token". The
  troubleshooting page gives the message but not the code. Community reports say **403**. Treat 403 + this message as "permission missing", distinct from a 403 rate limit
  (`x-ratelimit-remaining: 0`).
- The 404 case is ambiguous: it cannot be told apart from "does not exist". For the view, show
  "not found or not shared with this token".

## 6. GitHub Enterprise Server

- **Base URLs:** REST `http(s)://HOSTNAME/api/v3`, GraphQL `http(s)://HOSTNAME/api/graphql`. [14]
- **Rate limits:** *"Rate limits are disabled by default for GitHub Enterprise Server. Contact
  your site administrator …"* Secondary-limit figures are the same if enabled. Code must still
  honour the headers when present, and must not assume they are. [13]
- **FG PATs:** documented on GHES. A GitHub roadmap item says GA shipped in GHES 3.17 (dotcom GA
  2025-03-18). **Unconfirmed** from GHES release notes, and the minimum GHES version that supports
  them for these endpoints is **Unconfirmed** too. [24]
- **Search:** the GHES 3.22 reference documents the same `/search/issues` with `advanced_search`
  and `search_type`. Older GHES versions may lack them. **Unconfirmed** which version introduced
  each. [14]
- **Checks:** the GHES 3.22 FG PAT endpoint list also has no `checks` section. Same gap. [14]
- **API version:** dotcom has released `2026-03-10`, and `2022-11-28` stays supported for ≥ 24
  months after it. Which versions a given GHES accepts is per release, so keep sending
  `X-GitHub-Api-Version: 2022-11-28` for now. [25]

## Sources

1. Managing your personal access tokens — https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
2. Endpoints available for fine-grained PATs — https://docs.github.com/en/rest/authentication/endpoints-available-for-fine-grained-personal-access-tokens
3. REST API endpoints for search — https://docs.github.com/en/rest/search/search
4. Changelog 2025-03-06, issues advanced search in the API — https://github.blog/changelog/2025-03-06-github-issues-projects-api-support-for-issues-advanced-search-and-more/
5. Changelog 2025-07-17 (advanced search API "remain opt-in") — https://github.blog/changelog/2025-07-17-duplicate-issues-create-from-anywhere-and-more/
6. Rate limits for the REST API — https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
7. Rate limits and query limits for the GraphQL API — https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
8. REST pulls and issues references — https://docs.github.com/en/rest/pulls/pulls, https://docs.github.com/en/rest/pulls/reviews, https://docs.github.com/en/rest/issues/issues, https://docs.github.com/en/rest/issues/comments
9. Best practices for using the REST API — https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
10. REST check runs — https://docs.github.com/en/rest/checks/runs
11. Permissions required for fine-grained PATs — https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
12. Troubleshooting the REST API — https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api
13. GHES rate limits and best practices — https://docs.github.com/en/enterprise-server@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api, https://docs.github.com/en/enterprise-server@latest/rest/using-the-rest-api/best-practices-for-using-the-rest-api
14. GHES quickstart, GraphQL calls, search and FG PAT endpoint list (3.22) — https://docs.github.com/en/enterprise-server@latest/rest/quickstart, https://docs.github.com/en/enterprise-server@latest/graphql/guides/forming-calls-with-graphql, https://docs.github.com/en/enterprise-server@latest/rest/search/search, https://docs.github.com/en/enterprise-server@latest/rest/authentication/endpoints-available-for-fine-grained-personal-access-tokens
15. See [2]; the `## search` section lists `GET /search/issues`, and there is no `## checks` section.
16. Changelog 2026-04-02, improved search for issues GA — https://github.blog/changelog/2026-04-02-improved-search-for-github-issues-is-now-generally-available/
17. Searching issues and pull requests — https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
18. GitHub public GraphQL schema — https://docs.github.com/public/fpt/schema.docs.graphql (`PullRequest`, `MergeStateStatus`, `PullRequestReviewDecision`, `SearchType`, `Commit`)
19. List repositories for the authenticated user — https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user
20. Using pagination in the REST API — https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api
21. REST commit statuses — https://docs.github.com/en/rest/commits/statuses
22. Forming calls with GraphQL — https://docs.github.com/en/graphql/guides/forming-calls-with-graphql
23. REST rate limit endpoint — https://docs.github.com/en/rest/rate-limit/rate-limit
24. Changelog 2025-03-18, fine-grained PATs GA — https://github.blog/changelog/2025-03-18-fine-grained-pats-are-now-generally-available/
25. REST breaking changes / API versions — https://docs.github.com/en/rest/about-the-rest-api/breaking-changes

[observed]: unauthenticated `curl` against `api.github.com` on 2026-11-12, public repository
`octocat/Hello-World`, no credentials.
