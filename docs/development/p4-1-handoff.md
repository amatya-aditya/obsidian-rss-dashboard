# P4-1: Branch Coverage Push (post P3-7) - Handoff

## Status

P4-1 is pending (not started).

## Context

P3-7 applied a partial ratchet bump (lines 38→39, functions 32→33). Branches were
held at 32 because the gap between actual coverage (32.38%) and the next bump gate
(32.75%) was only +0.38 — below the required ≥ 0.75.

### Snapshot (before P4-1) (2026-03-30)

From `npm run test:unit -- --coverage`:

- Global: Lines **42.22%** | Branches **32.38%** | Functions **36.30%**
- Thresholds (`vitest.config.mjs`): Lines **39** | Branches **32** | Functions **33**

### Why branches lag

Lines and functions benefit from any new test, even shallow ones (calling a function
once covers all its lines and marks it as "covered"). Branches require tests that
exercise both sides of every conditional (`if/else`, ternary, `&&`/`||` short-circuits,
optional chaining, switch cases).

The files flagged in the coverage report with the most uncovered branches:

| File                                         | Est. Branch Coverage |
|----------------------------------------------|----------------------|
| `src/views/article-list.ts`                  | ~18%                 |
| `src/views/reader-view.ts`                   | ~18%                 |
| `src/tabs/article-list.tab.ts`               | ~17%                 |
| `src/components/sidebar.ts`                  | ~3–4%                |
| `src/modals/feed-manager/feed-manager-modal.ts` | ~24%              |

---

## Goal

Push global branch coverage from **32.38%** to **≥ 32.75%** (only +0.37 pp needed)
so that the branches ratchet gate is met and P4-2 can bump all three thresholds.

> [!NOTE]
> The delta required is very small (+0.37 pp). A handful of well-targeted tests
> should be sufficient. Focus on high-branch-density files rather than large new
> test suites.

---

## Task (P4-1)

### Approach

Write **targeted branch-covering tests** for the highest branch-density gaps. The
recommended targets in priority order:

1. **`src/views/article-list.ts`** — large file, many conditionals around filtering,
   sorting, scroll-restore, save-state. Even covering a few more branch pairs here
   will move the global number.

2. **`src/components/sidebar.ts`** — currently ~3.94% line coverage / very low
   branch coverage. Even basic render + interaction tests will contribute meaningfully.

3. **`src/tabs/article-list.tab.ts`** — tab orchestration logic with conditional
   view lifecycle branches.

4. **`src/modals/feed-manager/feed-manager-modal.ts`** — conditional rendering,
   delete confirmation, pagination branches.

### Constraints

- Do **not** change `coverage.include` / `coverage.exclude`.
- Do **not** raise thresholds in this phase (keep the ratchet bump isolated to P4-2).
- No new dependencies.
- Expand `test_files/stubs/obsidian.ts` only as needed (minimal surface area).

### Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0
- Confirm "All files" Branches total is **≥ 32.75%** before proceeding to P4-2.
- Record the new global snapshot in P4-2's handoff doc.

---

## Next ratchet checkpoint (after P4-1)

After P4-1 lands with branches ≥ 32.75%, proceed to **P4-2** (dedicated ratchet bump):

| Metric    | Current Threshold | Target (P4-2) | Gate (≥ threshold + 0.75) |
|-----------|-------------------|---------------|---------------------------|
| Lines     | 39                | 40            | ≥ 39.75% → actual 42.22% ✅ |
| Branches  | 32                | 33            | ≥ 32.75% → need ≥ 32.75% ❌ (close) |
| Functions | 33                | 34            | ≥ 33.75% → actual 36.30% ✅ |

Branches is the only blocker. Once it crosses 32.75%, P4-2 can bump all three.
