# Confluence Cloud's REST API and CQL for picking and reading pages

Research for issue #49. Question: what does Confluence Cloud's REST API offer for picking and
reading pages with a **user's own Atlassian API token** (email + token, HTTP basic auth)? These
are the facts that a later "does our design take Confluence without special cases" check needs.

- **Researched:** 2026-11-13, against developer.atlassian.com (Confluence Cloud REST v1 and v2
  reference, CQL reference, rate limiting, basic auth, OAuth 2.0 (3LO), scopes, Marketplace
  security requirements) and support.atlassian.com (API tokens, cloud ID).
- **Shapes come from Atlassian's published OpenAPI specs**, downloaded the same day:
  v2 `https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json` (info.version
  `2.0.0`, 165 paths) and v1 `https://dac-static.atlassian.com/cloud/confluence/swagger.v3.json`
  (info.version `1.0.0`). These are the files behind the rendered reference pages. [1][2]
- **No token was used.** Nothing here was observed against a live site. Anything that needs a
  token to see (exact error bodies, real header values, URL shapes) is marked **Unconfirmed**.
- "v1" means `https://<site>.atlassian.net/wiki/rest/api/…`. "v2" means
  `https://<site>.atlassian.net/wiki/api/v2/…`.

## Summary: the facts later decisions depend on

1. **Search lives only in v1.** v2 has no search or CQL endpoint (none of its 165 paths). Pickers
   use `GET /wiki/rest/api/search?cql=…`, which the current v1 spec does **not** mark deprecated.
   Reading a page uses v2 `GET /wiki/api/v2/pages/{id}`. The v1 `GET /content/{id}` and
   `GET /space` are no longer in the published v1 spec at all. A Confluence connection therefore
   talks to **two API versions**: v1 for search, v2 for everything else. [1][2]
2. **A token sees what its user sees.** "If you … do not have permission to view something in
   Confluence, you will not be able to view it using the Confluence REST API either." Search,
   `GET /spaces` and `GET /pages` return only what the user may view. No per-space grant exists
   on the token. **Scoped** tokens narrow *operations* (scopes), not spaces. [3][1][2]
3. **Two kinds of API token.** Unscoped ("classic") tokens call `https://<site>.atlassian.net`.
   Tokens **with scopes** must call the gateway `https://api.atlassian.com/ex/confluence/{cloudId}/…`,
   still with email + token basic auth. `cloudId` comes from
   `https://<site>.atlassian.net/_edge/tenant_info`. Tokens expire after 1–365 days (default one
   year). [4][5][6]
4. **Policy risk:** Atlassian's basic-auth page warns that apps which "collect API tokens … don't
   comply with our Security requirements for cloud apps and Acceptable use policy". Marketplace
   requirement: "must not collect or store credentials belonging to Atlassian user accounts such as
   … user API tokens". That binds Marketplace apps. A personal-token connection design is fine for
   a prototype but is **not** a path Atlassian endorses for a shipped product. OAuth 2.0 (3LO) is. [3][7]
5. **Errors:** v2 documents **401** (bad or missing credentials) and **404** for "does not have
   permission to view … or … was not found". There is **no documented 403 on v2 reads**:
   forbidden and not-found are the same 404. v1 search documents **400** (CQL cannot be parsed)
   and **403** (no permission to use Confluence). Rate limiting is **429** on any endpoint. v1 error
   bodies are `{statusCode, data:{authorized, valid, errors[], successful}, message}`. v2 error
   bodies are **Unconfirmed** (two v2 schemas use `{errors:[{status, code, title, detail}]}`). [1][2][8]
6. **Rate limits for API tokens are burst limits, not points.** Points-based hourly quotas
   (65,000 points/hour global pool, enforced from 2026-03-02) "apply to all Forge, Connect, and OAuth
   2.0 (3LO) apps … **API token-based traffic is not affected by this change, and will continue to
   be governed by existing burst rate limits.**" Confluence publishes no burst thresholds. A 429
   carries `Retry-After` (seconds) and `X-RateLimit-Limit/-Remaining/-Reset`, plus
   `RateLimit-Reason`. Responses may carry `X-RateLimit-NearLimit` and `Beta-*` headers. [9]
7. **CQL covers the picker.** `type = page`, `space in (A, B)`, `title ~ "x"`, `text ~ "x"`
   (title + body + labels), `contributor = currentUser()` / `creator` / `mention` / `watcher` /
   `favourite`, and `id in recentlyViewedContent(n)` (≤ 200). `siteSearch` is **not** in the Cloud
   CQL reference. `order by lastmodified desc` is **Unconfirmed** in the docs (they only show
   `order by created`). [10][11][12][13]
