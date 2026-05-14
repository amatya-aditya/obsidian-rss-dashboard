# Test-Lint Backlog Tracker

Last updated: 2026-05-14 (Pass 22 completed)

This document tracks the test-file ESLint debt burn-down that branched from the audit scorecard after Pass 4.

Scope:

- Test-file lint backlog reduction and typed refactoring progress.
- ROI queue selection and pass-by-pass trend tracking.
- Validation outcomes (lint and test run status).

Out of scope:

- Direct plugin audit checklist ownership (tracked in `docs/plugin-scorecard.md`).

## Baseline and Handoff

- Handoff from scorecard at end of Pass 4:
  - Backlog at handoff: **2686 errors**, **54 warnings**
  - Test linting enforcement already enabled in ESLint config

## Progress Log

### Pass 5

- Continued systematic ESLint backlog burn-down in test files using the "one boundary cast" pattern: replace cascading `as any` with a single `as unknown as TypedInterface` at the scope boundary.
- Files fully cleaned (0 errors each):
  - `test_files/unit/views/dashboard-lifecycle.test.ts` — **101 → 0 errors**, 44/44 tests passing
  - `test_files/unit/services/article-saver.test.ts` — **119 → 0 errors**, 25/25 tests passing
  - `test_files/unit/main/plugin-lifecycle.test.ts` — **175 → 0 errors**, 63/63 tests passing
  - `test_files/unit/components/article-list-inplace-updates.test.ts` + `article-list-harness.ts` — **107 → 0 errors**, 7/7 tests passing
- Key fixes: typed `DashViewTestAPI`/`PluginPrivateAPI`/`PrivateSaverAPI` interfaces; replaced `(App as any).createMock()` with direct `App.createMock()`; targeted `eslint-disable-next-line` for legitimate Vitest `unbound-method` false positives; fixed `window as any` CSS polyfill; replaced Obsidian `createDiv()` with standard `document.createElement("div")`.
- Backlog trend this phase: **lint errors reduced from 2686 to 2020** (\-666), warnings still **54**.

### Pass 6

- Confirmed Pass 5 reductions remain reflected in the latest global ESLint snapshot and retained strict test-lint enforcement workflow.
- Refreshed ROI ranking from current `eslint-report.json` (72 files still carrying errors) and updated the execution queue to target highest-value files first.
- Current top-offender queue (live report at start of Pass 6):
  - `test_files/unit/modals/edit-feed-modal.test.ts` — **108** errors
  - `test_files/unit/views/discover-view.test.ts` — **102** errors
  - `test_files/unit/views/podcast-player.test.ts` — **99** errors
  - `test_files/unit/utils/filter-statusbar-counts.test.ts` — **93** errors
  - `test_files/unit/modals/import-opml-modal.test.ts` — **71** errors
- Backlog status at this checkpoint: **2020 errors**, **54 warnings**.

### Pass 7

- Targeted single highest-ROI file: `test_files/unit/modals/edit-feed-modal.test.ts` — **108 → 0 errors**.
- Created typed fixture interfaces at file scope:
  - `ArticleTestFixture` — typed return for `makeArticle()` helper (minimal FeedItem-like structure for test mocking)
  - `PluginTestFixture` — shape for plugin mock objects used in EditFeedModal tests
- Refactored all test fixture casts using "one boundary cast" pattern:
  - Updated `makeArticle()` to return `ArticleTestFixture` instead of `as any` (eliminates unsafeReturn + unexpectedAny)
  - Replaced 17 test cases' plugin literals: `plugin as any` → `plugin as unknown as PluginTestFixture` (consolidates ~40+ unsafeAssignment errors into 1 boundary cast per test)
  - Replaced all Feed object casts: `} as any` → `} as unknown as Feed` (proper boundary type for partial Feed objects)
  - Removed redundant app/feed casts on constructor calls (already properly typed at assignment)
- Test validation: All 17 tests passing, 0 linting errors
- Backlog trend this phase: **2020 → 1912 errors** (\-108), warnings still **54**.

