# P2-5: Coverage Ratchet + Threshold Roadmap - Handoff (post P2-4)

## Status

P2-4 is complete (delivered on 2026-03-29).

P2-5 is complete (delivered on 2026-03-29).

- Added unit tests:
  - `test_files/unit/utils/favicon-utils.test.ts`
  - `test_files/unit/utils/podcast-platforms.test.ts`
  - `test_files/unit/utils/sidebar-icon-registry.test.ts`
  - `test_files/unit/utils/tag-utils.test.ts`
- Updated: `docs/development/test-coverage-improvement-plan.md` with ratchet rules
- Updated: `vitest.config.mjs` global thresholds bump (first ratchet step)

## Context

CI runs `npm run test:unit -- --coverage`, which enforces global coverage thresholds via `vitest.config.mjs`.

We want a lightweight process to raise the thresholds over time (so the floor doesn't stagnate) without re-blocking merges unexpectedly.

### Current baseline (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines 35.46% | Branches 30.38% | Functions 29.49%
- Thresholds (`vitest.config.mjs`): Lines 35 | Branches 30 | Functions 29

## Task (P2-5)

Add a "ratchet" roadmap for coverage thresholds and begin the first incremental bump once tests improve coverage.

### Step 1: Document the ratchet rules

Completed: ratchet rules were added to `docs/development/test-coverage-improvement-plan.md`.

### Step 2: First bump target (only after coverage rises)

Completed: thresholds were raised to:

- `lines: 35`
- `branches: 30`
- `functions: 29`

### Step 3: Decide when to include `main.ts`

Still pending. Currently, coverage collection is limited to `src/**/*.ts`. Before expanding it:

- Run `npm run test:unit -- --coverage` with `include` expanded to include `main.ts` locally and record the delta.
- Only land the include expansion in a PR that either:
  - adds enough tests to offset any coverage drop, or
  - adjusts thresholds intentionally with a written follow-up bump plan.

## Verification

- `npm run test:unit -- --coverage` stays green locally after any threshold changes
- GitHub Actions `Test` workflow passes on a PR

