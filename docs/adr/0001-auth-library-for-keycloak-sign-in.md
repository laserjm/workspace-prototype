# 0001. Auth library for the Keycloak sign-in

- **Status:** Proposed
- **Date:** 2026-11-04
- **Deciders:** Michael Laser
- **Related:** `ARCHITECTURE.md` (Local stack, Data ownership, "No tables or sign-in yet");
  `lib/auth/requester.ts` (the starter that comes back with the sign-in, NX-AUTH-01)

## Context

Keycloak 26 runs in the local stack (`compose.yaml`). The `workspace` realm has one confidential
client, `workspace-web`: authorization code with PKCE, no direct grants, no self-registration,
no roles, and development users with fixed ids. The app (Next.js 16, Drizzle on Postgres 17,
`isolation: owner`) does not sign anyone in yet. The `auth` ruleset comes with the sign-in, and
from then on the requester decides who owns what.

The library has to:

1. Run the OIDC authorization code flow with PKCE against Keycloak as a confidential client.
2. Keep a server-side session the app can read in `queries.ts` and `lib/safe-action.ts` (the only
   places allowed to read it, NX-AUTH-01), and produce an `OwnerRequester` whose `ownerId` is the
   Keycloak `sub`.
3. Refresh Keycloak's access token. The realm's `accessTokenLifespan` is 300 s, so this happens
   all the time, not as an edge case.
4. Sign out of Keycloak too (RP-initiated logout via `end_session_endpoint`), not just clear the
   app's cookie.
5. Fit the bindings: code-first Drizzle migrations in `drizzle/`, `server-only` boundaries, and no
   framework in `application/` or `domain/`.

The three candidates:

| | **openid-client 6.8** | **Auth.js (next-auth 5)** | **Better Auth 1.7** |
| --- | --- | --- | --- |
| What it is | OIDC/OAuth 2 relying-party *protocol* library (built on `oauth4webapi`) | Auth *framework* for Next.js with providers, sessions and adapters (core on `oauth4webapi`) | Auth *framework*, framework-agnostic, with a database-backed session and a plugin system |
| Current release | 6.8.9 (2026-11-02) | **5.0.0-beta.32** (2026-07-20); `latest` on npm is still 4.24.15 | 1.7.17 (2026-11-04); 1.8 in beta |
| Keycloak support | Generic OIDC with discovery: `discovery(issuer, …)` | Built-in `Keycloak` provider | `genericOAuth` plugin with a `keycloak({ issuer, … })` helper (discovery) |

## Decision drivers

1. **Developer experience.** Lines we write and own, docs quality, type safety, how well it reads
   in Server Components, Server Actions and `proxy.ts`.
2. **Adoption rate in the community.** npm downloads, ecosystem integrations, trajectory.
3. **GitHub stars.** As a popularity signal (weak on its own).
4. **Enterprise readiness.** Protocol correctness and certification, stability guarantees,
   backing organisation, support, SSO/SCIM paths.
5. **Theo Browne (t3.gg).** Has he used or shipped any of the three?
6. **Keycloak/OIDC fit** *(added).* Token refresh, RP-initiated logout, discovery, PKCE, out of
   the box versus hand-written.
7. **Security track record and attack surface** *(added).* Published advisories, and how much code
   we run that we don't need.
8. **Maintenance and bus factor** *(added).* Who maintains it, how often it ships, will it be here
   in three years.
9. **Fit with this project's architecture** *(added).* Drizzle code-first schema, the
   `Requester` seam (NX-AUTH-01), isolation by `ownerId`, cost of leaving.

## Evidence

Collected on 2026-11-04 from the GitHub API, the npm registry and download API, and the sources
linked at the end.

### GitHub stars and activity

| Repository | Stars | Forks | Open issues | Created | Last push |
| --- | ---: | ---: | ---: | --- | --- |
| `better-auth/better-auth` | **30,586** | 3,062 | 973 | 2024-05 | 2026-11-04 |
| `nextauthjs/next-auth` | 28,374 | 4,024 | 603 | 2018-01 | 2026-07-22 |
| `panva/openid-client` | 2,440 | 407 | 0 | 2016-06 | 2026-11-02 |

Better Auth passed Auth.js in stars in about 2½ years. openid-client's low count is normal for an
infrastructure library that people use through other packages rather than star.

Commits in the last six months: Better Auth 100+ (the API page limit), openid-client 78, next-auth 17.

### Adoption (npm downloads)