8. **Search paging is cursor-based** through `_links.next`. Default `limit` is 25. The maximum is "restricted
   by fixed system limits" and is not documented. With body expansions the cap is 50
   (`body.storage`) or 25 (`export_view`/`styled_view`). The response carries `totalSize`. [2][10]
9. **One page view costs ≥ 3 requests:** page (1), root footer comments (≥ 1), root inline comments
   (≥ 1). Add **one request per root comment that has replies**, since v2 returns only root comments.
   Add the space (1, cacheable, batchable by `ids`) and authors via `POST /users-bulk` (1 per ≤ 250
   ids). Comment lists page at up to **250** per request. [1]
10. **Body formats:** v2 `body-format` takes `storage` (XHTML-based XML), `atlas_doc_format`
    (ADF JSON, returned as a string), `view`, `export_view`, `anonymous_export_view`, `styled_view`
    or `editor`. Atlassian ships **no ADF→Markdown or storage→Markdown converter**. The official
    `@atlaskit/editor-markdown-transformer` only parses Markdown. Its `encode()` throws
    "This is not implemented yet". [1][14][15]
11. **Key:** the page `id` (a numeric string in v2) is the stable key within one site. The pageId
    URL format "will retain the same pageId reference even if the page is renamed or moved". That
    statement is in a Data Center KB, and Cloud is **Unconfirmed**. IDs do **not** survive a
    server→cloud migration. The web URL is `_links.base` + `_links.webui`, and `tinyui` is a short link. [1][16][17]

## 1. Auth: Atlassian API token over basic auth

### How a request authenticates

- Basic auth with "Atlassian account email" as user and the API token as password, e.g.
  `curl -u <email>:<api_token> https://<your-domain.atlassian.net>/wiki/rest/api/space`. Or send
  `Authorization: Basic base64(email:token)` yourself. [3]
- Both v1 and v2 intros: when "authenticating directly against the REST API, the REST API supports
  basic auth", and "authorization is based on the user used in the authentication process". [8][18]
- **No auth challenge:** "Because Confluence permits a default level of access to anonymous users,
  it does not supply a typical authentication challenge." Always send the header pre-emptively.
  Without it you are anonymous ("if you do not log in, you are accessing Confluence anonymously").
  So a dropped header can look like "empty results" rather than a 401 on sites with anonymous
  access. That last point is **Unconfirmed**. [3]

### What the token can read

- The REST API "is protected by the same restrictions which are provided via Confluence's standard
  web interface". The token reads exactly what its user can read, including page restrictions. [3]
- Endpoints say so one by one. Search: "only entities that the user has permission to view will
  be returned". `GET /spaces`: "Only spaces that the user has permission to view will be
  returned". `GET /pages/{id}`: "Permission to view the page and its corresponding space". [2][1]

### Scoped vs unscoped API tokens [4]

- Created at `id.atlassian.com/manage/api-tokens`. You can create a token "with or without
  scopes". Atlassian recommends scopes "because it's more secure".
- **Scoped tokens need the gateway.** "You need to call the Atlassian API to use API tokens with
  scopes for … Confluence `https://api.atlassian.com/ex/confluence/{cloudId}`". Example:
  `curl -v https://api.atlassian.com/ex/confluence/{cloudId} --user me@example.com:my-api-token`.
  This is still basic auth. Only the host and path prefix change.
- The 3LO docs give the gateway path as `https://api.atlassian.com/ex/confluence/{cloudid}/{api}`
  with `{api}` e.g. `/rest/api/space`. That example has **no** `/wiki` prefix. Whether v2 is
  reached as `…/{cloudId}/wiki/api/v2/pages/{id}` through the gateway is **Unconfirmed**. [5]
- **cloudId:** `https://<site>.atlassian.net/_edge/tenant_info` returns `{"cloudId":"…"}`. [6]
  (`/oauth/token/accessible-resources` is documented for OAuth access tokens, not for API tokens.) [5]
- **Scopes the slice would need**, read from each operation's `x-atlassian-oauth2-scopes` in the
  specs [1][2][19]:

| Operation | Scope(s) listed |
| --- | --- |
| v1 `GET /wiki/rest/api/search` | `search:confluence` (classic, "Current"); granular `read:content-details:confluence` ("Beta") |
| v2 `GET /pages/{id}`, `GET /pages` | `read:page:confluence` |
| v2 `GET /spaces`, `GET /spaces/{id}` | `read:space:confluence` |
| v2 `GET /pages/{id}/footer-comments`, `/inline-comments`, `/…-comments/{id}/children` | `read:comment:confluence` |
| v2 `POST /users-bulk` | `read:user:confluence` |

  Whether one scoped API token can mix the classic `search:confluence` with granular `read:*`
  scopes is **Unconfirmed**. The token page links both "Confluence scopes" and "Confluence
  classic scopes". [4]

### Expiry [4]

