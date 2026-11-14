# ADR 0004: The workspace calls its actions from client state

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Michael Laser

## Context

The workspace is one page, `app/(workspace)/page.tsx`. It loads the user's threads, projects and
connections once, and from then on the browser holds them: `useThreads` settles, snoozes,
starts and forks threads optimistically and calls a server action in the background, and the
settings dialog connects, tests and disconnects connections the same way. No action is a
`<form action>`; every one is called from an event handler or an effect, and the component
decides what to show from the answer.

CONVENTIONS.md, Errors, maps a missing, not-owned or malformed id in an action to `notFound()`, and
a bug to the nearest `error.tsx`. Both replace what the route renders. Here that is the whole
workspace: a thread deleted in another tab, or a request that failed once, would swap the sidebar,
the open conversation and an unsent draft for an error page.

### What is common practice

| Source | What they do | How it reaches the code |
| ------ | ------------ | ----------------------- |
| Next.js, "Error Handling" | Expected errors are returned from the action as values and shown with `useActionState`; uncaught exceptions go to error boundaries | The action returns `{ message }`; the component renders it |
| React, `useOptimistic` | An optimistic update is rolled back when the action's answer says it failed | The caller reads the answer, not a navigation |

## Options

### Option 0: Follow the table as written

`notFound()` for a missing id, `error.tsx` for a bug.

- ✅ No departure; the adapter is the shortest possible.
- ❌ One stale thread id (another tab deleted it) replaces the whole workspace with the not-found
  page. An optimistic change can't be rolled back, because the call never answers.
- ❌ A dropped connection to the server goes to `error.tsx` too, though nothing is broken.

### Option A: Refusals are copy; the browser's caller turns failures into copy

Every action answers its DTO or `{ error }`, `{ error }` holding copy the user can read, for every
expected refusal: invalid input, a missing or foreign id, a constraint, a provider that refused.
A visitor gets `{ error, signIn: true }`, and the browser sends them to sign in and back. A bug
still throws in the action; `callAction` in `_components/use-action.ts` catches the rejected
call and answers with copy, so the optimistic change is rolled back like any refusal.

```ts
// app/(workspace)/actions.ts
export async function placeThreadAction(input: unknown): Promise<Thread | Refusal> {
  const parsed = placeThreadInput.safeParse(input)
  if (!parsed.success) return { error: "That change can't be made to a thread." }
  return signedIn(async () => {
    try {
      return await threads.placeThread(parsed.data)
    } catch (error) {
      if (error instanceof threads.ThreadNotFound) return { error: "This thread no longer exists." }
      throw error
    }
  })
}
```

- ✅ The workspace stays on screen; the component that made the call shows the copy and undoes its
  optimistic change.
- ✅ The module side is unchanged from the conventions: queries return `null`, commands throw
  `<Noun>NotFound` and `<Fact>`, and the adapter maps them.
- ❌ A bug reaches the user as a generic line instead of an error page; it is still logged on the
  server by Next.js.

### Option B: Forms with `useActionState`

Rebuild the calls as `<form action>` and `useActionState`.

- ✅ The pattern the conventions name for `{ error }`.
- ❌ Most calls aren't forms: a drag, a menu item, a snooze preset, the first message of a thread.
  It would wrap event handlers in hidden forms to fit the rule.

## Decision

**Option A.** Why: Developer experience and the user's work come before the shorter adapter. The
page holds state the server doesn't (drafts, optimistic placement, the open record panel), and
an error page throws it away. Option A keeps the conventions' module side as it is and only moves
where the adapter's answer is shown. Without the client-held state, Option 0 would do.

## Consequences

- `app/(workspace)/actions.ts` answers `T | Refusal` from every action, `Refusal` being
  `{ error: string; signIn?: true }`. `notFound()` and `forbidden()` are not used there.
- `app/(workspace)/_components/use-action.ts` holds `callAction` and `useAction`: a rejected
  call answers with copy, and `signIn` sends the browser to `/api/sign-in?returnTo=<this page>`
  with a full load. The ESLint disable for `@next/next/no-location-assign-relative-destination`
  there is this decision: `/api/sign-in` is a route handler, not a page.
- Departs from CONVENTIONS.md, Errors, the Action column for "Missing, not-owned or malformed id"
  (`{ error }` instead of `notFound()`) and "Bug" (copy in the caller instead of `error.tsx`).
  Commands, queries and route handlers follow the table.
- Enforced by review.

## Reversing this decision

Where a route is added that renders server state only, its actions follow the table: call
`notFound()` and let `error.tsx` catch the rest. For the workspace, the switch back is per action:
replace the `instanceof <Noun>NotFound` branch with `notFound()` and drop the call's rollback.
The modules don't change.

## Sources

- Next.js docs, "Error Handling", expected errors in Server Functions
- React docs, `useOptimistic`