### Pass 8

- Targeted second highest-ROI file: `test_files/unit/views/discover-view.test.ts` — **102 → 0 errors**.
- Fixed type assertion incompatibility between test mock (`TestPlugin`) and `RssDashboardPlugin` constructor parameter using `as unknown as ConstructorParameters<typeof mod.DiscoverView>[1]` pattern.
- Resolved both TypeScript compatibility error and ESLint `no-unsafe-argument`/`no-explicit-any` violations in a single disciplined cast.
- Test validation: All 10 tests passing, 0 linting errors.
- Backlog trend this phase: **1912 → 1810 errors** (\-102), warnings still **54**.

### Pass 9

- Targeted highest remaining ROI file: `test_files/unit/views/podcast-player.test.ts` — **99 → 0 errors**.
- Replaced all `document.body.createDiv()` calls with `document.createElement("div")` and explicit type annotation `HTMLDivElement` since ESLint could not infer the return type from the polyfill.
- This follows the pattern established in Pass 5 for similar polyfill-incompatible DOM method calls.
- Test validation: All 7 tests passing, 0 linting errors.
- Backlog trend this phase: **1810 → 1711 errors** (\-99), warnings still **54**.

### Pass 10

- Targeted `test_files/unit/utils/filter-statusbar-counts.test.ts` — **93 → 0 errors**.
- Added `TestPlugin` and `TestView` interfaces for typed mock boundaries.
- Replaced `plugin as never` with proper boundary cast using `ConstructorParameters<typeof RssDashboardView>[1]`.
- Replaced `document.body.createDiv()` with `document.createElement("div")` and explicit `HTMLDivElement` type annotation.
- Replaced all `(view as any)` patterns with typed `TestView` interface access using optional call syntax (`view.methodName!`).
- Test validation: All 5 tests passing, 0 linting errors.
- Backlog trend this phase: **1711 → 1618 errors** (\-93), warnings still **54**.

### Pass 11

- Targeted `test_files/unit/modals/import-opml-modal.test.ts` — **71 → 0 errors**.
- Changed `MockApp` type from complex `ReturnType` pattern to simple `obsidian.App`.
- Simplified `createMockApp()` to use direct `new obsidian.App()` instead of `App.createMock()`.
- Removed `app` property from `TestPlugin` interface (not needed by modal constructor).
- Replaced all `plugin as any` with proper boundary cast `plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1]`.
- Fixed `expect.objectContaining({ folders: expect.arrayContaining(...) })` unsafe assignment using inline typed object with `as unknown as object` cast.
- Test validation: All 7 tests passing, 0 linting errors.
- Backlog trend this phase: **1618 → 1547 errors** (\-71), warnings still **54**.

### Pass 12

- Targeted `test_files/unit/modals/add-feed-modal.test.ts` — **58 → 0 errors**.
- Changed `MockApp` type from complex `ReturnType` pattern to simple `obsidian.App`.
- Simplified `createMockApp()` to use direct `new obsidian.App()` instead of `App.createMock()`.
- Removed `app as any` cast since `new obsidian.App()` returns proper `App` type.
- Removed `onAdd as any` and `onSave as any` casts since `vi.fn()` matches expected signature.
- Test validation: All 5 tests passing, 0 linting errors.
- Backlog trend this phase: **1547 → 1489 errors** (\-58), warnings still **54**.

### Pass 13

- Ran fresh test-file audit to replace ad-hoc "next highest ROI" selection with a persistent ranked working backlog.
- Commands run:
  - `npx eslint "test_files/**/*.ts" -f json -o eslint_test_report.json`
  - `npm run test:unit`
  - Generated `test_lint_backlog_ranked.json` from ESLint JSON (sorted queue artifact)
- Lint snapshot (test files only): **1517 errors**, **54 warnings** across **67 files** total.
  - Files with remaining lint errors: **66**
  - Files with warnings only (0 errors): **1**