- "After December 15, 2024, we set new API tokens to expire in one year by default." Expiry can be
  set to "1 to 365 days". Older tokens were set to expire between 2026-03-14 and 2026-05-12.
- An expired token's response (status and body) is **Unconfirmed**. Expect 401.

### Error responses (for an unauthorized / forbidden / rate-limited / not-found union)

| Case | What the docs say | Source |
| --- | --- | --- |
| Unauthorized | v2: **401** "if the authentication credentials are incorrect or missing from the request" (on every v2 operation used here). v1 `/search` documents no 401 | [1][2] |
| Forbidden | v1 `/search`: **403** "if the calling user does not have permission to access Confluence" (no product access). v1 `/user/current`: 403 same. v2 page/space/comment reads: **no 403 documented** | [1][2] |
| Not found (incl. no permission) | v2 `GET /pages/{id}`: **404** "if the calling user does not have permission to view the requested page or the page was not found". Same wording for `/spaces/{id}` and comment lists | [1] |
| Bad query | v1 `/search`: **400** "if the CQL query cannot be parsed". v2: 400 "invalid request" | [2][1] |
| Rate-limited | **429** from "any REST API" with `Retry-After` (see §6) | [9] |

- **v1 error body** (v1 intro): `{"statusCode": 404, "data": {"authorized": false, "valid": false,
  "errors": [{"message": {"translation": "…", "args": []}}], "successful": false}, "message": "…"}`. [8]
- **v2 error body:** the v2 spec leaves error responses of these operations with no content
  schema. Two newer v2 schemas (`ContentPermissionErrorResponse`, `DatabaseErrorResponse`)
  "follow the Atlassian REST API error standard": `{"errors": [{"status", "code", "title",
  "detail"}]}`. Whether page/space/comment errors use that envelope is **Unconfirmed**. [1]
- A scoped token that lacks a needed scope: status and body **Unconfirmed**.
- Map by **status code**, not body. 401 → unauthorized. 403 (v1 only) → forbidden. 404 →
  not-found, which on v2 also covers "exists but you can't see it". 429 → rate-limited.

### Who am I

- v2 has no "current user" endpoint. v1 `GET /wiki/rest/api/user/current` "Returns the currently
  logged-in user" (accountId, display name, …). It needs the 'Can use' permission and documents a
  403. It is the cheap way to validate a token and learn the accountId. [2]

## 2. Search: CQL through v1 `/wiki/rest/api/search`

### Endpoints

- `GET /wiki/rest/api/search?cql=…&limit=…&cursor=…&excerpt=…&includeArchivedSpaces=…&expand=…` [2]
- `GET /wiki/rest/api/content/search?cql=…` also exists. It returns `Content` objects, not
  search results with excerpts. [2]
- **v2 has no search.** The v2 spec contains no search/CQL path. [1] Atlassian staff on the
  developer forum: "CQL queries / the v1 Search content endpoint are not affected by the current
  v1 deprecations. … may be deprecated in the future, but only if we have an equivalent v2
  endpoint". That is a forum statement, not docs. [20]
- **Deprecation in force:** `/wiki/rest/api/search` "no longer support[s] user-specific fields like
  `user`, `user.fullname`, `user.accountid`, and `user.userkey`". User search moved to
  `/wiki/rest/api/search/user` (since 20 Jan 2020). The content fields `creator`, `contributor`,
  `mention` etc. still work. [2][21][11]

### Scoping

- **To readable spaces:** implicit. Results contain only what the user may view. Archived spaces
  are **excluded by default** (`includeArchivedSpaces=false`). `excludeCurrentSpaces=true` flips
  to archived only. [2]
- **To chosen spaces:** `space in (DEV, QA)` or `space = DEV`. Quote keys that start with a digit:
  `space in ("3C", "4C")`. The `space` field takes **keys**, not v2 numeric space ids. [11]
- `cqlcontext={"spaceKey":"TEST","contentId":"123","contentStatuses":…}` is a separate context
  parameter. It is not needed for scoping. [2]
- `favouriteSpaces()` and `recentlyViewedSpaces(limit)` return space keys for `space in (…)`. [12]

### Text vs title matching [10][11][13]

| Clause | Matches |
| --- | --- |
| `title ~ "win*"` | title, Lucene text search (stemming, wildcards) |
| `title = "\"Exact Title\""` | exact title (`title` supports `=`, `!=`, `~`, `!~`) |
| `text ~ "foo"` | "master-field": **title, content body, labels**, "the same fields used by Confluence's search user interface" |
| `space.title ~ "x"` | space name |
| `siteSearch ~ "x"` | **not in the Cloud CQL field list.** Documented only for Data Center. Use on Cloud is **Unconfirmed** |

