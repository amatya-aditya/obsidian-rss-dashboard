# P3-4: Coverage Threshold Ratchet Bump (post P3-3) - Handoff

## Status

P3-4 is **complete** (implemented 2026-03-29).

## Context

P3-3 added additional modal tests (no `coverage.include/exclude` changes) and lifted global coverage further while keeping thresholds unchanged.

### Snapshot (before P3-4) (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines **41.19%** | Branches **32.14%** | Functions **34.55%**
- Thresholds (`vitest.config.mjs`): Lines **36** | Branches **30** | Functions **30**

## Ratchet rule + target

Ratchet rule (from `docs/development/test-coverage-improvement-plan.md`):

- Bump `lines`, `branches`, and `functions` by `+1` when the corresponding global metric is `>= (threshold + 0.75%)`.
- Never raise thresholds in the same PR that significantly expands coverage surface area.

Given the snapshot above, the bump gate is satisfied, so this phase should raise thresholds to:

- Lines **37**
- Branches **31**
- Functions **31**

## Task (P3-4)

### Deliverable

Update `vitest.config.mjs` thresholds only:

- `coverage.thresholds.lines`: `36` → `37`
- `coverage.thresholds.branches`: `30` → `31`
- `coverage.thresholds.functions`: `30` → `31`

### Constraints

- Do **not** change `coverage.include` / `coverage.exclude`.
- Do **not** add tests or refactors in this PR (keep it a clean ratchet bump).
- No new dependencies.

## Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0
- Confirm the printed “All files” totals remain comfortably above the new thresholds.

## Snapshot (after P3-4) (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines **41.19%** | Branches **32.14%** | Functions **34.55%** (unchanged)
- Thresholds (`vitest.config.mjs`): Lines **37** | Branches **31** | Functions **31**

