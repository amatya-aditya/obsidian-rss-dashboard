---
status: accepted
created: 2026-09-14
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/262"
milestone: "2.7.0"
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Pre-release repo-hygiene checklist and scan script

## Problem

The repo has a documented release *process* (CONTRIBUTING.md Release
Process, `docs/development/release-notes-workflow.md`) and a documented Plan
Lifecycle convention (every active plan carries a `status`; implemented plans
move to `docs/archive/plans/`), but nothing automated verifies either before a
release is cut — both rely on someone remembering to do it by hand.

Concretely:

- Stray/leftover files can sit in the repo (tracked or untracked) unnoticed —
  e.g. `scripts/check-commit-message.mjs.bak` is currently in the tree.
- Plans under `docs/plans/` can drift without a valid `status`, or remain
  there after implementation instead of moving to `docs/archive/plans/`.
- `docs/archive/README.md`'s catalog can fall out of sync with
  `docs/archive/plans/` contents.

None of this is caught by `npm run check:compliance` or `npm run build`.

## Scope

1. `docs/development/pre-release-checklist.md` — a checklist to run before
   CONTRIBUTING.md's "Step 2 — Cut the Release Branch", covering both the
   automated and manual items below.
2. `scripts/check-pre-release.mjs` — automates the parts that are safe to run
   on tracked files at any time (not just at release cut), following the
   pattern of `check-css-scope.js` / `check-platform-compat.mjs` /
   `check-css-important.mjs`, wired into `npm run check:compliance`:
   - no `.bak`/`.orig`/`.swp`/`.swo`/`~`/`.DS_Store`/`Thumbs.db` file tracked
     in the repo
   - every lifecycle-named file under `docs/plans/` (matching the Plan
     Filename Convention) has a `status` in frontmatter, and it's one of the
     active-plan values (`idea`, `proposed`, `accepted`, `blocked`,
     `in-progress`) — catching a plan that should have moved to
     `docs/archive/plans/` but didn't

   Deliberately **not** automated into `check:compliance`: working-tree
   cleanliness (`git status --porcelain`). That check only makes sense at the
   moment of cutting a release branch — automating it into the per-PR build
   gate would false-positive on ordinary untracked WIP files during normal
   development. It stays a manual checklist item instead.
3. Manual checklist items (not automatable, or judgment calls): clean
   `git status --porcelain` before cutting, `docs/archive/README.md` catalog
   in sync with `docs/archive/plans/`, `CHANGELOG.md` Unreleased section
   matches merged `changelog:yes` PRs, `npm run build` passes.

## Out of scope

- Automating the changelog/archive-catalog cross-checks (still manual;
  candidate follow-up plan).

## Validation

- `npm run check:compliance` fails when a stray `.bak` file or a
  status-less/invalid-status plan file is present, and passes on a clean
  tree.
- `npm run build` passes with the new gate wired in.

## Notes

Filed as a `type:chore` / no-user-facing-impact change; `changelog:no`.