- Text-search syntax: terms are case-insensitive. A phrase needs escaped quotes
  (`text ~ "\"hello dolly\""`). `?`/`*` wildcards must be quoted and cannot lead a term. Fuzzy is
  `roam~`. [13]
- `CONTAINS` (`~`) works only on text fields: `title`, `text`, `space.title`. [10]

### Type, ordering, "involves me"

- **Pages only:** `type = page`. Types: `page`, `blogpost`, `comment`, `attachment`, `whiteboard`,
  `database`, `embed`, `folder`. [11]
- **Ordering:** `ORDER BY field [asc|desc]`. "Not all fields support Ordering". The docs show only
  `order by created` / `order by created desc, title`. `order by lastmodified desc` is
  **Unconfirmed** from docs. `lastmodified` is a DATE field with range operators and the
  `startOfDay()`…`endOfYear()` functions (e.g. `lastmodified < startOfYear()`). The docs show
  `now("-4w")` only with `created`. [10][11]
- **"Involves me" before typing** (`currentUser()` supports Creator, Contributor, Mention, Watcher,
  Favourite, and the Owner field lists it too) [11][12]:

| Signal | CQL |
| --- | --- |
| I created or edited it | `contributor = currentUser()` ("created or edited by") |
| I created it | `creator = currentUser()` |
| I own it | `owner = currentUser()` |
| It mentions me | `mention = currentUser()` |
| I watch it | `watcher = currentUser()` |
| I starred it | `favourite = currentUser()` (only the logged-in user's favourites) |
| I viewed it recently | `id in recentlyViewedContent(limit, offset)`, limit + offset ≤ 200 |

  `currentUser()` "can only be used by logged-in users". Example suggestion query:
  `type = page and (contributor = currentUser() or mention = currentUser()) order by lastmodified desc`
  (the ordering field is **Unconfirmed**, as above).

### Paging [2][8][10]

- **Cursor.** "When additional results are available, returns `next` and `prev` URLs … The URLs
  each contain a cursor". Follow `_links.next` (relative to `_links.base`/`context`).
- `start` (offset) and `limit` parameters also exist. How `start` interacts with cursors is
  **Unconfirmed**. Use `_links.next`.
- `limit` default **25**. The maximum is undocumented: "this may be restricted by fixed system
  limits". With `expand=body.export_view`/`body.styled_view` the cap is **25**. Per the CQL page,
  with `expand=body.storage.value` it is **50**, and "the response will not call out that the
  results are arbitrarily limited".
- The response object carries `results`, `start`, `limit`, `size`, **`totalSize`**, `cqlQuery`,
  `searchDuration`, optional `archivedResultCount`, and `_links`. Whether `totalSize` is exact for
  large result sets is **Unconfirmed**.

### A search result item (`SearchResult`) [2]

Required: `title`, `excerpt`, `url`, `lastModified` (date-time), `entityType`, `iconCssClass`,
`breadcrumbs[]`. Optional: `content`, `space`, `user`, `resultParentContainer`,
`resultGlobalContainer`, `friendlyLastModified`, `score`.

- `content`: a v1 `Content` with `id`, `type` (`page`…), `status`, `title`, `_links`, and
  `_expandable` (for `space`, `version`, `history`, `body`, `ancestors`…). Space key/name in the
  item need `expand=content.space`, or read `resultGlobalContainer` (`{title, displayUrl}`). That
  container being the space is **Unconfirmed**.
- `url`: a relative web path. Its exact shape is **Unconfirmed**.
- `excerpt` strategy: `highlight` (default), `indexed`, `none`, `highlight_unescaped`,
  `indexed_unescaped`. The highlight markup in `title`/`excerpt` (e.g. `@@@hl@@@…@@@endhl@@@`) is
  **Unconfirmed**. Use `excerpt=none` or strip it.

### A CQL-free alternative for browse lists

v2 `GET /pages?space-id=…&sort=-modified-date&limit=…` (≤ 100 space ids, `limit` ≤ 250) lists
recently modified pages in chosen spaces, with cursor paging. Its `title` filter is an
exact-match filter, not text search. No free text, no "involves me". [1]

## 3. A page: v2 `GET /wiki/api/v2/pages/{id}`

### Request [1]

`GET /wiki/api/v2/pages/{id}?body-format=atlas_doc_format` (scope `read:page:confluence`).
Optional flags: `get-draft`, `status[]`, `version` (an older version), and `include-labels`,
`include-properties`, `include-operations`, `include-likes`, `include-versions`,
`include-version` (default **true**), `include-favorited-by-current-user-status`,
`include-webresources`, `include-collaborators`, `include-direct-children`. Each `include-*` list
is capped at 50 with `meta`/`_links` for more.

### Response shape (`PageSingle` + `_links.base`) [1]

| Field | Meaning |
| --- | --- |
| `id` | string (the path param is int64) |
| `status` | `current`, `draft`, `archived`, `historical`, `trashed`, `deleted` (`any` in the enum for filtering) |
| `title` | |
| `spaceId` | numeric-string space id, **not** the key |
| `parentId`, `parentType` (`page`, `whiteboard`, `database`, `embed`, `folder`), `position` | tree placement |
| `authorId` | "account ID of the user who created this page originally" |
| `ownerId`, `lastOwnerId` | current and previous owner (nullable) |
| `createdAt` | ISO date-time |
| `version` | `{number, createdAt, message, minorEdit, authorId}`. `createdAt` = last updated, `authorId` = last editor |
| `body` | `{storage?, atlas_doc_format?, view?}` each `{representation, value}` (value is a string; for ADF a JSON string) |
| `_links` | `webui`, `editui`, `tinyui`, and `base` ("Base url of the Confluence site") |

- **Space key/name:** `GET /wiki/api/v2/spaces/{spaceId}` → `key`, `name`, `type`, `status`,
  `homepageId`, `_links.webui`. Or batch with `GET /spaces?ids=1,2,…` (≤ 250). [1]
- **People:** ids only (`authorId`, `ownerId`, `version.authorId`). Names come from
  `POST /wiki/api/v2/users-bulk` `{"accountIds": [...]}` (1–250 ids, scope `read:user:confluence`).
  The v1 equivalent `GET /user/bulk` "returns a maximum of 100 results". [1][2]
- **Status default:** the `status` filter on `GET /pages/{id}` has no documented default. Whether
  a trashed or archived page answers 200 or 404 without `status=` is **Unconfirmed**. (`GET /pages`
  defaults to `current` and `archived`.) [1]

### Body formats and Markdown

- Accepted `body-format` on `GET /pages/{id}`: `storage`, `atlas_doc_format`, `view`,
  `export_view`, `anonymous_export_view`, `styled_view`, `editor`. List endpoints (comments,
  `GET /pages`) accept only `storage` and `atlas_doc_format`. The response schema names only
  `storage`, `atlas_doc_format` and `view`. How the other formats come back in `body` is
  **Unconfirmed**. [1]
- **`storage`** is "XHTML-based". "Technically, it's XML … Confluence includes custom elements for
  macros". It uses `ac:`/`ri:` namespaced elements (e.g. `ac:structured-macro`, `ri:page`). The
  format reference Atlassian publishes is the Data Center one. [15]
- **`atlas_doc_format`** is ADF: "a JSON object" with `version: 1`, `type: "doc"`, `content[]`
  nodes and marks. JSON schema at `http://go.atlassian.com/adf-json-schema`. [14] Macros appear
  as extension nodes with parameters. The macro *output* is not in ADF. That ADF extension-node
  detail for Confluence macros is **Unconfirmed** (Atlassian's per-node docs for extensions 404'd).
- **`view` / `export_view`** are rendered HTML with macros expanded. Server-side conversion is
  also available in v1: `POST /wiki/rest/api/contentbody/convert/async/{to}` converts
  `storage` → `atlas_doc_format`/`editor`/`export_view`/`styled_view`/`view` and
  `atlas_doc_format` → `storage`/…. It is asynchronous: poll for a result that stays "available for 5 minutes". [2]
- **Markdown: no official converter.** `@atlaskit/editor-markdown-transformer@6.3.2` (MIT) has
  `parse()` (Markdown → ProseMirror) but `encode()` is
  `throw new Error('This is not implemented yet')` (checked in the published package source).
  `@atlaskit/adf-utils` (Apache-2.0) gives "utilities to traverse, modify and create ADF
  documents". Atlassian packages are released from `bitbucket.org/atlassian/atlassian-frontend-mirror`. [22]
- **Trade-off:**
  - **ADF** is typed JSON, so a walker (e.g. `adf-utils` traverse) can map nodes → Markdown
    deterministically. Unknown nodes (macros, panels, layouts, media) need explicit fallbacks.
  - **storage** is XML with Confluence-specific elements. A generic HTML→Markdown tool would
    drop or mangle `ac:` macros.
  - **view/export_view** is plain HTML that a generic HTML→Markdown tool handles, and macro
    output is already rendered. It costs fidelity (CSS/markup noise) and has a lower cap in
    v1 bulk expansions.
  - Picking one is a design decision. No source settles it.

### Comments (v2) [1]

| Endpoint | Returns |
| --- | --- |
| `GET /pages/{id}/footer-comments` | **root** footer comments |
| `GET /pages/{id}/inline-comments` | **root** inline comments, filter `resolution-status[]` = `open`/`reopened`/`resolved`/`dangling` |
| `GET /footer-comments/{id}/children`, `GET /inline-comments/{id}/children` | replies to one comment |

- Paging: cursor in the `Link` header (`rel="next"`) and in `_links.next`. `limit` 1–**250**,
  default 25. `sort`: `created-date`, `-created-date`, `modified-date`, `-modified-date`. There
  is **no total count**. [1][18]
- Body via `body-format` = `storage` or `atlas_doc_format` only.
- Item: `id`, `status`, `title`, `pageId` (root) or `parentCommentId` (child), `version`
  (`authorId` = author, `createdAt`), `body`, `_links.webui`. Inline items also carry
  `resolutionStatus` and `properties.inlineMarkerRef` ("used to reference the highlighted element
  in DOM") and `properties.inlineOriginalSelection` ("Text that is highlighted"). [1]
- No reply count on a root comment. So finding replies costs one children request per root
  comment, whether or not it has replies. That no cheaper bulk path exists is **Unconfirmed**. The
  site-wide `GET /footer-comments` has no page filter. [1]

### Requests per page view

| Request | Count |
| --- | --- |
| `GET /pages/{id}?body-format=…` | 1 |
| `GET /pages/{id}/footer-comments?limit=250` | 1 per 250 root comments |
| `GET /pages/{id}/inline-comments?limit=250` | 1 per 250 root comments |
| `GET /footer-comments/{id}/children` / `GET /inline-comments/{id}/children` | 1 per root comment (to find replies) |
| `GET /spaces/{spaceId}` | 1, cacheable per space |
| `POST /users-bulk` | 1 per 250 distinct authors |

So a page with no comments costs **3** (page + two empty comment lists), plus the space and users
lookups unless cached. Each root comment adds a children call. Under the points model each read
"starts with a base cost of 1 point" plus 1 per core object, and users cost 2 points per object.
That model applies to apps, not API-token traffic (§6). [9]

## 4. Key and URL

- **Key:** `id` of the page (v2 returns a string, e.g. `"123456"`; paths take int64). The Data
  Center KB says "each page has a unique pageId value" and the pageId URL "will retain the same
  pageId reference even if the page is renamed or moved to a different location". [16] Cloud
  docs that state the same are **Unconfirmed**, but nothing in v2 suggests ids change on rename or
  move (`PUT /pages/{id}/title` renames by id). [1]
- **Scope of uniqueness:** unique per site. Ids are **not** portable across sites: "Some content
  objects don't retain the same ID values as they had on the source (for example: Page IDs for
  Confluence)" after a server→cloud migration. A connection key should be (site or cloudId, page
  id). [17]
