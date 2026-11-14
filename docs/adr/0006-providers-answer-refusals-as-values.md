# ADR 0006: Integrations keeps provider folders, and a provider answers a refusal as a value

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser
- **Related:** `docs/adr/0002-integrations.md`, `docs/adr/0003-attached-items-and-record-views.md`

## Context

`modules/integrations` connects the workspace to other systems. Each system is a provider folder
(`providers/github/`: its manifest, its API calls, its record readers and search, its own agent
tool and a guide for the model), registered by one line in `providers.ts` (ADR 0002). A provider's
code runs against a remote system that refuses often and in ways the user and the model must hear
about: a token GitHub no longer accepts, a rate limit with its reset time, a repository the token
can't see, a search GitHub can't run. Those refusals are data: the record routes answer them to
the record panel, which draws a message and a link to the record, and the record tools answer them
to the model as tool output, which the model reads and tells the user about.

CONVENTIONS.md gives a module a flat set of files (Layout) and drops "`Result` types and tagged
error unions" (Deliberately dropped): a command throws, the adapter maps. The module had a
`Result` type from `lib/result.ts` threaded from every provider function up to the adapters.

## Options

### Option 0: Throw everywhere

Every provider function throws a `RecordRefused(refusal)` class; the record queries let it
through; the routes and each tool's `execute` catch it and turn it back into data.

- ✅ No `Result` in the module.
- ❌ The GitHub provider has about a hundred refusal points (`err(…)` per status, per parse), and
  each tool would catch only to return the same refusal as output. The throw is not an error
  path here: it is the answer.
- ❌ A provider author can't see from a signature which refusals a function answers.

### Option A: Refusals are values inside the provider SPI and the record reads; our own facts throw

- The provider SPI (`provider.ts`) types a provider's answers as `Answer<T, E>` (`{ ok, value }`
  or `{ ok, error }`), local to the module; `lib/result.ts` goes.
- `searchRecords`, `readRecord` and `readRecordForModel` (queries) answer an `Answer` with a
  `RecordError`/`RecordReadRefusal`, which the record routes map to a status with
  `{ error, refusal }` and the record tools pass to the model.
- What is ours to refuse throws classes from `errors.ts`, as the conventions say: connecting to an
  unknown provider, a base URL the workspace won't call, a credential the provider rejected while
  connecting (`verify` answers a value, `connect` turns it into `CredentialRejected`), a missing
  connection.
- The flat layout keeps its files and adds three for the provider pattern: `provider.ts` (the SPI
  a provider folder implements), `providers.ts` (the registry) and `providers/<id>/`.

- ✅ A refusal reaches the model and the panel as the data it is, without a throw and a catch in
  between.
- ✅ The session-bound API (`index.ts`) and the commands follow the conventions; only record reads
  answer values.
- ❌ Two error styles in one module; the line between them has to be kept: a remote system's
  answer is a value, our own refusal is a class.

## Decision

**Option A.** Why: Business logic lives in TypeScript and should read as what it is. A remote
refusal is the product here (the model reports it, the panel shows it); throwing it to catch it
again a frame later only hides that. The conventions' own reason for dropping `Result` (a thin
adapter maps a few thrown classes) holds for the commands, which keep it.

## Consequences

- `modules/integrations/provider.ts` holds `Answer`, `ok`, `err` and the SPI types
  (`Provider`, `ProviderRecords`, `RecordType` with `read` and `readForModel`, `VerifyRefusal`,
  `MODEL_LIMITS` and the trimming helpers). Nothing outside integrations imports it.
- `modules/integrations/providers.ts` and `providers/<id>/` are the provider pattern of ADR 0002.
  A provider's browser-side parts are not in its folder: its detail and tool schemas are in
  `contracts.ts` (browser-safe), its views in `app/(workspace)/_components/github-*.tsx`, and
  `_components/record-views.ts` registers them.
- The record routes answer a refusal as `{ error, refusal }`: `error` is the copy, `refusal` the
  `RecordReadRefusal` the panel draws from.
- Departs from CONVENTIONS.md, Deliberately dropped ("`Result` types"), inside the provider SPI and
  the record reads, and from Layout (three extra files in one module).
- Enforced by review: nothing outside `modules/integrations/` imports `provider.ts`.

## Reversing this decision

Make each provider function throw `RecordRefused(refusal)`, have the record queries let it through,
and catch it in the two routes and the record tools to answer the same data. The routes' bodies,
the tool outputs and the panel don't change.