| Package | Last week | Last month | Note |
| --- | ---: | ---: | --- |
| `openid-client` | 22.4 M | 66.1 M | Mostly **transitive**: next-auth 4, passport strategies, cloud SDKs |
| `better-auth` | 18.2 M | 51.8 M | Mostly direct installs |
| `next-auth` | 9.1 M | 27.7 M | ≈4.5 M/week are 5.0 betas (beta.32: 3.5 M); the rest is v4 |
| `@auth/core` | 6.5 M | 19.6 M | Auth.js v5 core, also used by the SvelteKit, Express and Qwik bindings |

Trajectory: Better Auth is where new projects go. `create-t3-app` added it as an option next to
NextAuth.js in Nov 2025 ([#2142][ct3a-ba]). Auth.js [became part of Better Auth][authjs-joins] on
2025-09-22. Since then it gets security patches and urgent fixes, and Better Auth is recommended
for new projects.

### Theo Browne

| Library | Used by Theo? | Evidence |
| --- | --- | --- |
| Auth.js / NextAuth.js | **Yes, extensively.** | The default auth of `create-t3-app` and the T3 Stack since 2022; he built **Ping** on it; video *"Auth just got WAY better"* (Jan 2023) on the NextAuth → Auth.js rename. In *"The State of Authentication"* (2025-02-03) he criticised it: "you have to have a data model that you attach it to", edge-compatibility problems, a `patch-package` fix in Ping after a field was renamed. |
| Better Auth | **Talked about it, hadn't used it** (as of Feb 2025). | In *"The State of Authentication"* he praised it as TypeScript-first, with less legacy debt and with organisations, access control and plugins, but said he had not used it himself. The T3 OSS org's `create-t3-app` has shipped it as an option since Nov 2025. I found no public evidence that Theo has used it in a product since. |
| openid-client | **No evidence.** | Not mentioned. He did build **T3 Chat** on **OpenAuth** (SST's OIDC server on Cloudflare Workers + KV), so he does like self-hosted OIDC, just not this library. |
| *(for context)* Clerk | Yes | UploadThing uses Clerk. Clerk sponsors him, which he discloses. |

Treat this driver as a signal of mindshare among Next.js developers, not of fitness for Keycloak.
Theo has never shown any of these libraries against an enterprise IdP.

### Security track record (published GitHub security advisories)

| Repository | Total | 2026 | Critical (all time) |
| --- | ---: | ---: | ---: |
| `panva/openid-client` | **0** | 0 | 0 |
| `nextauthjs/next-auth` | 15 | 5 (all on 2026-07-20, fixed in beta.32 / 4.24.15) | 2 (2021, 2022) |
| `better-auth/better-auth` | 49 | 39 | 4 (all 2026) |

Better Auth's numbers need a closer look. Most of its advisories are in plugins this project
would not load (`sso`, `scim`, `stripe`, `expo`, `electron`, `oauth-provider`, phone, OTP, magic
link). Several touch the parts we *would* use, though: OAuth state reused as a magic link to sign
in as another user (critical, 2026-09-30), a forged OAuth state accepted when the state lives in a
cookie (2026-05), an unverified provider email treated as verified (2026-11-03), and revoked
sessions staying valid with the cookie cache (2026-11-03). A high advisory count also reflects an
active disclosure programme and a large surface. Either way, taking Better Auth means taking its
release cadence (1.7.16 and 1.7.17 shipped within a day).

## Options

### Option A: openid-client 6.8 (we write the session layer)

`openid-client` handles the protocol. We write the rest in `lib/auth/`: sign-in and callback
route handlers, a PKCE/state/nonce cookie, an encrypted session cookie (`jose`) or a `sessions`
table, refresh on expiry, RP-initiated logout (`buildEndSessionUrl`), and the requester.

- **Developer experience.** − About 300–400 lines of security-critical code we own, plus tests.
  No `useSession`, no sign-in UI helpers. + Small, well-typed, functional API with excellent
  protocol docs, and no magic: every cookie and redirect is ours and readable.
- **Adoption.** + The largest download count of the three, but transitive. Few people pick it
  directly for a Next.js app.
- **Stars.** − 2.4k.
- **Enterprise readiness.** ++ OpenID Certified (Basic, FAPI 1.0 and FAPI 2.0 RP profiles). By
  Filip Skokan, who also maintains `jose` and `oauth4webapi`, the libraries under both Auth.js and
  much of the ecosystem. Sponsored by Auth0/Okta. Ten years old, semver-strict.
- **Theo.** − Never used it.
- **Keycloak fit.** ++ Correctness is certified: refresh, end-session, DPoP, PAR and JAR are all
  there if a security review asks. − Nothing works until we have wired it.
- **Security.** ++ Zero advisories, minimal surface. − *Our* session code becomes the attack
  surface.
- **Maintenance.** + Active (6.8.9 two days ago). − Bus factor of one, though one with a long
  record and corporate sponsorship.
- **Architecture fit.** ++ Everything lives in `lib/auth/`. Tables only if we choose them. Leaving
  costs nothing.

### Option B: Auth.js (next-auth 5)

`NextAuth({ providers: [Keycloak({ issuer, clientId, clientSecret })] })` gives `auth()`,
`signIn()`, `signOut()` and `handlers`. Sessions are JWTs in a cookie by default, or in the
database through `@auth/drizzle-adapter`.

- **Developer experience.** + The quickest first sign-in: a built-in Keycloak provider and
  `auth()` working in Server Components, actions and `proxy.ts`. − Still **beta after three years**
  (first beta Oct 2023, latest Jul 2026). Docs are split between v4 and v5. **No built-in refresh
  token rotation**: the official guide has us hand-write it in the `jwt` callback, which Keycloak's
  5-minute tokens make mandatory. **Federated logout is hand-written** (an `events.signOut` hook
  that calls `end_session_endpoint`). Callback-heavy configuration, loosely typed session
  extensions (module augmentation).
- **Adoption.** + Huge installed base (9.1M/week), but flat-to-declining, and most of it is v4.
- **Stars.** + 28.4k.
- **Enterprise readiness.** − No stable v5. Maintenance-only since it joined Better Auth: security
  patches and urgent fixes, no feature roadmap. + Mature and widely audited by use. Built on
  `oauth4webapi`.
- **Theo.** ++ The T3 Stack default for years. Theo shipped Ping on it.
- **Keycloak fit.** ○ Sign-in works out of the box. Refresh and logout, the parts Keycloak needs
  most, do not.
- **Security.** ○ 15 advisories over five years, five fixed in July 2026. Moderate surface.
- **Maintenance.** −− 17 commits in six months. Its maintainers point new projects at Better Auth.
- **Architecture fit.** ○ The Drizzle adapter exists. A JWT session keeps it table-free. Leaving
  later means rewriting `lib/auth/` and the route handler.

### Option C: Better Auth 1.7 (core + `genericOAuth` with the `keycloak()` helper)

`betterAuth({ database: drizzleAdapter(db, { provider: 'pg' }), plugins: [genericOAuth({ config:
[keycloak({ issuer, clientId, clientSecret })] })] })`, with `auth.api.getSession({ headers })` on
the server and `toNextJsHandler(auth)` for the route. Email and password stays off.

- **Developer experience.** ++ The best typed API of the three (session and user types inferred
  from the config and plugins). `auth.api.*` can be called directly on the server. The CLI
  generates the Drizzle schema (`user`, `session`, `account`, `verification`), which then goes
  through our `pnpm db:generate` flow. Good docs. − A larger, opinionated system with its own
  tables and conventions. Fast-moving: minor versions bring config changes.
- **Adoption.** ++ The fastest-growing auth library in the ecosystem, at 18.2M/week. Where Auth.js
  users are being sent.
- **Stars.** ++ 30.6k, the most of the three.
- **Enterprise readiness.** + A dedicated core team behind it (which now also stewards Auth.js), an
  enterprise feature path if needed later (`@better-auth/sso` for SAML/OIDC per organisation,
  `@better-auth/scim`, organisations, admin), and a security disclosure process that is visibly
  used. − Not OpenID Certified. Young (May 2024). Its 2026 advisory volume would need explaining to
  a security reviewer.
- **Theo.** ○ Publicly positive in 2025 without having used it. His org's `create-t3-app` ships it.
- **Keycloak fit.** ++ The `keycloak()` helper uses discovery. **RP-initiated logout is built in**
  (`signOut()` redirects to `end_session_endpoint`; `postLogoutRedirectURI`). **Access token
  refresh is built in** (`getAccessToken` refreshes expired tokens stored on the account). PKCE is
  supported. − No OIDC back-channel logout (none of the three has it; we would write that endpoint
  ourselves in any case).
- **Security.** − 49 advisories (39 in 2026, four critical), a few in the OAuth core path we would
  use. Mitigate by loading only `genericOAuth`, keeping the cookie cache off (or short), and
  updating promptly (Renovate/Dependabot, security advisories watched).
- **Maintenance.** ++ Very active (100+ commits in six months, releases every few days).
- **Architecture fit.** + The Drizzle adapter fits `schema-source: code-first`. Sessions in
  Postgres give us server-side revocation. − Better Auth owns a `user` table with its own ids. The
  requester must map to the Keycloak `sub` (`account.accountId`), or the user id must be set to
  `sub`, so `ownerId` stays stable across resets, as `ARCHITECTURE.md` promises. Leaving means
  migrating four tables.

### Scoring

Weights reflect this project: an enterprise workspace against Keycloak, built by a small team.
Scores run from 1 (poor) to 5 (excellent).

| Driver | Weight | openid-client | Auth.js v5 | Better Auth |
| --- | ---: | ---: | ---: | ---: |
| Developer experience | 20 % | 2 | 3 | **5** |
| Keycloak/OIDC fit | 15 % | 4 | 2 | **5** |
| Enterprise readiness | 15 % | **5** | 2 | 4 |
| Security track record and surface | 15 % | **5** | 3 | 2 |
| Maintenance and bus factor | 10 % | 4 | 1 | **5** |
| Adoption rate | 10 % | 3 | 3 | **5** |
| Architecture fit and exit cost | 5 % | **5** | 3 | 4 |
| GitHub stars | 5 % | 1 | 4 | **5** |
| Theo Browne | 5 % | 1 | **5** | 3 |
| **Weighted total** | 100 % | 3.55 | 2.65 | **4.25** |

Weighted, Better Auth wins clearly. openid-client comes second and beats it on the two drivers a
security reviewer would ask about first. Auth.js comes last mainly because v5 is a maintenance-only
beta, not because it is bad software.

## Decision (proposed)

**Use Better Auth 1.7 with only the `genericOAuth` plugin and its `keycloak()` helper,
database sessions in Postgres through the Drizzle adapter, and email and password disabled.**

The decision stays proposed until a spike confirms the points below. It becomes Accepted when the
first signed-in request produces an `OwnerRequester` whose `ownerId` is the Keycloak `sub`.

Guardrails that come with it:

- `lib/auth/` is the only place that imports `better-auth` (enforce with `boundaries/external`).
  `getRequester()` (NX-AUTH-01) is the seam. Nothing else sees a Better Auth type, so switching to
  Option A later rewrites one folder.
- `ownerId` is the Keycloak `sub`, never a Better Auth–generated id.
- No plugins beyond `genericOAuth` without a new ADR. Leave the cookie cache off until revocation
  latency is measured.
- Pin the minor version, update patches within a week, and watch the repository's security
  advisories.

**Fallback.** If the spike fails, or a security review rules out a library with this advisory
history, take Option A (openid-client). It is the certified, minimal-surface choice; we pay with
about 400 lines of session code in `lib/auth/`.

**Rejected.** Option B (Auth.js v5): a perpetual beta in maintenance mode, with refresh and
federated logout, the two things Keycloak needs most, left to us.

## Consequences

- **Positive.** Sign-in, refresh and Keycloak logout without hand-written protocol code. Typed
  sessions. Server-side revocation. A path to organisation SSO/SCIM if the app becomes `isolation:
  tenant`.
- **Negative.** Four auth tables in our schema, which go into `docs/architecture/db-inventory.md`
  through the normal migration flow. A high-churn dependency to keep updated. A non-certified OIDC
  client in front of an enterprise IdP.
- **Follow-ups.** Add an Interpretation entry "Sign-in: Better Auth against Keycloak" to
  `ARCHITECTURE.md`. Add `auth` to `rulesets`. Restore `lib/env.ts`, `lib/safe-action.ts` and
  `lib/auth/requester.ts`. Add Keycloak client settings to `.env.example`. Register
  `http://localhost:3000/api/auth/callback/keycloak` (1.7 routes generic providers through the
  core `/callback/:id`, not `/oauth2/callback/:id`) and the post-logout redirect URI on
  `workspace-web` in the realm export.

## Spike checklist (before Accepted)

- [x] Code flow with PKCE against `workspace-web`; `sub` of a fixed-id dev user lands as `ownerId`.
- [x] Session survives the 300 s access-token expiry; `getAccessToken` refreshes it.
- [x] `signOut()` ends the Keycloak SSO session (the next sign-in asks for credentials).
- [ ] `auth.api.getSession` works in a Server Component, a Server Action (through
      `lib/safe-action.ts`) and `proxy.ts`. Server Component: yes. Server Action: not exercised,
      because there is no action yet. `lib/safe-action.ts` uses the same `getRequester()` as the
      page. `proxy.ts`: deliberately not used; see below.
- [x] `pnpm db:generate` produces a clean migration from the generated schema; `drizzle-kit check`
      passes.
- [x] `pnpm exec conventions check` passes with the `auth` ruleset on.

### Spike results (2026-11-04)

Run with curl against the dev server and the compose stack, acting as a browser. The ADR's
acceptance condition is met: the first signed-in request produced an `OwnerRequester` whose
`ownerId` is the Keycloak `sub` (`alice` → `5a522deb-…`, `bob` → `99256cb5-…`).

- **Sign-in.** `/` → `/sign-in` → Keycloak (with `code_challenge`) → `/api/auth/callback/keycloak`
  → back to `returnTo`. The first sign-in creates the `users` and `accounts` rows; each sign-in
  sets `last_signed_in_at` and refreshes name and email.
- **`ownerId` = `sub`.** Better Auth strips the provider id before it creates a user, and
  `keycloak()` does not forward `mapProfileToUser`. The helper's config is spread with a
  `mapProfileToUser` that copies `sub` into `users.keycloak_sub`, and a `user.create.before`
  hook sets `id` from it. A field without a column is refused by Better Auth's startup schema
  check, so the column is real. The `users_id_is_keycloak_sub` CHECK keeps it equal to `id`, and
  `/update-user`, `/change-email` and `/delete-user` are disabled.
- **Refresh.** With `access_token_expires_at` forced into the past, `POST
  /api/auth/get-access-token` returned a new access token and stored it, rotated and encrypted.
  In 1.7 the endpoint takes `{ accountId }` (the Better Auth account id), not `{ providerId }`.
  The app session (7 days) is independent of Keycloak's 300 s tokens.
- **Sign-out.** `POST /sign-out` deleted the session row and redirected to Keycloak's
  `end_session_endpoint` with `id_token_hint` and `post_logout_redirect_uri=http://localhost:3000/`.
  The next sign-in showed the Keycloak login form again.
- **Hardening beyond the guardrails.** `account.encryptOAuthTokens: true` (off by default).
  Account linking is off. `returnTo` is limited to the app's origin, and backslash and
  protocol-relative tricks are covered by tests. The client's redirect URI is exact rather than
  `http://localhost:3000/*`.
- **Proxy.** Next.js 16 recommends only optimistic cookie checks in Proxy and no database
  access, so `proxy.ts` checks that a session cookie exists (`getSessionCookie`). The session
  itself is checked by `getRequester()` in the page and the API route. A forged cookie gets past
  the proxy and is refused there: redirect for pages, 401 for `/api/chat`.
- **No extra plugins.** The routes call `auth.api.*` with `asResponse: true` and pass on Better
  Auth's `Set-Cookie` headers, so `nextCookies()` is not needed.

## Sources

- GitHub REST API (`repos/*`, `security-advisories`, `commits`) and npm registry and downloads API,
  queried 2026-11-04.
- [Auth.js is now part of Better Auth][authjs-joins] (2025-09-22) and
  [nextauthjs/next-auth discussion #13252](https://github.com/nextauthjs/next-auth/discussions/13252).
- [Auth.js refresh token rotation guide](https://authjs.dev/guides/refresh-token-rotation)
  ("no built-in solution for automatic refresh token rotation").
- [Better Auth: Generic OAuth plugin](https://www.better-auth.com/docs/plugins/generic-oauth)
  (Keycloak helper, RP-initiated logout) and
  [OAuth concepts](https://www.better-auth.com/docs/concepts/oauth) (`getAccessToken` refresh).
- [openid-client README, Certification](https://github.com/panva/openid-client#certification).
- [create-t3-app: feat: add better-auth support (#2142)][ct3a-ba].
- Theo Browne, *The State of Authentication* (2025-02-03),
  [transcript summary](https://rosetta.to/u/t3dotgg/the-state-of-authentication). Theo Browne,
  *Auth just got WAY better* (2023),
  [transcript summary](https://rosetta.to/u/t3dotgg/auth-just-got-way-better). These are
  third-party transcripts: check quotes against the videos before citing them elsewhere.

[authjs-joins]: https://www.better-auth.com/blog/authjs-joins-better-auth
[ct3a-ba]: https://github.com/t3-oss/create-t3-app/commit/3f71a2d55a46428bb5e5f435ce61f6d5c96ae0f4