- Ids share a namespace with other content types. v2 has `POST /content/convert-ids-to-types` to
  resolve an id's type. [1]
- **Web URL:** v2 returns `_links.base` ("Base url of the Confluence site") and `_links.webui`
  ("Web UI link of the content"), plus `tinyui` (short link) and `editui`. Build
  `base + webui`. The exact values (`https://<site>.atlassian.net/wiki` and
  `/spaces/<KEY>/pages/<id>/<Title>`) are **Unconfirmed** without a live response. v1 search
  results also carry `_links.base` at the top level and relative `url`/`content._links.webui` per
  item. [1][2]
- Through the gateway (scoped tokens), `_links.base` may point at `api.atlassian.com` rather than
  the site. **Unconfirmed**. Store the site URL from connect time and don't trust `base` for
  browser links.

## 5. Reach: listing readable spaces (v2 `GET /wiki/api/v2/spaces`) [1]

- "Only spaces that the user has permission to view will be returned". Needs the "'Can use'
  global permission". Scope `read:space:confluence`.
- Paging: cursor, `limit` 1–**250** (default 25), next page via the `Link` header / `_links.next`.
  **No total count**. To say "N spaces" you must page through all of them.
- Filters: `ids` (≤ 250), `keys` (≤ 250), `type` (`global`, `collaboration`, `knowledge_base`,
  `personal`, `system`, `onboarding`, `xflow_sample_space`), `status` (`current`, `archived`,
  `trashed`), `labels`, `favorited-by`/`not-favorited-by` (accountId). `sort`: `id`, `key`, `name`
  (± for direction). Default order is id ascending.
