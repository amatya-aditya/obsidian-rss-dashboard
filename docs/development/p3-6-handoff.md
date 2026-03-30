# P3-6: Coverage Threshold Ratchet Bump (post P3-5) - Handoff

## Status

P3-6 is pending (not started).

## Context

P3-5 added Settings-focused tests (plus a small DOM polyfill fix) and increased global coverage while keeping thresholds unchanged.

### Snapshot (before P3-6) (2026-03-30)

From `npm run test:unit -- --coverage`:

- Global: Lines **42.22%** | Branches **32.38%** | Functions **36.30%**
- Thresholds (`vitest.config.mjs`): Lines **37** | Branches **31** | Functions **31**

## Ratchet rule + target

Ratchet rule (from `docs/development/test-coverage-improvement-plan.md`):

- Bump `lines`, `branches`, and `functions` by `+1` when the corresponding global metric is `>= (threshold + 0.75%)`.
- Never raise thresholds in the same PR that significantly expands coverage surface area.

Given the snapshot above, the bump gate is satisfied, so this phase should raise thresholds to:

- Lines **38**
- Branches **32**
- Functions **32**

## Task (P3-6)

### Deliverable

Update `vitest.config.mjs` thresholds only:

- `coverage.thresholds.lines`: `37` → `38`
- `coverage.thresholds.branches`: `31` → `32`
- `coverage.thresholds.functions`: `31` → `32`

### Constraints

- Do **not** change `coverage.include` / `coverage.exclude`.
- Do **not** add tests or refactors in this PR (keep it a clean ratchet bump).
- No new dependencies.

## Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0
- Confirm the printed “All files” totals remain comfortably above the new thresholds.
