# Handoff: RSS Dashboard Compliance & Type Safety

## Context
We are systematically improving the plugin's compliance with Obsidian's strict type safety and popout window compatibility requirements. 

## Completed in this Session
- **Pass 6**: Resolved TypeScript `Timeout` vs `number` type mismatches in `src/views/kagi-smallweb-view.ts`.
- Verified that `activeWindow.setTimeout` and `activeWindow.clearTimeout` are used correctly.
- Updated `docs/plugin-scorecard.md` to reflect progress.

## Current State
- **Compliance Score**: 46% (Needs recalculation after full Pass 6 completion).
- **Test Lint Backlog**: 0 errors remaining (Pass 5).
- **Warnings Remaining**:
    - `activeDocument` migration: 71 items.
    - `setTimeout`/`clearTimeout` migration: 10 items (8 remaining).
    - DOM API migration (`createDiv`, `createEl`): ~15 items.

## Next Highest ROI Target
**Target**: Migrate `document` to `activeDocument` in `src/components/article-list.ts`.

**Rationale**:
- `article-list.ts` is the most complex component with 6 remaining `document` references.
- It is a central part of the UI and essential for popout window stability.
- Success here will establish a pattern for the remaining 65+ occurrences.

## Files to Focus On
1. `src/components/article-list.ts` (Lines: 463, 496, 797, 1572, 1584, 2054)
2. `src/components/article-filter-menu.ts` (Currently open, part of the same UI subsystem)

## Technical Note
When migrating `document` to `activeDocument`, ensure that any DOM elements created are attached to the correct window's document. In classes, you can often derive the correct document from a passed-in `containerEl` or `toggleBtn` using `el.ownerDocument`.