- Item (`SpaceBulk`): `id`, `key`, `name`, `type`, `status`, `authorId`, `spaceOwnerId`,
  `currentActiveAlias`, `createdAt`, `homepageId`, `description`, `icon` (with `include-icon`),
  `_links.webui`.
- For the space filter: list `status=current` spaces, show `name`, and feed the chosen **keys**
  into CQL `space in (…)`. (`favouriteSpaces()` covers "my starred spaces" inside CQL.) [12]

## 6. Rate limits [9]

### What applies to an API token

- Points-based quotas (Global Pool **65,000 points/hour**, Per-Tenant Pool by edition, reset each
  UTC hour) were announced for enforcement "on March 2, 2026" and "will apply to all Forge,
  Connect, and OAuth 2.0 (3LO) apps". The same notice: "**API token-based traffic is not affected
  by this change, and will continue to be governed by existing burst rate limits.**"
- Burst limits: "evaluated over short time windows (typically seconds)". "Certain high-impact
  endpoints (Permissions, **Search**, Admin operations) enforce additional burst protections".
  Confluence publishes **no burst thresholds**. (Jira's page gives per-endpoint token-bucket
  numbers, e.g. "10 requests/second for GET endpoints". Those are Jira's and not confirmed for
  Confluence.) [9][23]
