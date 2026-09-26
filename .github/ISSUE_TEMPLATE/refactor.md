---
name: Refactor
about: One behavior-preserving extraction under #436
title: 'refactor(<file>): <extraction>'
labels: ''
assignees: ''

---

<!--
One extraction per ticket and per PR. Rules: "Refactors (#436)" in AGENTS.md.
Commit mechanics: "Refactor Commits" in docs/development/architecture.md.
-->

## Source

`<path>` at `<commit hash>`: symbols or line range being extracted.

## Destination

New module path and its public interface.

## Over-limit functions and split plan

Each function being moved that exceeds 150 lines or complexity 20, and the
existing blocks it splits into, each moved verbatim. Write "None" if nothing
moved is over the limits.

## Shared helpers and singletons

Helpers both sides use, and module-level state such as counters or caches,
and the leaf module they move to. Write "None" if there are none.

## State that stays with the owner

State the source file keeps, and how the new module reads it (for example, a
`ReadonlyMap` passed in). Confirm the owner never reassigns it.

## Out of scope

## Blocked by / blocks

## Affected UI surfaces

The UI and flows the moved code serves. This scopes the manual checklist.

## Scoped checklist

- Baseline checklist items: <numbers>
- Extra checks for the edge cases the moved code handles: <list>
- Files on disk to verify: <paths, such as `rss-dashboard-data/user-state.json`>

## Acceptance

- [ ] Characterization tests green on untouched code, and untouched by the extraction
- [ ] Two commits, move only then wiring, each passing the gates
- [ ] Scoped checklist passes in the fixture vault, including plugin disable/enable
- [ ] Ratchet lowered and suppressions pruned in the wiring commit
- [ ] `npm run build` and `npm run test:unit` green; raw `vitest` summary line and `git diff --stat` in the PR
- [ ] Bugs found filed as separate `status: blocked` issues and linked
