# ADR 0010: The workspace's UI is grouped by the noun it renders

- **Status:** Accepted. Since conventions 0.7.0 the conventions say this: NAMING.md groups a
  `_components/` that no longer scans flat by the noun its components render.
- **Date:** 2026-11-14
- **Deciders:** Michael Laser
- **Related:** `docs/adr/0008-component-roles-the-list-lacks.md`, `docs/adr/0011-a-providers-browser-door.md`

## Context

CONVENTIONS.md, Layout and Deliberately dropped: a module holds no UI. A component sits in the
nearest `_components/`, or flat in `components/` once two route groups render it; a
`components/<module>/` folder was dropped because it read as the module's UI layer and nobody
could say when a component went there. NAMING.md says which `_components/` a component goes in,
not how that folder is laid out.

The workspace is one page in one route group, `app/(workspace)/`, so all of its UI lands in one
`_components/`: 79 files once the modules gave theirs up. Flat, the folder no longer shows what
belongs together: GitHub's views sat beside the sidebar under a `github-` prefix, and adding a
provider would add more prefixed files to the same list.

## Options

### Option 0: Flat `_components/`

- ✅ No rule to keep: every component is in the same folder.
- ❌ 79 files and growing with each provider. A feature's UI is found by its file name prefix
  only, and the prefixes (`record-`, `thread-`, `use-`) don't hold for every file.

### Option A: Folders inside `_components/`, by the noun a component renders

`threads/`, `records/`, `integrations/`, `skills/`, `projects/`, `markdown/`, `html-render/`, and
`providers/<id>/` for one provider's views and chat cards. The shell, the sidebar, the settings
panel and the pieces several folders use (`icon-button`, `copy-button`, `use-action`,
`time-format`) stay at the root.

- ✅ A feature's UI is one folder again, as it was in the modules before the adoption, without
  putting UI in a module.
- ✅ A provider's browser code has a place of its own (`providers/github/`), the counterpart of
  `modules/integrations/providers/github/`.
- ❌ Some folder names are module names. They are still route-local UI, not the module's UI
  layer: a second route group that renders one moves it to `components/`, as the conventions say.

## Decision

**Option A.** Why: Developer experience ("a feature's code sits together; you can find it in one
folder") and "One place per fact". The rule for where a file goes is the noun it renders: a
thread's row is under `threads/`, the record panel under `records/`, GitHub's pull request view
under `providers/github/`. A component that renders several nouns, or none, is at the root.

## Consequences

- `app/(workspace)/_components/` has one folder per noun and a short root.
- Not a departure. Under 0.6.0 the conventions didn't say how a `_components/` folder is laid
  out, and this ADR recorded the reading; 0.7.0 made it the rule in NAMING.md.
- Enforced by review.

## Reversing this decision

Move every file back to the root (the imports are relative and mechanical to rewrite).
