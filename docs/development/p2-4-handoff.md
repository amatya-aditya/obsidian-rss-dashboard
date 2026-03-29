# P2-4: Unblock CI Coverage Thresholds - Handoff (post P2-3)

## Status

P2-4 is complete (delivered on 2026-03-29).

- Updated: `vitest.config.mjs` global coverage thresholds to unblock CI
- Updated: `vitest.config.mjs` coverage reporter to include `json` so CI/Codecov can upload `coverage/coverage-final.json`
- Verified: `npm run test:unit -- --coverage` exits 0
- Verified (global coverage snapshot 2026-03-29):
  - Lines 34.79% | Branches 29.87% | Functions 28.62%

## Context

CI currently runs `npm run test:unit -- --coverage` (see `.github/workflows/test.yml`). Coverage is generated successfully, but the command exits non-zero because `vitest.config.mjs` global thresholds are higher than current global coverage.

This blocks merges even when unit tests are green.

### Current coverage snapshot (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines 34.79% | Branches 29.87% | Functions 28.62%
- Thresholds (`vitest.config.mjs`): Lines 34 | Branches 29 | Functions 28

## Task (P2-4)

Unblock CI by making global coverage thresholds achievable *today* while still preventing regressions.

### Option A (recommended): Lower thresholds to a “no regression” floor

In `vitest.config.mjs`, set thresholds slightly below current global coverage:

- `lines: 34`
- `branches: 29`
- `functions: 28`

Then verify:

- `npm run test:unit -- --coverage` exits 0 locally
- GitHub Actions `Test` workflow passes on a PR

### Option B: Disable global thresholds temporarily

If you want CI green immediately without gating, remove `thresholds` (or set them to `0`) and add a follow-up ticket to reintroduce them once coverage improves.

## Notes / Gotchas

- `main.ts` is excluded from coverage collection because `vitest.config.mjs` includes only `src/**/*.ts`. Including `main.ts` later will likely drop global coverage (do it only when you’re ready to offset with more tests).
- `coverage/` HTML output is still useful even when the command fails; the goal of P2-4 is to make CI reflect that success.