- Test snapshot: **130/130 test files passing**, **1180/1180 tests passing**, **0 failures**.
- Backlog trend this phase: **1489 → 1517 errors** (+28), warnings still **54**.
- Note: this increase indicates additional test-file lint debt landed after Pass 12; the ranked queue below is now the source of truth for next passes.
- Targeted `test_files/unit/services/background-import-service.test.ts` — **3 → 0 errors** (file was partially cleaned previously, completing remaining fixes).
- Added `TestFeedParser` interface for typed mock boundary.
- Replaced `as unknown as FeedParserLike` with `as unknown as TestFeedParser` boundary cast.
- Added `// eslint-disable-next-line @typescript-eslint/unbound-method` for Vitest mock assertion patterns (legitimate false positives).
- Test validation: All 12 tests passing, 0 linting errors.
- Backlog trend this phase: **1454 → 1451 errors** (\-3), warnings still **54**.

### Pass 14

- Targeted `test_files/unit/components/article-list.test.ts` — **65 → 0 errors**.
- Added `ArticleListCallbacks` type alias using `ConstructorParameters<typeof ArticleList>[6]` for typed mock boundaries.
- Replaced `mockCallbacks: any` with properly typed `ArticleListCallbacks`.
- Replaced `as any` casts on `ResizeObserver` with proper `unknown` boundary cast.
- Added `TestCSS`/`TestWindow` interfaces for typed CSS.escape polyfill.
- Added `Tag` import for typed tag arrays.
- Fixed `articles[0].tags = [...] as any` with `as unknown as Tag[]` boundary cast.
- Fixed `vi.spyOn` for private methods using `as never` type assertion.
- Fixed style assignments using `Object.assign` to avoid `no-static-styles-assignment` errors.
- Fixed `syncArticleTags` private method call using `.call()` with proper `this` binding.
- Added `eslint-disable-next-line` for Vitest `unbound-method` false positives on `scrollIntoView`.
- Test validation: All 30 tests passing, 0 linting errors.
- Backlog trend this phase: **1451 → 1386 errors** (\-65), warnings still **54**.

### Pass 15

- Targeted `test_files/unit/components/folder-selector-popup.test.ts` — **65 → 0 errors**.
- Added `TestPlugin` type alias using `ConstructorParameters<typeof FolderSelectorPopup>[0]` for typed mock boundary.
- Replaced `createPluginStub()` return type from `any` to `TestPlugin` with single boundary cast.
- Replaced all `document.body.createDiv()` calls with `document.createElement("div")` (native DOM method with proper typing).
- Added `document.body.appendChild(outside)` in outside-click test to ensure click handler registration.
- Test validation: All 9 tests passing, 0 linting errors.
- Backlog trend this phase: **1386 → 1321 errors** (\-65), warnings still **54**.

### Pass 16

- Targeted `test_files/unit/settings/article-saving-settings-tab.test.ts` — **65 → 0 errors**.
- Added `TestPlugin` interface with typed `settings.articleSaving` properties for mock boundary.
- Replaced `document.body.createDiv()` with `document.createElement("div")` (native DOM method).
- Fixed `as any` casts on `plugin` and button `onclick` handlers using typed interface access.
- Test validation: All 7 tests passing, 0 linting errors.
- Backlog trend this phase: **1321 → 1256 errors** (\-65), warnings still **54**.

### Pass 17

- Targeted `test_files/unit/services/backup-service.test.ts` — **64 → 0 errors**.
- Added `TestVault` and `TestManifest` typed interfaces for mock boundaries.
- Replaced `mockVault: any` and `mockManifest: any` with typed interface declarations.
- Replaced all `settings as any` with proper boundary casts using `AutoBackupSettings` type.
- Fixed `(window as any).require` patterns with typed `unknown` boundary casts.
- Replaced hardcoded `.obsidian/plugins/` paths with `configDir/plugins/` to satisfy `obsidianmd/hardcoded-config-path` rule.
- Added `// eslint-disable-next-line @typescript-eslint/unbound-method` for Vitest mock assertion patterns.
- Added `// eslint-disable-next-line @typescript-eslint/no-unsafe-call` for `mockImplementation` on vi.fn().
- Test validation: All 8 tests passing, 0 linting errors.
- Backlog trend this phase: **1256 → 1192 errors** (\-64), warnings still **54**.

