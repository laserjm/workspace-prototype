# Project conventions

This project follows the `nextjs` conventions profile pinned in `ARCHITECTURE.md` (version
0.3.0). Before writing or changing code:

- Read `ARCHITECTURE.md`: the header names the profile, bindings, app root, legacy folders and
  rulesets; the sections record this project's interpretations and deviations.
- Run `pnpm exec conventions lint <files>` on what you changed and `pnpm exec conventions check` before you
  finish. Every message carries a rule id; `pnpm exec conventions explain <RULE-ID>` prints the rule.
- Fix a finding by reading the rule, never by disabling it. A disabled rule needs a Deviations row.
- The `nextjs-conventions` skill (Claude Code plugin `conventions`) has the workflow for new
  modules, use cases, repositories and reviews.