- "Do not perform rate limit testing against Atlassian cloud tenants".

### Response and headers

- **429 Too Many Requests**. "Any REST API can return a rate limit response." Documented example:

  ```
  HTTP/1.1 429 Too Many Requests
  Retry-After: 1847
  X-RateLimit-Limit: 40000
  X-RateLimit-Remaining: 0
  X-RateLimit-Reset: 2025-10-08T15:00:00Z
  RateLimit-Reason: confluence-quota-global-based
  ```

| Header | Meaning |
| --- | --- |
| `Retry-After` | seconds to wait. "Only returned with 429 responses". Some 503s also send it |
| `X-RateLimit-Limit` | max rate for the current scope (for burst: requests per second) |
| `X-RateLimit-Remaining` | remaining capacity in the window |
| `X-RateLimit-Reset` | **ISO 8601 timestamp** of the reset |
| `X-RateLimit-NearLimit` | `true` when < 20% remains |
| `RateLimit-Reason` | table lists `conf-global-based`, `conf-tenant-based`. The example shows `confluence-quota-global-based`. Burst reason value for Confluence **Unconfirmed** |
| `Beta-Retry-After`, `X-Beta-RateLimit-*` | sent when a request "would have breached the upcoming quota and burst rate limits". Informational |
| `Beta-RateLimit-Policy` / `Beta-RateLimit` | structured points-quota headers, e.g. `"global-app-quota";q=65000;w=3600` and `"global-app-quota";r=11000;t=600`. They become `RateLimit-Policy` / `RateLimit` at enforcement |

- The 429 **body** is not documented. **Unconfirmed**.
- Atlassian's retry guidance: retry only idempotent requests that carry `Retry-After`. Use
  exponential backoff with jitter and double the delay after each 429. Their pseudocode starts at
  5 s, caps at 30 s and allows 4 retries.
- "Cache stable responses: Use ETags and conditional headers". Whether v2 page/comment endpoints
  return `ETag` and honour `If-None-Match` is **Unconfirmed**.

## Unconfirmed

1. Exact 401 body for a bad, expired or revoked token, and whether a dropped `Authorization`
   header yields anonymous 200s instead of 401 on sites with anonymous access.
2. v2 error body shape for page/space/comment errors (`{errors:[{status, code, title, detail}]}`
   is documented only for some newer v2 endpoints).
3. Status/body when a scoped token lacks a scope. Whether one scoped token can hold both classic
   `search:confluence` and granular `read:*` scopes.
4. Gateway path for v2 with scoped tokens (`https://api.atlassian.com/ex/confluence/{cloudId}/wiki/api/v2/…`
   vs without `/wiki`), and what `_links.base` contains through the gateway.
5. `siteSearch ~` on Cloud (documented only for Data Center).
6. `ORDER BY lastmodified` support (docs only show `created`/`title`).
7. Max `limit` on `/wiki/rest/api/search` without expansions. Accuracy of `totalSize`. How `start`
   interacts with cursor paging.
8. Highlight markup in search `title`/`excerpt`. Shape of `url` and `resultGlobalContainer` (space?).
9. How `export_view`/`styled_view`/`editor` come back in the v2 `body` (schema lists only
   `storage`, `atlas_doc_format`, `view`).
10. How Confluence macros appear in ADF (extension node details), and which macro output `view`
    omits (e.g. client-rendered macros).
11. Whether `GET /pages/{id}` returns trashed/archived pages without an explicit `status=`.
12. Page id stability across rename/move **on Cloud** (documented for Data Center).
13. Exact `_links.webui`/`_links.base`/`tinyui` values.
14. Confluence burst-limit thresholds and the burst `RateLimit-Reason` value. The 429 body.
15. ETag / conditional request support on v2 reads.
16. A cheaper way to fetch all comment replies than one children call per root comment.

## Sources

