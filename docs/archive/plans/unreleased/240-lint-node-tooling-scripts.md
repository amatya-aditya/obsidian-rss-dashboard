---
status: implemented
created: 2026-09-10
issue: ""
milestone: ""
owner: unassigned
workstream: configuration-alignment
sequence: 2
depends_on:
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/240
release_requirement: ""
implementation: ""
---

# Lint Node-only repository tooling with a scoped ESLint policy

## Scope

Keep `scripts/**/*.mjs` included in linting. Add a tooling-only Node policy that exempts only rules based on mobile-runtime assumptions, retain ordinary correctness checks, use `process` rather than `globalThis.process`, and permit command-line console output only for tooling scripts.

## Acceptance criteria

- The five named Node tooling scripts lint with zero errors and warnings.
- Runtime plugin files retain the existing Obsidian mobile and popout policy.
- `npm run lint` and `npm run build` pass.