### Pass 18

- Targeted `test_files/unit/components/discover-sidebar.test.ts` — **62 → 0 errors**.
- Added `TestPlugin` type alias using `ConstructorParameters<typeof DiscoverSidebar>[2]` for typed mock boundary.
- Replaced `document.body.createDiv()` with `document.createElement("div")` (native DOM method with proper typing).
- Replaced `{} as any` with `as unknown as TestPlugin` boundary cast.
- Fixed mock function `attachInputClearButton` to use `HTMLDivElement` properly typed with `appendChild` and `document.createElement`.
- Removed unnecessary `as HTMLButtonElement | undefined` type assertion in `getNavButton` helper (inferred correctly).
- Fixed `as any` cast on empty type test case with proper string literal.
- Fixed array type assertion for button querySelectorAll with type guard pattern.
- Test validation: All 5 tests passing, 0 linting errors.
- Backlog trend this phase: **1192 → 1130 errors** (\-62), warnings still **54**.

### Pass 19

- Targeted `test_files/unit/views/dashboard-reader-location.test.ts` — **59 → 0 errors**.
- Added `TestDashboardView` interface with typed mock boundary for view methods (`handleArticleClick`, `handleOpenInReaderView`, `handleFeedClick`, `inlineArticle`, `articleList`).
- Replaced `plugin as never` with proper boundary cast using `ConstructorParameters<typeof RssDashboardView>[1]`.
- Replaced `workspaceOverrides: Record<string, any>` with `Record<string, unknown>`.
- Replaced all `(view as any)` casts with typed `view.handleArticleClick`, `view.handleOpenInReaderView`, `view.handleFeedClick`, and `view.inlineArticle` access.
- Test validation: All 14 tests passing, 0 linting errors.
- Backlog trend this phase: **1130 → 1071 errors** (\-59), warnings still **54**.

### Pass 20

- Targeted `test_files/unit/main/feed-refresh-pipeline.test.ts` — **55 → 0 errors**.
- Replaced `app as any` and `createMockManifest() as any` with proper boundary casts using `ConstructorParameters<typeof RssDashboardPlugin>`.
- Replaced `(spy as any).mock.calls` with typed boundary cast using `as unknown as { mock: { calls: Array<Array<unknown>> } }`.
- Replaced all `plugin.feedParser.refreshFeed as any` patterns with `as unknown as { mockImplementation, mockResolvedValue, mockRejectedValue }` boundary casts.
- Removed unused `eslint-disable-next-line @typescript-eslint/unbound-method` directives for lines where no violations existed.
- Test validation: All 6 tests passing, 0 linting errors.
- Backlog trend this phase: **1071 → 1016 errors** (\-55), warnings still **54**.

### Pass 21

- Targeted `test_files/unit/services/web-viewer-integration.test.ts` and `test_files/unit/services/web-viewer-integration-harness.ts` — **51 → 0 errors** and **6 → 0 errors** respectively.
- Changed private methods in `WebViewerIntegration` to `protected` to enable typed access in tests:
  - `addCustomSaveButton`, `showSaveDialog`, `saveArticle`, `applyTemplate`, `generateFrontmatter`, `ensureFolderExists`
- Added `TestWebViewerIntegration` type with typed method signatures for typed mock boundaries.
- Updated harness return type to use `TestWebViewerIntegration` directly instead of `as unknown as` cast.
- Fixed `createWebpageContainer()` to use eslint-disable for polyfill-incompatible `createDiv` call.
- Test validation: All 17 tests passing, 0 linting errors.
- Backlog trend this phase: **1016 → 959 errors** (\-57), warnings still **54**.

