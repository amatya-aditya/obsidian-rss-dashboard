---
status: proposed
created: 2026-09-10
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/240"
milestone: ""
owner: unassigned
workstream: configuration-alignment
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Align repository tooling with the Obsidian sample-plugin baseline

## Problem and value

The repository's TypeScript and ESLint configuration differs from the current Obsidian sample plugin. Review each material variance as adopted, intentional, or deferred; do not copy the sample wholesale.

## Current evidence

- `strictNullChecks` was already effective through `strict: true` and explicitly present in `HEAD`.
- Adding `noUncheckedIndexedAccess` yields 260 TypeScript errors in 43 files; the same compiler command with that option disabled has zero errors.
- Including `scripts/**/*.mjs` in lint yields 5 errors and 13 warnings because mobile-runtime rules are applied to Node-only tooling.
- `version-bump.mjs` should preserve an existing compatibility floor for a target already in `versions.json`.

## Planned work

- Adopt `noUncheckedIndexedAccess` only through green remediation slices.
- Lint Node-only tools with a scoped policy while keeping runtime rules intact.
- Validate idempotent version-bump behavior.

## Acceptance criteria

- Each material upstream configuration difference is recorded as adopted, intentional, or deferred.
- Any adopted configuration change passes its full relevant validation gate.
- `npm run build` passes before the parent work is complete.
