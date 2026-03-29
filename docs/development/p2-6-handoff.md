# P2-6: Coverage Include Expansion (main.ts) + Next Ratchet - Handoff (post P2-5)

## Status

P2-6 is complete (delivered on 2026-03-29).

- Updated: `vitest.config.mjs` `coverage.include` now includes `main.ts`
- Updated: `vitest.config.mjs` thresholds (branches only) `30 -> 29` to keep CI green after the include expansion
- Verified: `npm run test:unit -- --coverage` is green (80 files / 590 tests)
- New global snapshot (2026-03-29, includes `main.ts`): Lines **35.19%** | Branches **29.98%** | Functions **29.17%**
- Previous global snapshot (2026-03-29, before including `main.ts`): Lines 35.46% | Branches 30.38% | Functions 29.49%
- Next ratchet target (threshold + 0.75%): Lines >= 35.75% | Branches >= 29.75% | Functions >= 29.75% (then bump to 36/30/30)

## Context

CI enforces a global coverage floor via `npm run test:unit -- --coverage` and `vitest.config.mjs` thresholds.

### Baseline impact (2026-03-29)

Including `main.ts` in coverage collection slightly lowers the global totals because `main.ts` is large and only partially covered today.

- Delta (before -> after): Lines **-0.27%** | Branches **-0.40%** | Functions **-0.32%**
- Threshold adjustment required to keep CI stable: Branches `30 -> 29` (Lines and Functions unchanged)

This repo already has meaningful `main.ts` unit tests (plugin lifecycle). With this change, those tests now contribute to the reported global coverage totals.

## Task (P2-6)

Decide when and how to include `main.ts` in coverage collection with a "no surprise" rollout that keeps CI stable.

### Step 1: Measure the delta locally

Temporarily expand `coverage.include` to include `main.ts` and run:

- `npm run test:unit -- --coverage`

Record:

- New global snapshot (Lines/Branches/Functions)
- Whether any file-level reports become unexpectedly noisy (e.g., lots of generated/stubbed code)

### Step 2: Land the include expansion safely

In a dedicated PR (separate from any threshold bump):

- Update `vitest.config.mjs` `coverage.include` to include `main.ts` (and only `main.ts`, not `main.js`)
- If the include expansion drops global coverage below thresholds, adjust thresholds downward *only as much as needed* to keep CI green
- Add a short follow-up note in the PR description with the new baseline and an explicit next-bump target

### Step 3: Resume ratcheting after the include expansion

After the include PR lands:

- Add targeted tests in `main.ts` and other high-leverage modules to recover any coverage drop
- When global coverage is >= (threshold + 0.75%) for each metric, bump:
  - `lines +1`
  - `branches +1`
  - `functions +1`

## Verification

- `npm run test:unit -- --coverage` is green locally
- GitHub Actions `Test` workflow passes on a PR
- The PR clearly documents the baseline change caused by including `main.ts`
