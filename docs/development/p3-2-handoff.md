# P3-2: Coverage Threshold Ratchet Bump (post P3-1) - Handoff

## Status

P3-2 is **complete** (implemented 2026-03-29).

## Context

P3-1 added modal + settings tests and lifted global coverage well above the current thresholds, while keeping `coverage.include` unchanged.

This phase is the **dedicated ratchet bump PR** (no coverage-surface expansion; only raise thresholds).

## Snapshot (before P3-2) (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines **39.71%** | Branches **31.57%** | Functions **32.95%**
- Thresholds (`vitest.config.mjs`): Lines **35** | Branches **29** | Functions **29**

## Ratchet rule + target

Ratchet rule (from `docs/development/test-coverage-improvement-plan.md`):

- Bump `lines`, `branches`, and `functions` by `+1` when the corresponding global metric is `>= (threshold + 0.75%)`.
- Never raise thresholds in the same PR that significantly expands coverage surface area.

Given the snapshot above, the bump gate is satisfied, so this phase should raise thresholds to:

- Lines **36**
- Branches **30**
- Functions **30**

## Task (P3-2)

### Deliverable

Update `vitest.config.mjs` thresholds only:

- `coverage.thresholds.lines`: `35` → `36`
- `coverage.thresholds.branches`: `29` → `30`
- `coverage.thresholds.functions`: `29` → `30`

### Constraints

- Do **not** change `coverage.include` / `coverage.exclude`.
- Do **not** add tests or refactors in this PR (keep it a clean ratchet bump).
- No new dependencies.

## Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0
- Confirm the printed “All files” totals are still comfortably above the new thresholds.

## Snapshot (after P3-2) (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines **39.71%** | Branches **31.57%** | Functions **32.95%** (unchanged)
- Thresholds (`vitest.config.mjs`): Lines **36** | Branches **30** | Functions **30**

## Notes / Next phase

After P3-2 lands, continue with additional modal + settings coverage work (same ROI category as P3-1), but keep the “raise thresholds” and “expand tested surface area” concerns separated into different PRs.