1. Confluence Cloud REST API v2, OpenAPI spec (info.version 2.0.0), fetched 2026-11-13 — https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json (rendered at https://developer.atlassian.com/cloud/confluence/rest/v2/intro/). Operations used: `GET /pages/{id}`, `GET /pages`, `GET /spaces`, `GET /spaces/{id}`, `GET /pages/{id}/footer-comments`, `GET /pages/{id}/inline-comments`, `GET /footer-comments/{id}/children`, `GET /inline-comments/{id}/children`, `GET /footer-comments`, `POST /users-bulk`, `POST /content/convert-ids-to-types`. Schemas: `PageSingle`, `ContentStatus`, `Version`, `BodySingle`, `BodyBulk`, `AbstractPageLinks`, `PrimaryBodyRepresentation(Single)`, `SpaceBulk`, `PageCommentModel`, `PageInlineCommentModel`, `InlineCommentProperties`, `InlineCommentResolutionStatus`, `CommentSortOrder`, `PageSortOrder`, `SpaceSortOrder`, `MultiEntityLinks`, `ContentPermissionErrorResponse`, `DatabaseErrorResponse`
2. Confluence Cloud REST API v1, OpenAPI spec (info.version 1.0.0), fetched 2026-11-13 — https://dac-static.atlassian.com/cloud/confluence/swagger.v3.json (rendered at https://developer.atlassian.com/cloud/confluence/rest/v1/intro/). Operations used: `GET /wiki/rest/api/search`, `GET /wiki/rest/api/content/search`, `GET /wiki/rest/api/user/current`, `GET /wiki/rest/api/user/bulk`, `POST /wiki/rest/api/contentbody/convert/async/{to}`. Schemas: `SearchPageResponseSearchResult`, `SearchResult`, `Content`, `ContainerSummary`, `Breadcrumb`. Only two v1 operations are marked deprecated (`/content/{id}/descendant…`), and `GET /content/{id}` and `GET /space` are absent
3. Basic auth for REST APIs (Confluence Cloud) — https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/
4. Manage API tokens for your Atlassian account — https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/
5. OAuth 2.0 (3LO) apps (Confluence Cloud), "Construct the request URL" and accessible-resources — https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/
6. How to find your Atlassian Cloud site's Cloud ID — https://support.atlassian.com/jira/kb/retrieve-my-atlassian-sites-cloud-id/
7. Security requirements for cloud apps (Privacy: "must not collect or store … user API tokens") — https://developer.atlassian.com/platform/marketplace/security-requirements/. Linked blog post: https://www.atlassian.com/blog/developer/building-secure-and-scalable-integrations-our-guidance-for-third-party-apps
8. The Confluence Cloud REST API (v1 intro: status codes and error body, expansion, pagination) — https://developer.atlassian.com/cloud/confluence/rest/v1/intro/
9. Rate limiting (Confluence Cloud), page "Last updated Nov 13, 2026", including the banner on API token traffic and CHANGE-2958 — https://developer.atlassian.com/cloud/confluence/rate-limiting/
10. Advanced searching using CQL — https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/
11. CQL fields — https://developer.atlassian.com/cloud/confluence/cql-fields/
12. CQL functions — https://developer.atlassian.com/cloud/confluence/cql-functions/
13. Performing text searches using CQL — https://developer.atlassian.com/cloud/confluence/performing-text-searches-using-cql/
14. Atlassian Document Format: structure — https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
15. Confluence Storage Format (Data Center 11.0 docs; no Cloud equivalent found) — https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html
16. Differences between URL formats for Confluence Data Center pages — https://support.atlassian.com/confluence/kb/the-differences-between-various-url-formats-for-a-confluence-page/
17. Legacy link fixing after migration to Cloud — https://support.atlassian.com/confluence/kb/legacy-link-fixing-after-a-successful-migration-to-cloud-url-links-are/
18. The Confluence Cloud REST API v2 (intro: auth, cursor pagination via `Link` header) — https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
19. Scopes for OAuth 2.0 (3LO) and Forge apps (Confluence; classic `search:confluence`, granular `read:page:confluence` etc.) — https://developer.atlassian.com/cloud/confluence/scopes-for-oauth-2-3LO-and-forge-apps/
20. Atlassian staff on the developer community, v1 deprecation scope (search not affected) — https://community.developer.atlassian.com/t/deprecating-many-confluence-v1-apis-that-have-v2-equivalents/66883 and https://community.developer.atlassian.com/t/confluence-rest-api-v2-updating-v1-deprecation-timeline-and-announcing-v2-additions/68154
21. Changes to Confluence Cloud Search APIs and deprecation notice — https://developer.atlassian.com/cloud/confluence/deprecation-notice-search-api/
22. npm registry and published package source: `@atlaskit/editor-markdown-transformer@6.3.2` (`dist/esm/index.js`, `encode()` throws), `@atlaskit/adf-utils@20.9.83`, `@atlaskit/adf-schema@57.7.42` — https://registry.npmjs.org/@atlaskit/editor-markdown-transformer/latest, https://registry.npmjs.org/@atlaskit/adf-utils/latest
23. Rate limiting (Jira Cloud platform), burst limits, for comparison only — https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