### Pass 22

- Targeted `test_files/unit/main/activate-view-leaf-selection.test.ts` — **47 → 0 errors**, **1 → 0 warnings**.
- Changed `folderService` in `RssDashboardPlugin` from `private` to `protected` to enable typed access in tests.
- Added `TestApp` and `TestPlugin` typed interfaces for mock boundaries in the test file.
- Replaced all `as any` casts with a single boundary cast to `TestPlugin`.
- Fixed workspace mock assignments to use properly typed `vi.fn()` mocks.
- Test validation: All 11 tests passing, 0 linting errors.
- Backlog trend this phase: **959 → 912 errors** (-47), warnings **54 → 53** (-1).

### Pass 23

- Targeted `test_files/unit/components/sidebar-core.test.ts` — **41 → 0 errors**.
- Replaced the intersection `Sidebar & { ... }` with a standalone `TestSidebar` type to avoid private member access issues during boundary casting in tests.
- Added `TestApp` with explicit `workspace` property and `TestPlugin` interface with specific mock members.
- Replaced `container.createDiv()` and `headerSurface.createDiv()` with standard `document.createElement("div")` (native DOM method).
- Fixed all `vi.spyOn` and `mockResolvedValue` types for `requestUrl` stubs.
- Test validation: All 18 tests passing, 0 linting errors.
- Backlog trend this phase: **912 → 871 errors** (-41), warnings still **53**.

## Working Backlog Queue (Ranked)


Use this ordered list for each subsequent pass. Work top-to-bottom unless a file is blocked by dependency context.

Source artifact:

- `test_lint_backlog_ranked.json` (sorted queue generated during Pass 23)

