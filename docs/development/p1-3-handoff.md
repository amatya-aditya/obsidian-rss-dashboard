# P1-3: Discover View Tests - Handoff (post P1-2)

## Status

P1-3 is complete (delivered on 2026-03-29).

- Added: `test_files/unit/views/discover-view.test.ts`
- Verified: `npm run test:unit` is green (71 files / 525 tests)
- Next recommended phase: P1-5 Article Saving Settings Tab tests: `docs/development/p1-5-handoff.md`

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P1-2 (Sidebar Ordering Controller tests) is complete as of 2026-03-29. The next recommended phase is P1-3: tests for `src/views/discover-view.ts`.

## Task (P1-3)

Add tests for the Discover view behavior (filters, pagination, and persistence).

- Create: `test_files/unit/views/discover-view.test.ts`
- Target: `src/views/discover-view.ts`
- Target coverage: 70%
- Risk: Medium-High (UI regressions + confusing filter state)

## What to Test (high value first)

### Data load + state restore

- `onOpen()` calls `loadData()` and `render()` without throwing.
- `loadData()`:
  - loads `discover-feeds.json` into `feeds`
  - builds `categoryMap` via `generateCategoryMap()`
  - restores filters from `app.loadLocalStorage("rss-discover-filters")`
  - calls `filterFeeds()` and sets `isLoading` false
- Error handling: invalid saved filter state should not crash rendering (should fall back to defaults).

### Filtering logic

Exercise `matchesFilters()` via `filterFeeds()` outcomes (use small synthetic feed metadata fixtures rather than the full JSON):
- Query filter matches title/description fields (case-insensitive).
- Selected types/tags/paths constrain results correctly.
- Follow status filter:
  - `"all"` shows everything
  - `"following"` includes only followed feeds
  - `"not-following"` includes only unfollowed feeds

### Pagination behavior

Verify that:
- `filterFeeds()` clamps `currentPage` when the filtered result set shrinks.
- Changing page size resets to page 1 and re-renders content.
- `computePagination` + `computeResultsRange` are reflected in the rendered results label.

### Persistence

- `saveFilterState()` writes to local storage (spy on `app.saveLocalStorage` if available in the stub).
- Removing a selected filter chip updates filters, resets page, saves state, and re-renders.

## Testing Notes

- `DiscoverView` is a DOM-heavy view; prefer isolating logic by:
  - stubbing `renderContent()` / `render()` if you only need to validate filter/pagination state changes
  - or rendering into `containerEl` and asserting on key selectors/labels for pagination + selected filters
- `src/views/discover-view.ts` imports `feedsData` JSON. For deterministic tests:
  - prefer mocking the JSON module (Vitest `vi.mock(...)`) and supplying a small fixture array
  - avoid depending on the real dataset size/order
- You may need to expand `test_files/stubs/obsidian.ts` for:
  - `ItemView` basics (`containerEl`, `registerDomEvent`, etc.)
  - `App.loadLocalStorage` / `App.saveLocalStorage`
  - `WorkspaceLeaf` minimal constructor behavior

## Suggested Minimal Fixtures

Use 3-5 `FeedMetadata` objects with:
- distinct `title`, `description`, `tags`
- varying `type` (e.g., rss/podcast/video if present)
- `domain/subdomain/area/topic` arrays that exercise `generateCategoryMap`
- a mix of `followStatus` values
