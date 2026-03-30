# P3-3: Additional Modal Coverage (post P3-2) - Handoff

## Status

P3-3 is **complete** (implemented 2026-03-30).

## Context

P3-2 raised global coverage thresholds in `vitest.config.mjs` to:

- Lines **36**
- Branches **30**
- Functions **30**

Baseline snapshot (2026-03-29) from `npm run test:unit -- --coverage`:

- Global: Lines **39.71%** | Branches **31.57%** | Functions **32.95%**

The largest remaining gap is still **modals** (many files at/near 0% coverage), and several of the remaining modal files are high-risk user flows (navigation, previews, success/confirmation UI).

## Task (P3-3)

### Deliverables

Add targeted unit tests (jsdom) for additional modal files that are currently untested/near-0%:

- `src/modals/feed-preview-modal.ts`
- `src/modals/feed-manager-modal.ts` (thin wrapper in `src/modals/`)
- `src/modals/import-success-modal.ts`
- `src/modals/mobile-navigation-modal.ts`
- `src/modals/mobile-discover-filters-modal.ts`

### Constraints

- Do **not** change `coverage.include` / `coverage.exclude`.
- Do **not** raise thresholds in this phase (keep the ratchet bump work in its own PR).
- No new dependencies.
- Expand `test_files/stubs/obsidian.ts` only as needed to support modal behavior (minimal surface area).

## Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0
- Record the new global snapshot (Lines/Branches/Functions) for the next ratchet decision.

## Snapshot (after P3-3) (2026-03-30)

From `npm run test:unit -- --coverage`:

- Global: Lines **41.19%** | Branches **32.14%** | Functions **34.55%**
- Thresholds (`vitest.config.mjs`): Lines **36** | Branches **30** | Functions **30** (unchanged)

### What was added

- New unit tests:
  - `test_files/unit/modals/feed-preview-modal.test.ts`
  - `test_files/unit/modals/feed-manager-modal-wrapper.test.ts`
  - `test_files/unit/modals/import-success-modal.test.ts`
  - `test_files/unit/modals/mobile-navigation-modal.test.ts`
  - `test_files/unit/modals/mobile-discover-filters-modal.test.ts`
- Minimal test DOM polyfill:
  - `test_files/unit/test-dom-polyfills.ts`: add `HTMLElement.appendText()` polyfill used by modals/views
- Coverage config tweak (no include/exclude/threshold changes):
  - `vitest.config.mjs`: add `lcov` reporter (keeps existing reporters)

## Notes

If global coverage remains `>= (threshold + 0.75%)` after P3-3, the next dedicated ratchet bump would be:

- Lines **37**
- Branches **31**
- Functions **31**
