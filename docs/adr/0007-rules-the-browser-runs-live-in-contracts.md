# ADR 0007: Rules the browser runs too live in contracts.ts

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser

## Context

The workspace shows a change before the server has stored it (ADR 0004): settling, snoozing or
waking a thread moves it in the sidebar at once, a snoozed thread wakes in the browser at its
deadline, and the composer counts and phrases a question's attached records as they are picked.
The server applies the same rules with its own clock when it stores the change. These rules are
pure functions over DTOs: thread placement (`settle`, `snooze` and `snoozeRefusal`, `wakeIfDue`,
`snoozePresets`, …), the attached-items rules (`togglePick`, `attachedPhrase`,
`attachedConnectionsOf`, …), the record tones and labels, and the html_render frame's height clamp.

CONVENTIONS.md puts pure business rules in `domain.ts`, which is server-only like every module file
but `contracts.ts` (Rule 4, lint), and describes `contracts.ts` as "zod inputs in, DTO types out".
The browser can import nothing from a module but `contracts.ts` (Rule 6, lint).

## Options

### Option 0: Rules only on the server

The browser asks the server for every change and shows it when it answers.

- ✅ Rules in `domain.ts`, as written.
- ❌ Every settle, snooze and pick waits for a round trip; the snooze wake needs a timer on the
  server or a poll. The workspace stops feeling local.

### Option A: The rules the browser runs too are in contracts.ts

`contracts.ts` holds, besides its schemas and types, the pure functions both sides run. It still
imports only zod and types, so it stays browser-safe. Rules only the server runs stay in
`domain.ts` (threads: a new thread, a fork, how a conversation grows; agent: the context and the
prompt).

- ✅ One place per rule: the browser and the server can't disagree on where a thread sits.
- ✅ Lint already guarantees what matters, that `contracts.ts` can't pull the server into the
  bundle.
- ❌ `contracts.ts` is longer and holds more than shapes; a reader has to know that its functions
  are the shared ones.

### Option B: A copy in the browser

The rules the browser needs are copied into `app/(workspace)/_components/`.

- ✅ `contracts.ts` stays schemas and types.
- ❌ Two copies of each rule that have to stay the same; a snooze the browser accepts could be one
  the server refuses.

## Decision

**Option A.** Why: One place per fact, and end-to-end type safety: a rule both sides run is one
function both sides import. Without the optimistic workspace (Option 0's cost), the rules would
sit in `domain.ts`.

## Consequences

- `modules/threads/contracts.ts` holds the placement rules and `continueThread`, `countTurn`;
  `modules/records/contracts.ts` holds the attached-items rules and the `data-attached-items`
  part's schema; `modules/integrations/contracts.ts` holds `toneOf`, `viewKindOf`, `pluralLabels`,
  `waitLabel`, `expiryLabel`, `invitedProvider`; `modules/agent/contracts.ts` holds the html_render
  limits with `clampHtmlRenderHeight` and `normalizeHtmlRenderTitle`.
- A rule that refuses answers why as a value the browser can show (`snoozeRefusal` →
  `"time-in-past" | "still-working"`); the command turns it into its error class
  (`SnoozeTimeInPast`).
- Each such `contracts.ts` says so in its header comment.
- Departs from CONVENTIONS.md, Layout (`contracts.ts`: "zod inputs in, DTO types out") and the
  `domain.ts` default, for these rules only.
- Enforced by lint for what is safe (`contracts.ts` imports zod and types only) and by review for
  what goes there (only rules the browser runs).

## Reversing this decision

For one rule, move it to `domain.ts` and have the browser wait for the action's answer instead of
showing the change; the call sites in `_components` change from the rule to the action. The
schemas and DTOs stay in `contracts.ts`.
