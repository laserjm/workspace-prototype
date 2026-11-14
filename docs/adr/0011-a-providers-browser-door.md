# ADR 0011: A provider's browser-safe shapes live in its folder

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser
- **Related:** `docs/adr/0002-integrations.md`, `docs/adr/0006-providers-answer-refusals-as-values.md`,
  `docs/adr/0010-workspace-ui-grouped-by-noun.md`

## Context

CONVENTIONS.md, Rule 6: UI imports a module's `contracts.ts`, "the module's one browser-safe
file", and lint refuses any other path into a module from `app/` (`moduleViaIndex`). Lint also
asks every file under `modules/` but `modules/*/contracts.ts` to start with `server-only`
(Rule 4).

`integrations` has one folder per provider (ADR 0002, ADR 0006), and a provider has shapes the
browser reads: GitHub's views parse the record detail against `githubIssueDetailSchema` and
`githubPullRequestDetailSchema`, and the chat types `github_pull_request_diff`'s parts with its
input and output schemas. Under Rule 6 they had to sit in `integrations/contracts.ts`, so the
module's shared vocabulary carried a GitHub section, and every provider after it would add one.
A change to GitHub would touch the provider folder and the shared file.

`integrations/contracts.ts` cannot re-export them from the provider's folder either:
`githubPullRequestDiffOutput` builds on `recordSummarySchema` and `recordReadRefusalSchema` from
that file, and the cycle would read them before they exist when the module loads.

## Options

### Option 0: A section per provider in `integrations/contracts.ts`

- ✅ No departure.
- ❌ Every provider edits the shared file. A provider is not one folder.

### Option A: `providers/<id>/contracts.ts`, a provider's own browser door

The provider's browser-facing schemas and types live in `providers/<id>/contracts.ts`. It may
import only zod, types and `integrations/contracts.ts`. Its readers import it relatively; the
views in `app/(workspace)/_components/providers/<id>/` import it directly.

- ✅ A provider is one folder on the server side again; the shared contracts hold only the
  vocabulary every provider answers in.
- ❌ Lint doesn't know this door. The file carries an `eslint-disable` for `server-only`, and each
  view's import an `eslint-disable-next-line no-restricted-imports`, each linking here.
- ❌ Lint doesn't check that the file stays browser-safe, so a test does.

## Decision

**Option A.** Why: "One place per fact" and Developer experience: what GitHub's records look like
is GitHub's, and belongs with the code that builds them. The cost is five ADR-linked disables for
GitHub, the way the conventions ask a lint-enforced default to be departed from, plus a
conventions challenge for lint to know the door.

## Consequences

- `modules/integrations/providers/github/contracts.ts` holds GitHub's detail and diff tool
  schemas; `integrations/contracts.ts` has no provider's name in it.
- `test/boundaries.test.ts` checks that a provider's `contracts.ts` imports only zod, types and
  `integrations/contracts.ts`, and that outside its folder a provider is reached only through the
  registries (`providers.ts`, `tools.ts`) or this file.
- Departs from CONVENTIONS.md, Rule 6 ("the module's one browser-safe file") and Rule 4 for this
  file.
- Conventions challenge: let lint treat `modules/*/providers/*/contracts.ts` like a module's
  `contracts.ts` (the browser-safe import block, no `server-only`, allowed from `app/`).

## Reversing this decision

Move the schemas back into the GitHub section of `integrations/contracts.ts`, point the imports
there and drop the disables.