| Rank | File                                                                    | Errors | Warnings |
| ---- | ----------------------------------------------------------------------- | -----: | -------: |
| 1    | `test_files/unit/components/article-header.test.ts`                     |     37 |        0 |
| 2    | `test_files/unit/components/sidebar-rendering.test.ts`                  |     36 |        1 |
| 3    | `test_files/unit/utils/tag-utils.test.ts`                               |     36 |        0 |
| 4    | `test_files/unit/components/supported-format-badges.test.ts`            |     36 |        0 |
| 5    | `test_files/unit/modals/mobile-navigation-modal.test.ts`                |     35 |        0 |
| 6    | `test_files/unit/views/dashboard-card-layout-filter-batch.test.ts`      |     32 |        0 |
| 7    | `test_files/unit/services/apple-podcasts-service.test.ts`               |     32 |        0 |
| 8    | `test_files/unit/settings/settings-tab-orchestrator.test.ts`            |     29 |        0 |
| 9    | `test_files/unit/settings/tags-settings-tab.test.ts`                    |     28 |        0 |
| 10   | `test_files/unit/components/article-renderer-summary-dedupe.test.ts`    |     28 |        0 |
| 11   | `test_files/unit/settings/media-settings-tab.test.ts`                   |     27 |        0 |
| 12   | `test_files/unit/main/background-import-orchestration.test.ts`          |     26 |        0 |
| 13   | `test_files/unit/utils/settings-loader.test.ts`                         |     26 |        0 |
| 14   | `test_files/unit/settings/display-reader-settings-tab.test.ts`          |     25 |        0 |
| 15   | `test_files/unit/components/article-header-menu.test.ts`                |     25 |        0 |
| 16   | `test_files/unit/test-dom-polyfills.ts`                                 |     24 |        0 |
| 17   | `test_files/unit/settings/storage-settings-general-tab.test.ts`         |     23 |        0 |
| 18   | `test_files/unit/components/tags-dropdown-portal-regression.test.ts`    |     23 |        0 |
| 19   | `test_files/unit/views/dashboard-header-title-batching.test.ts`         |     22 |        0 |
| 20   | `test_files/unit/settings/startup-filters-settings-positioning.test.ts` |     19 |        0 |
| 21   | `test_files/unit/modals/feed-manager-modal.test.ts`                     |     19 |        0 |
| 22   | `test_files/unit/modals/feed-preview-modal.test.ts`                     |     18 |        0 |
| 23   | `test_files/unit/components/article-filter-menu.test.ts`                |     18 |        0 |
| 24   | `test_files/unit/settings/about-settings-tab.test.ts`                   |     18 |        0 |
| 25   | `test_files/unit/utils/platform-utils.test.ts`                          |     18 |        0 |
| 26   | `test_files/unit/settings/rules-settings-tab.test.ts`                   |     16 |        0 |
| 27   | `test_files/unit/modals/mobile-discover-filters-modal.test.ts`          |     16 |        0 |
| 28   | `test_files/unit/views/dashboard-title-filter-summary.test.ts`          |     16 |        0 |
| 29   | `test_files/unit/services/import-export-service.test.ts`                |     15 |        0 |
| 30   | `test_files/unit/main/settings-open-navigation.test.ts`                |     15 |        0 |
| 31   | `test_files/unit/components/article-list-characterization.test.ts`      |     14 |        0 |
| 32   | `test_files/unit/services/import-export-service-metadata.test.ts`       |     14 |        6 |
| 33   | `test_files/unit/services/feed-storage-repository.test.ts`              |     13 |        0 |
| 34   | `test_files/unit/settings/import-export-settings-tab.test.ts`           |     11 |        0 |
| 35   | `test_files/unit/components/reader-format-portal.test.ts`               |     11 |        0 |
| 36   | `test_files/unit/services/sidebar-ordering-controller.test.ts`          |     10 |        0 |
| 37   | `test_files/unit/views/dashboard-restricted-save-rerender.test.ts`      |      8 |        0 |
| 38   | `test_files/stubs/obsidian.ts`                                          |      8 |        4 |
| 39   | `test_files/unit/components/sidebar-scrolling.test.ts`                  |      7 |        0 |
| 40   | `test_files/unit/modals/sidebar-addfeed-opens-modal.test.ts`            |      4 |        0 |
| 41   | `test_files/unit/components/keyword-filter-editor.test.ts`              |      4 |        0 |
| 42   | `test_files/unit/utils/export-utils.test.ts`                            |      4 |        0 |
| 43   | `test_files/unit/services/opml-manager.test.ts`                         |      3 |        0 |
| 44   | `test_files/unit/services/feed-parser.test.ts`                          |      3 |        0 |
| 45   | `test_files/unit/services/fetch-helpers.test.ts`                        |      3 |        0 |
| 46   | `test_files/unit/settings/metadata-storage-settings-tab.test.ts`        |      3 |       34 |
| 47   | `test_files/unit/views/dashboard-filter-persistence.test.ts`              |      2 |        0 |
| 48   | `test_files/unit/services/highlight-service.test.ts`                    |      2 |        1 |
| 49   | `test_files/unit/services/metadata-storage-repository.test.ts`          |      2 |        4 |
| 50   | `test_files/unit/services/keyword-filter-service.test.ts`               |      2 |        0 |
| 51   | `test_files/unit/modals/import-success-modal.test.ts`                   |      2 |        0 |
| 52   | `test_files/unit/components/article-list-empty-state.test.ts`           |      1 |        0 |
| 53   | `test_files/unit/views/dashboard-pagination.test.ts`                    |      1 |        1 |
| 54   | `test_files/unit/components/sidebar-icon-registry.test.ts`              |      1 |        0 |


## Cross-Impact on Audit Scorecard

Record entries here when test-lint work directly closes a scorecard warning/risk item.

- No direct scorecard warning/risk item has been marked fully closed from Pass 5-14 test-lint work yet.

## Related Docs

- `docs/plugin-scorecard.md` (audit-aligned scorecard)
- `docs/development/compliance-patterns.md` (approved implementation patterns)
- `CONTRIBUTING.MD` (compliance declarations and pre-PR checks)
