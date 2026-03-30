# P3-7: Coverage Threshold Ratchet Bump (post P3-6) - Handoff

## Status

P3-7 is **complete** (implemented 2026-03-30).

### Snapshot (after P3-7) (2026-03-30)

From `npm run test:unit -- --coverage`:

- Global: Lines **42.22%** | Branches **32.38%** | Functions **36.30%**
- Thresholds (`vitest.config.mjs`): Lines **39** | Branches **32** | Functions **33**

Partial ratchet applied (Option A — rules-compliant):

| Metric    | Old Threshold | New Threshold | Change |
|-----------|---------------|---------------|--------|
| Lines     | 38            | 39            | +1     |
| Branches  | 32            | 32            | —      |
| Functions | 32            | 33            | +1     |

Branches held at 32 (gap only +0.38, gate requires ≥ 0.75).

## Context

P3-6 bumped all three coverage thresholds by +1 (lines 37→38, branches 31→32,
functions 31→32). No new tests were added; this was a clean ratchet-only PR.

### Snapshot (before P3-7) (2026-03-30)

From `npm run test:unit -- --coverage`:

- Global: Lines **42.22%** | Branches **32.38%** | Functions **36.30%**
- Thresholds (`vitest.config.mjs`): Lines **38** | Branches **32** | Functions **32**

## Ratchet rule + target

Ratchet rule (from `docs/development/test-coverage-improvement-plan.md`):

- Bump `lines`, `branches`, and `functions` by `+1` when the corresponding
  global metric is `>= (threshold + 0.75%)`.

Gate evaluation:

| Metric    | Actual | Threshold | Gap    | Gate (≥ +0.75)? |
|-----------|--------|-----------|--------|-----------------|
| Lines     | 42.22  | 38        | +4.22  | ✅              |
| Branches  | 32.38  | 32        | +0.38  | ❌ (< 0.75)     |
| Functions | 36.30  | 32        | +4.30  | ✅              |

**Branches gate is NOT satisfied** (margin only +0.38, need ≥ 0.75).

Two options for P3-7:

1. **Write targeted branch-covering tests first** to push branches above 32.75,
   then run a combined ratchet bump for all three metrics.
2. **Ratchet lines + functions only** (→ 39 and 33) now, then ratchet branches
   once the margin is sufficient.

Option 2 is the safer, rule-compliant path if you want to keep the PR clean.

## Task (P3-7)

### Option A – Partial ratchet (rules-compliant, no new tests)

Update `vitest.config.mjs` thresholds:

- `coverage.thresholds.lines`: `38` → `39`
- `coverage.thresholds.branches`: leave at `32` (gate not met)
- `coverage.thresholds.functions`: `32` → `33`

### Option B – Add branch tests then full ratchet

1. Write tests that cover currently-uncovered branches (high-value targets are
   flagged in the coverage report: `src/views/`, `src/tabs/article-list.tab.ts`,
   `src/components/`).
2. Re-run coverage; confirm branches ≥ 32.75 before bumping the threshold.
3. Bump all three thresholds by +1: lines 38→39, branches 32→33, functions 32→33.

### Constraints

- Do **not** change `coverage.include` / `coverage.exclude`.
- No new dependencies.

## Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0
- Confirm the printed "All files" totals remain comfortably above the new thresholds.
