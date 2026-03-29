# P0-3: Feed Refresh Pipeline Tests - Handoff (post P0-2)

## Current Status (as of 2026-03-29)

- Unit tests: `npm run test:unit` is green (64 test files / 469 tests).
- Coverage: `npm run test:unit -- --coverage` currently **fails** global thresholds (Lines 40% | Branches 30% | Functions 50%) because current global coverage is ~Lines 28.05% | Branches 24.94% | Functions 21.37%.
- P0-2 added a baseline suite for `ArticleSaver` in `test_files/unit/services/article-saver.test.ts` and extended `test_files/stubs/obsidian.ts` with `fileManager` + `vault.createFolder` + `Notice.hide()`.

## Task (P0-3)

Add integration-style tests for the **Feed Fetch → Parse → Persist → View Refresh** pipeline.

The goal is to test the behavior of `RssDashboardPlugin.refreshFeeds()` in `main.ts` with real-ish objects (App stubs, settings feeds) while mocking only the network/parsing boundary.

### Suggested Test File(s)

- Create: `test_files/unit/main/feed-refresh-pipeline.test.ts`
- Optional follow-up: `test_files/unit/views/dashboard-refresh.test.ts` (only if the first file doesn’t exercise view refresh paths enough)

## What to Test

### refreshFeeds() happy path

- Calls `this.feedParser.refreshAllFeeds(feedsToRefresh)` with:
  - all feeds when `selectedFeeds` is omitted
  - only selected feeds when provided
- Merges returned feeds back into `this.settings.feeds` by matching `feed.url`
- Calls `validateSavedArticles()` and `saveSettings()`
- Refreshes the active dashboard view (calls `view.refresh()`) when present

### refreshFeeds() error path

- When `refreshAllFeeds()` rejects/throws:
  - does not throw out of `refreshFeeds()`
  - shows an error Notice (the stub logs to console)

### Minimal “pipeline” assertion

- With a starting feed that contains items, return an updated feed from `refreshAllFeeds()` and assert the plugin’s in-memory settings now reflect the updated feed data (e.g., new item count, updated lastUpdated).

## Mocking Notes

- Mock the parsing/fetch boundary by stubbing `plugin.feedParser.refreshAllFeeds` (do not rely on `requestUrl` for these tests).
- For view refresh:
  - Prefer `vi.spyOn(plugin as any, "getActiveDashboardView").mockResolvedValue({ refresh: vi.fn() })`
  - If you’d rather avoid private method patching, wire the stubbed `app.workspace` leaves so `getActiveDashboardView()` finds an active `RssDashboardView`, but that’s heavier.
- `main.ts` is imported in tests via the Vitest alias (`main` / `../main` / `./main` / `../../../main`).

## Likely Stub Gaps (if you go deeper than refreshFeeds)

If you expand P0-3 into view-level integration, you may need to extend `test_files/stubs/obsidian.ts` further:

- `workspace.getLeavesOfType()` returning leaf objects with a `view` instance
- More complete `WorkspaceLeaf` behavior (if view lifecycle methods are exercised)

## Next Step After P0-3

- P0-4: `src/components/folder-selector-popup.ts` unit tests (currently 0% coverage per latest v8 report).

