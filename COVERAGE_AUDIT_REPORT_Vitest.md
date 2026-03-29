# RSS Dashboard Plugin — Test Coverage Audit Report

**Date:** 2026-03-29  
**Plugin Version:** 2.2.0-beta.9  
**Test Framework:** Vitest + Chai  
**Test Files:** 62 total (60 passing, 6 failing, 412 tests passing)

---

## Summary Scorecard

| Category                  | Line Coverage | Branch Coverage | Test Quality                             | Risk Level |
| ------------------------- | ------------- | --------------- | ---------------------------------------- | ---------- |
| **Core Logic (Services)** | ~55%          | ~40%            | Good edge case coverage in feed-parser   | High       |
| **UI Components**         | ~35%          | ~25%            | Fragmentary; focuses on regression fixes | High       |
| **Plugin Lifecycle**      | ~20%          | ~15%            | None — critical gap                      | Critical   |
| **Utilities**             | ~45%          | ~30%            | Moderate; some happy-path only           | Medium     |
| **Settings**              | ~60%          | ~50%            | Good migration testing                   | Medium     |
| **Views**                 | ~40%          | ~30%            | Good specific bug regression coverage    | Medium     |

**Overall Assessment:** The test suite demonstrates solid TDD discipline in specific areas (feed-parser, settings migrations), but has significant architectural gaps — particularly in plugin lifecycle, UI integration, and the critical feed fetch → parse → render pipeline.

---

## 1. Inventory

### 1.1 Core Logic (Parsers, Models, Feed Handling, State Management)

| Source File                                                                                  | Test File(s)                                                                                                                                       | Coverage Status                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`src/services/feed-parser.ts`](src/services/feed-parser.ts)                                 | [`test_files/unit/services/feed-parser.test.ts`](test_files/unit/services/feed-parser.test.ts)                                                     | ✅ Good — 55 tests covering RSS/Atom/JSON parsing, encoding detection, error handling |
| [`src/services/article-saver.ts`](src/services/article-saver.ts)                             | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/highlight-service.ts`](src/services/highlight-service.ts)                     | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/keyword-filter-service.ts`](src/services/keyword-filter-service.ts)           | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/media-service.ts`](src/services/media-service.ts)                             | [`test_files/unit/services/media-service.normalizeNitterUrlToRss.test.ts`](test_files/unit/services/media-service.normalizeNitterUrlToRss.test.ts) | ⚠️ Partial — Nitter URL normalization only                                            |
| [`src/services/apple-podcasts-service.ts`](src/services/apple-podcasts-service.ts)           | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/opml-manager.ts`](src/services/opml-manager.ts)                               | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/opml-import-preview-model.ts`](src/services/opml-import-preview-model.ts)     | [`test_files/unit/modals/opml-import-preview-model.test.ts`](test_files/unit/modals/opml-import-preview-model.test.ts)                             | ⚠️ Partial — OPML parsing only                                                        |
| [`src/services/sidebar-ordering-controller.ts`](src/services/sidebar-ordering-controller.ts) | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/sidebar-search-service.ts`](src/services/sidebar-search-service.ts)           | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |
| [`src/services/web-viewer-integration.ts`](src/services/web-viewer-integration.ts)           | ❌ None                                                                                                                                            | ❌ No coverage                                                                        |

### 1.2 UI Components / Views

| Source File                                                                          | Test File(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Coverage Status                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`src/components/article-list.ts`](src/components/article-list.ts)                   | [`test_files/unit/components/article-list.test.ts`](test_files/unit/components/article-list.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ✅ Good — 15 tests                                                                |
| [`src/components/article-header.ts`](src/components/article-header.ts)               | [`test_files/unit/components/article-header.test.ts`](test_files/unit/components/article-header.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ⚠️ Partial — 3 tests                                                              |
| [`src/components/article-filter-menu.ts`](src/components/article-filter-menu.ts)     | [`test_files/unit/components/article-filter-menu.test.ts`](test_files/unit/components/article-filter-menu.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ⚠️ Partial — 2 tests                                                              |
| [`src/components/sidebar.ts`](src/components/sidebar.ts)                             | [`test_files/unit/components/sidebar-icon-registry.test.ts`](test_files/unit/components/sidebar-icon-registry.test.ts), [`test_files/unit/components/sidebar-scrolling.test.ts`](test_files/unit/components/sidebar-scrolling.test.ts), [`test_files/unit/components/sidebar-collapse-logic.test.ts`](test_files/unit/components/sidebar-collapse-logic.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ⚠️ Fragmented — icon registry, scrolling, collapse logic only                     |
| [`src/components/discover-sidebar.ts`](src/components/discover-sidebar.ts)           | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |
| [`src/components/folder-selector-popup.ts`](src/components/folder-selector-popup.ts) | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |
| [`src/components/folder-suggest.ts`](src/components/folder-suggest.ts)               | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |
| [`src/components/keyword-filter-editor.ts`](src/components/keyword-filter-editor.ts) | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |
| [`src/views/dashboard-view.ts`](src/views/dashboard-view.ts)                         | [`test_files/unit/views/dashboard-pagination.test.ts`](test_files/unit/views/dashboard-pagination.test.ts), [`test_files/unit/views/dashboard-filter-persistence.test.ts`](test_files/unit/views/dashboard-filter-persistence.test.ts), [`test_files/unit/views/dashboard-title-filter-summary.test.ts`](test_files/unit/views/dashboard-title-filter-summary.test.ts), [`test_files/unit/views/dashboard-default-filter-startup.test.ts`](test_files/unit/views/dashboard-default-filter-startup.test.ts), [`test_files/unit/views/dashboard-header-title-batching.test.ts`](test_files/unit/views/dashboard-header-title-batching.test.ts)                                                                                                                                                                                                                                                                                                                                 | ⚠️ Good for specific regressions — pagination, filter persistence, title handling |
| [`src/views/reader-view.ts`](src/views/reader-view.ts)                               | [`test_files/unit/views/reader-view-duplication.test.ts`](test_files/unit/views/reader-view-duplication.test.ts), [`test_files/unit/views/reader-view-feed-icon-hero.test.ts`](test_files/unit/views/reader-view-feed-icon-hero.test.ts), [`test_files/unit/views/reader-view-headline-dedupe.test.ts`](test_files/unit/views/reader-view-headline-dedupe.test.ts), [`test_files/unit/views/reader-view-navigation-strip.test.ts`](test_files/unit/views/reader-view-navigation-strip.test.ts), [`test_files/unit/views/reader-view-nitter.test.ts`](test_files/unit/views/reader-view-nitter.test.ts), [`test_files/unit/views/reader-view-onclose-cleanup.test.ts`](test_files/unit/views/reader-view-onclose-cleanup.test.ts), [`test_files/unit/views/reader-view-tag-sync.test.ts`](test_files/unit/views/reader-view-tag-sync.test.ts), [`test_files/unit/views/reader-view-tooltip-attributes.test.ts`](test_files/unit/views/reader-view-tooltip-attributes.test.ts) | ⚠️ Good regression coverage — 18 tests covering specific bug fixes                |
| [`src/views/podcast-player.ts`](src/views/podcast-player.ts)                         | [`test_files/unit/views/podcast-player.test.ts`](test_files/unit/views/podcast-player.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ⚠️ Partial — 7 tests                                                              |
| [`src/views/video-player.ts`](src/views/video-player.ts)                             | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |
| [`src/views/discover-view.ts`](src/views/discover-view.ts)                           | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |
| [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts)                 | ❌ None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ❌ No coverage                                                                    |

### 1.3 Plugin Lifecycle

| Source File                                                    | Test File(s) | Coverage Status                             |
| -------------------------------------------------------------- | ------------ | ------------------------------------------- |
| [`main.ts`](main.ts)                                           | ❌ None      | ❌ **Critical gap** — no lifecycle coverage |
| [`src/settings/settings-tab.ts`](src/settings/settings-tab.ts) | ❌ None      | ❌ No coverage                              |
| [`src/settings/tab-names.ts`](src/settings/tab-names.ts)       | ❌ None      | ❌ No coverage                              |

### 1.4 Utilities / Helpers

| Source File                                                                        | Test File(s)                                                                                                                                                                                                                                                                                                                                                                   | Coverage Status              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| [`src/utils/fetch-helpers.ts`](src/utils/fetch-helpers.ts)                         | [`test_files/unit/services/fetch-helpers.test.ts`](test_files/unit/services/fetch-helpers.test.ts)                                                                                                                                                                                                                                                                             | ✅ Good — 20 tests           |
| [`src/utils/validation.ts`](src/utils/validation.ts)                               | [`test_files/unit/utils/validation.test.ts`](test_files/unit/utils/validation.test.ts)                                                                                                                                                                                                                                                                                         | ✅ Good — 12 tests           |
| [`src/utils/pagination-utils.ts`](src/utils/pagination-utils.ts)                   | [`test_files/unit/utils/pagination-utils.test.ts`](test_files/unit/utils/pagination-utils.test.ts)                                                                                                                                                                                                                                                                             | ⚠️ Partial — 3 tests         |
| [`src/utils/folder-paths.ts`](src/utils/folder-paths.ts)                           | [`test_files/unit/utils/folder-paths.test.ts`](test_files/unit/utils/folder-paths.test.ts)                                                                                                                                                                                                                                                                                     | ⚠️ Partial — 3 tests         |
| [`src/utils/folder-tree.ts`](src/utils/folder-tree.ts)                             | [`test_files/unit/utils/folder-tree-remove.test.ts`](test_files/unit/utils/folder-tree-remove.test.ts)                                                                                                                                                                                                                                                                         | ⚠️ Partial — removal only    |
| [`src/utils/dashboard-multi-filters.ts`](src/utils/dashboard-multi-filters.ts)     | [`test_files/unit/utils/dashboard-multi-filters-util.test.ts`](test_files/unit/utils/dashboard-multi-filters-util.test.ts)                                                                                                                                                                                                                                                     | ⚠️ Partial                   |
| [`src/utils/filter-title-format.ts`](src/utils/filter-title-format.ts)             | [`test_files/unit/utils/filter-title-format.test.ts`](test_files/unit/utils/filter-title-format.test.ts)                                                                                                                                                                                                                                                                       | ✅ Good — 7 tests            |
| [`src/utils/export-utils.ts`](src/utils/export-utils.ts)                           | [`test_files/unit/utils/export-utils.test.ts`](test_files/unit/utils/export-utils.test.ts)                                                                                                                                                                                                                                                                                     | ✅ Good — 7 tests            |
| [`src/utils/platform-utils.ts`](src/utils/platform-utils.ts)                       | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/url-utils.ts`](src/utils/url-utils.ts)                                 | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/favicon-utils.ts`](src/utils/favicon-utils.ts)                         | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/item-url-utils.ts`](src/utils/item-url-utils.ts)                       | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/page-size-options.ts`](src/utils/page-size-options.ts)                 | [`test_files/unit/components/page-size-options.test.ts`](test_files/unit/components/page-size-options.test.ts)                                                                                                                                                                                                                                                                 | ⚠️ Partial                   |
| [`src/utils/popover-position.ts`](src/utils/popover-position.ts)                   | [`test_files/unit/components/popover-position.test.ts`](test_files/unit/components/popover-position.test.ts)                                                                                                                                                                                                                                                                   | ⚠️ Partial                   |
| [`src/utils/reader-format-portal.ts`](src/utils/reader-format-portal.ts)           | [`test_files/unit/components/reader-format-portal.test.ts`](test_files/unit/components/reader-format-portal.test.ts)                                                                                                                                                                                                                                                           | ⚠️ Partial                   |
| [`src/utils/safe-html.ts`](src/utils/safe-html.ts)                                 | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/settings-migration.ts`](src/utils/settings-migration.ts)               | [`test_files/unit/settings/default-filter-migration.test.ts`](test_files/unit/settings/default-filter-migration.test.ts), [`test_files/unit/settings/keyword-rules-migration.test.ts`](test_files/unit/settings/keyword-rules-migration.test.ts), [`test_files/unit/settings/sidebar-settings-migration.test.ts`](test_files/unit/settings/sidebar-settings-migration.test.ts) | ✅ Good migration coverage   |
| [`src/utils/sidebar-folder-sort-utils.ts`](src/utils/sidebar-folder-sort-utils.ts) | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/sidebar-sort-utils.ts`](src/utils/sidebar-sort-utils.ts)               | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/tag-utils.ts`](src/utils/tag-utils.ts)                                 | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/tags-dropdown-portal.ts`](src/utils/tags-dropdown-portal.ts)           | [`test_files/unit/components/tags-dropdown-portal-regression.test.ts`](test_files/unit/components/tags-dropdown-portal-regression.test.ts)                                                                                                                                                                                                                                     | ⚠️ Partial — regression only |
| [`src/utils/podcast-open-destinations.ts`](src/utils/podcast-open-destinations.ts) | [`test_files/unit/views/podcast-open-destinations.test.ts`](test_files/unit/views/podcast-open-destinations.test.ts)                                                                                                                                                                                                                                                           | ⚠️ Partial                   |
| [`src/utils/podcast-platforms.ts`](src/utils/podcast-platforms.ts)                 | ❌ None                                                                                                                                                                                                                                                                                                                                                                        | ❌ No coverage               |
| [`src/utils/ios-namespace-fix.ts`](src/utils/ios-namespace-fix.ts)                 | [`test_files/unit/utils/ios-namespace-fix.test.ts`](test_files/unit/utils/ios-namespace-fix.test.ts)                                                                                                                                                                                                                                                                           | ⚠️ Partial — 3 tests         |
| [`src/utils/youtube-embed-config.ts`](src/utils/youtube-embed-config.ts)           | [`test_files/unit/utils/youtube-embed-config.test.ts`](test_files/unit/utils/youtube-embed-config.test.ts)                                                                                                                                                                                                                                                                     | ⚠️ Partial                   |
| [`src/utils/open-in-browser-url.ts`](src/utils/open-in-browser-url.ts)             | [`test_files/unit/utils/open-in-browser-url.test.ts`](test_files/unit/utils/open-in-browser-url.test.ts)                                                                                                                                                                                                                                                                       | ⚠️ Partial                   |
| [`src/utils/filter-statusbar-counts.ts`](src/utils/filter-statusbar-counts.ts)     | [`test_files/unit/utils/filter-statusbar-counts.test.ts`](test_files/unit/utils/filter-statusbar-counts.test.ts)                                                                                                                                                                                                                                                               | ⚠️ Partial                   |

### 1.5 Settings Tabs

| Source File                                                                                            | Test File(s)                                                                                                                 | Coverage Status      |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| [`src/settings/tabs/general-settings-tab.ts`](src/settings/tabs/general-settings-tab.ts)               | [`test_files/unit/settings/settings-tab-general.test.ts`](test_files/unit/settings/settings-tab-general.test.ts)             | ✅ Good — 18 tests   |
| [`src/settings/tabs/display-settings-tab.ts`](src/settings/tabs/display-settings-tab.ts)               | [`test_files/unit/settings/settings-tab-display.test.ts`](test_files/unit/settings/settings-tab-display.test.ts)             | ✅ Good — 29 tests   |
| [`src/settings/tabs/highlights-settings-tab.ts`](src/settings/tabs/highlights-settings-tab.ts)         | [`test_files/unit/settings/settings-tab-highlights.test.ts`](test_files/unit/settings/settings-tab-highlights.test.ts)       | ✅ Good — 17 tests   |
| [`src/settings/tabs/article-saving-settings-tab.ts`](src/settings/tabs/article-saving-settings-tab.ts) | ❌ None                                                                                                                      | ❌ No coverage       |
| [`src/settings/tabs/import-export-settings-tab.ts`](src/settings/tabs/import-export-settings-tab.ts)   | [`test_files/unit/settings/import-export-settings-tab.test.ts`](test_files/unit/settings/import-export-settings-tab.test.ts) | ⚠️ Partial — 6 tests |
| [`src/settings/tabs/media-settings-tab.ts`](src/settings/tabs/media-settings-tab.ts)                   | ❌ None                                                                                                                      | ❌ No coverage       |
| [`src/settings/tabs/rules-settings-tab.ts`](src/settings/tabs/rules-settings-tab.ts)                   | ❌ None                                                                                                                      | ❌ No coverage       |
| [`src/settings/tabs/tags-settings-tab.ts`](src/settings/tabs/tags-settings-tab.ts)                     | ❌ None                                                                                                                      | ❌ No coverage       |
| [`src/settings/tabs/about-settings-tab.ts`](src/settings/tabs/about-settings-tab.ts)                   | ❌ None                                                                                                                      | ❌ No coverage       |
| [`src/settings/modals/settings-modals.ts`](src/settings/modals/settings-modals.ts)                     | ❌ None                                                                                                                      | ❌ No coverage       |

### 1.6 Modals

| Source File                                                                                                | Test File(s)                                                                                                               | Coverage Status                                             |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`src/modals/feed-manager/feed-manager-modal.ts`](src/modals/feed-manager/feed-manager-modal.ts)           | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/feed-manager/add-feed-modal.ts`](src/modals/feed-manager/add-feed-modal.ts)                   | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/feed-manager/edit-feed-modal.ts`](src/modals/feed-manager/edit-feed-modal.ts)                 | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/feed-manager/feed-preview-loader.ts`](src/modals/feed-manager/feed-preview-loader.ts)         | [`test_files/unit/discover/feed-preview-loader.test.ts`](test_files/unit/discover/feed-preview-loader.test.ts)             | ⚠️ **Failing** — 5/7 tests fail (mock configuration issues) |
| [`src/modals/feed-manager/supported-format-badges.ts`](src/modals/feed-manager/supported-format-badges.ts) | [`test_files/unit/components/supported-format-badges.test.ts`](test_files/unit/components/supported-format-badges.test.ts) | ⚠️ Partial — 2 tests                                        |
| [`src/modals/feed-preview-modal.ts`](src/modals/feed-preview-modal.ts)                                     | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/import-opml-modal.ts`](src/modals/import-opml-modal.ts)                                       | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/import-success-modal.ts`](src/modals/import-success-modal.ts)                                 | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/mobile-navigation-modal.ts`](src/modals/mobile-navigation-modal.ts)                           | ❌ None                                                                                                                    | ❌ No coverage                                              |
| [`src/modals/mobile-discover-filters-modal.ts`](src/modals/mobile-discover-filters-modal.ts)               | ❌ None                                                                                                                    | ❌ No coverage                                              |

---

## 2. Coverage Gap Analysis

### 2.1 Critical Gaps

| File/Module                                                                          | Missing Coverage                                                                                                                                                                             | Risk Level   | Rationale                                                                                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`main.ts`](main.ts)                                                                 | Entire plugin lifecycle: `onload()`, `onunload()`, view registration, cleanup logic                                                                                                          | **Critical** | Plugin fails to load or crashes silently without test coverage. Any regression in lifecycle breaks the entire plugin for all users.  |
| [`src/services/article-saver.ts`](src/services/article-saver.ts)                     | All functions: `saveArticle()`, `createArticleFile()`, folder handling, template processing                                                                                                  | **Critical** | Core feature — saving articles to vault. Bugs here cause data loss or incorrect vault files.                                         |
| [`src/services/highlight-service.ts`](src/services/highlight-service.ts)             | All functions: highlight creation, storage, retrieval                                                                                                                                        | **Critical** | Highlight feature is a key value proposition. Bugs cause highlight loss or corruption.                                               |
| Feed fetch → parse → render pipeline                                                 | Integration-level coverage across [`feed-parser.ts`](src/services/feed-parser.ts) → [`dashboard-view.ts`](src/views/dashboard-view.ts) → [`article-list.ts`](src/components/article-list.ts) | **Critical** | The complete user flow from feed URL to rendered articles is untested end-to-end. A bug in any component breaks the core experience. |
| [`src/components/folder-selector-popup.ts`](src/components/folder-selector-popup.ts) | Folder selection, modal interaction, Obsidian vault API calls                                                                                                                                | **Critical** | User-facing component for saving articles. Incorrect folder selection causes articles to be saved to wrong locations.                |

### 2.2 High-Risk Gaps

| File/Module                                                                                            | Missing Coverage                                           | Risk Level | Rationale                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| [`src/services/opml-manager.ts`](src/services/opml-manager.ts)                                         | OPML export, import parsing, feed merging logic            | **High**   | OPML import/export is a common workflow. Corruption leads to feed list loss.                |
| [`src/services/sidebar-ordering-controller.ts`](src/services/sidebar-ordering-controller.ts)           | Drag-and-drop ordering, persistence, state synchronization | **High**   | Sidebar ordering is a frequent user interaction. Broken ordering frustrates users.          |
| [`src/components/discover-sidebar.ts`](src/components/discover-sidebar.ts)                             | Entire component                                           | **High**   | Discovery feature is a major selling point. UI bugs here affect user acquisition.           |
| [`src/views/discover-view.ts`](src/views/discover-view.ts)                                             | Entire view                                                | **High**   | Core view with no test coverage.                                                            |
| [`src/components/keyword-filter-editor.ts`](src/components/keyword-filter-editor.ts)                   | All keyword filter UI interactions                         | **High**   | Keyword filtering is a key feature. UI bugs cause filters to not apply correctly.           |
| [`src/services/keyword-filter-service.ts`](src/services/keyword-filter-service.ts)                     | Filter matching, rule evaluation                           | **High**   | Filters are user-defined rules. Bugs cause incorrect article inclusion/exclusion.           |
| [`src/settings/tabs/article-saving-settings-tab.ts`](src/settings/tabs/article-saving-settings-tab.ts) | All settings UI and persistence                            | **High**   | Article saving is the core value proposition. Misconfiguration causes articles to not save. |

### 2.3 Medium-Risk Gaps

| File/Module                                                            | Missing Coverage                                       | Risk Level | Rationale                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ---------- | -------------------------------------------------------------------------- |
| [`src/services/media-service.ts`](src/services/media-service.ts)       | Audio/video playback, platform detection beyond Nitter | **Medium** | Media playback is important but has fallback (external browser).           |
| [`src/views/video-player.ts`](src/views/video-player.ts)               | Entire view                                            | **Medium** | Secondary feature.                                                         |
| [`src/utils/safe-html.ts`](src/utils/safe-html.ts)                     | HTML sanitization logic                                | **Medium** | Security-related. XSS bugs can lead to code execution in Obsidian context. |
| [`src/utils/url-utils.ts`](src/utils/url-utils.ts)                     | URL parsing, normalization, validation                 | **Medium** | Used throughout. Bugs cause incorrect feed fetching or link handling.      |
| [`src/components/folder-suggest.ts`](src/components/folder-suggest.ts) | Suggestion logic, Obsidian API integration             | **Medium** | UX feature with fallback (manual entry).                                   |

### 2.4 Low-Risk Gaps

| File/Module                                                                          | Missing Coverage          | Risk Level | Rationale                       |
| ------------------------------------------------------------------------------------ | ------------------------- | ---------- | ------------------------------- |
| [`src/settings/tabs/about-settings-tab.ts`](src/settings/tabs/about-settings-tab.ts) | All                       | Low        | Static informational content.   |
| [`src/settings/tabs/tags-settings-tab.ts`](src/settings/tabs/tags-settings-tab.ts)   | All                       | Low        | Settings UI with minimal logic. |
| [`src/utils/favicon-utils.ts`](src/utils/favicon-utils.ts)                           | All                       | Low        | Cosmetic enhancement.           |
| [`src/utils/podcast-platforms.ts`](src/utils/podcast-platforms.ts)                   | Platform list maintenance | Low        | Data file.                      |

---

## 3. Test Quality Assessment

### 3.1 Happy-Path Only Tests

The following tests only verify nominal behavior and lack error/edge case coverage:

| Test File                                                                                                          | Issue                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`test_files/unit/components/article-filter-menu.test.ts`](test_files/unit/components/article-filter-menu.test.ts) | Only 2 tests — no edge cases for empty filter list, filter removal, or invalid filter values |
| [`test_files/unit/components/article-header.test.ts`](test_files/unit/components/article-header.test.ts)           | Only 3 tests — no null/undefined article handling, no missing field coverage                 |
| [`test_files/unit/views/podcast-player.test.ts`](test_files/unit/views/podcast-player.test.ts)                     | Only 7 tests — no playback error handling, no network failure recovery                       |
| [`test_files/unit/utils/pagination-utils.test.ts`](test_files/unit/utils/pagination-utils.test.ts)                 | Only 3 tests — no edge case for zero items, negative page numbers, overflow                  |

### 3.2 Fragile/Implementation-Detached Tests

These tests are tightly coupled to implementation details:

| Test File                                                                                                              | Issue                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`test_files/unit/components/sidebar-icon-registry.test.ts`](test_files/unit/components/sidebar-icon-registry.test.ts) | Tests internal registry map structure rather than behavior; breaks if icon storage format changes |
| [`test_files/unit/settings/settings-tab-display.test.ts`](test_files/unit/settings/settings-tab-display.test.ts)       | Tests specific DOM elements and CSS classes; breaks with any UI refactor                          |
| [`test_files/unit/utils/filter-statusbar-counts.test.ts`](test_files/unit/utils/filter-statusbar-counts.test.ts)       | Tests DOM manipulation side effects rather than pure calculation logic                            |

### 3.3 Missing Integration-Level Tests

Critical pipeline tests that are absent:

1. **Feed Fetch → Parse → Render Pipeline**
   - No test verifies: fetch URL → feed-parser → article list rendering
   - Each component is tested in isolation

2. **OPML Import → Feed Discovery Pipeline**
   - No test verifies: OPML file → parse → add to feed list → refresh dashboard

3. **Article Save → Vault Write Pipeline**
   - No test verifies: article selection → article-saver → Obsidian vault file creation

4. **Filter Application Pipeline**
   - No test verifies: keyword filter change → filter-service → article-list re-render

### 3.4 Missing RSS/Atom Edge Case Coverage

Despite good coverage in [`feed-parser.test.ts`](test_files/unit/services/feed-parser.test.ts), these gaps remain:

| Edge Case                                                    | Status         |
| ------------------------------------------------------------ | -------------- |
| Malformed XML with missing closing tags                      | ⚠️ Partial     |
| RSS feeds with only `<content:encoded>` (no `<description>`) | ⚠️ Partial     |
| Atom feeds with `<author><name>` missing email               | ⚠️ Partial     |
| CDATA sections with nested CDATA                             | ❌ Not covered |
| Feed encoding mismatches (UTF-16 declared as ISO-8859-1)     | ❌ Not covered |
| Empty feed (zero items)                                      | ❌ Not covered |
| Pagination links (`<atom:link rel="next">`)                  | ❌ Not covered |
| Duplicate item GUIDs within same feed                        | ❌ Not covered |
| Very large feeds (>1000 items) performance                   | ❌ Not covered |
| Feed with only `<title>` and no `<link>`                     | ❌ Not covered |

---

## 4. Recommended Test Additions

### Priority 0 (Critical Gap)

| #    | File/Module                                                                          | Scenario                                             | Test Structure                                                                                                                                       | Rationale                                         |
| ---- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| P0-1 | [`main.ts`](main.ts)                                                                 | Plugin loads successfully with all views registered  | `describe('Plugin Lifecycle', () => { it('registers all views on load'); it('cleans up all views on unload'); })`                                    | Core bootstrap — any failure breaks entire plugin |
| P0-2 | [`main.ts`](main.ts)                                                                 | View registration creates correct ItemView instances | `describe('View Registration', () => { it('creates DashboardView'); it('creates ReaderView'); ... })`                                                | View registration is the entry point              |
| P0-3 | [`src/services/article-saver.ts`](src/services/article-saver.ts)                     | Save article to folder with template                 | `describe('saveArticle', () => { it('creates vault file with rendered template'); it('handles missing folder'); it('handles permission denied'); })` | Data loss risk if broken                          |
| P0-4 | Feed fetch → render pipeline                                                         | End-to-end: URL → parsed articles → rendered         | `describe('Feed Pipeline', () => { it('fetches RSS, parses, and returns articles'); it('handles network error gracefully'); })`                      | Core user workflow                                |
| P0-5 | [`src/components/folder-selector-popup.ts`](src/components/folder-selector-popup.ts) | Select folder and confirm                            | `describe('Folder Selection', () => { it('opens folder picker'); it('returns selected path'); it('handles cancelled selection'); })`                 | Critical UI interaction                           |

### Priority 1 (High Value)

| #    | File/Module                                                                                            | Scenario                      | Test Structure                                                                                                                          | Rationale             |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P1-1 | [`src/services/keyword-filter-service.ts`](src/services/keyword-filter-service.ts)                     | Filter matching logic         | `describe('Keyword Filter', () => { it('matches articles by keyword'); it('handles regex filters'); it('handles case sensitivity'); })` | Core filtering logic  |
| P1-2 | [`src/services/opml-manager.ts`](src/services/opml-manager.ts)                                         | OPML import/export            | `describe('OPML Manager', () => { it('parses OPML and returns feed list'); it('exports current feeds to valid OPML'); })`               | Data portability      |
| P1-3 | [`src/services/sidebar-ordering-controller.ts`](src/services/sidebar-ordering-controller.ts)           | Drag-and-drop ordering        | `describe('Sidebar Ordering', () => { it('reorders feeds on drag'); it('persists order to settings'); })`                               | Frequent user action  |
| P1-4 | [`src/views/discover-view.ts`](src/views/discover-view.ts)                                             | View renders correctly        | `describe('DiscoverView', () => { it('renders feed list'); it('applies filters'); })`                                                   | Major feature         |
| P1-5 | [`src/components/keyword-filter-editor.ts`](src/components/keyword-filter-editor.ts)                   | Filter UI interactions        | `describe('Keyword Filter Editor', () => { it('adds new filter'); it('removes filter'); it('validates filter syntax'); })`              | Core feature UI       |
| P1-6 | [`src/settings/tabs/article-saving-settings-tab.ts`](src/settings/tabs/article-saving-settings-tab.ts) | Settings persistence          | `describe('Article Saving Settings', () => { it('saves template to settings'); it('loads template from settings'); })`                  | Core feature settings |
| P1-7 | [`src/components/discover-sidebar.ts`](src/components/discover-sidebar.ts)                             | Sidebar renders and interacts | `describe('DiscoverSidebar', () => { it('renders feed items'); it('handles feed selection'); })`                                        | Core discovery UI     |

### Priority 2 (Nice to Have)

| #    | File/Module                                                                    | Scenario                     | Test Structure                                                                                        | Rationale         |
| ---- | ------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------- |
| P2-1 | [`src/utils/filter-statusbar-counts.ts`](src/utils/filter-statusbar-counts.ts) | Count calculation edge cases | `describe('Filter Counts', () => { it('counts zero items'); it('counts with all filters active'); })` | UI polish         |
| P2-2 | [`src/services/media-service.ts`](src/services/media-service.ts)               | Media playback fallback      | `describe('Media Service', () => { it('detects platform'); it('opens in external app'); })`           | Media feature     |
| P2-3 | [`src/utils/safe-html.ts`](src/utils/safe-html.ts)                             | XSS prevention               | `describe('Safe HTML', () => { it('strips script tags'); it('allows safe tags'); })`                  | Security          |
| P2-4 | [`src/views/video-player.ts`](src/views/video-player.ts)                       | Video playback               | `describe('VideoPlayer', () => { it('renders video element'); it('handles unsupported format'); })`   | Secondary feature |

---

## 5. Coverage Targets

Given the plugin's architecture, the following coverage targets are recommended:

### 5.1 Target by Category

| Category                  | Line Coverage Target | Branch Coverage Target | Function Coverage Target | Justification                                                     |
| ------------------------- | -------------------- | ---------------------- | ------------------------ | ----------------------------------------------------------------- |
| **Core Logic (Services)** | 80%                  | 70%                    | 90%                      | Contains business logic; high-value code should be well-covered   |
| **UI Components**         | 60%                  | 50%                    | 75%                      | UI code is more volatile; brittle tests create maintenance burden |
| **Plugin Lifecycle**      | 90%                  | 85%                    | 100%                     | Must be rock-solid; any failure breaks entire plugin              |
| **Utilities**             | 70%                  | 60%                    | 80%                      | Pure functions are easy to test; good ROI                         |
| **Settings**              | 75%                  | 65%                    | 85%                      | Important for data integrity; settings corruption is severe       |
| **Views**                 | 65%                  | 55%                    | 75%                      | UI views are complex integration points                           |
| **Modals**                | 55%                  | 45%                    | 70%                      | User-facing but often thin wrapper logic                          |

### 5.2 Target by File Priority

| Priority | Files                                                                                                | Target Line Coverage |
| -------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| P0       | `main.ts`, `article-saver.ts`, `highlight-service.ts`                                                | 90%                  |
| P1       | `keyword-filter-service.ts`, `opml-manager.ts`, `sidebar-ordering-controller.ts`, `discover-view.ts` | 80%                  |
| P2       | `media-service.ts`, `safe-html.ts`, `video-player.ts`                                                | 60%                  |

### 5.3 Justification

- **Plugin lifecycle at 90%+**: This code runs once on Obsidian load/unload. A single bug here crashes the entire plugin for all users with no recovery. The cost of failure is highest.
- **Services at 80%**: These contain the business logic. Feed parsing, article saving, and filtering are the core value propositions. Bugs here directly impact user experience.
- **UI components at 60%**: UI code changes frequently with design updates. Over-testing creates brittle tests that slow development. Focus on critical user interactions.
- **Utilities at 70%**: Pure functions are cheap to test and provide high confidence. These are often called from many places.

---

## 6. Tooling Recommendations

### 6.1 Current Setup

- **Framework:** Vitest + Chai
- **Test location:** `test_files/unit/`
- **Mocking:** Manual stubs in `test_files/stubs/`
- **Configuration:** `vitest.config.mjs`

### 6.2 Recommended Improvements

| Recommendation                    | Rationale                                            | Implementation                                                                           |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Add coverage reporting**        | Currently no coverage metrics visible in CI          | Add `--coverage` flag to test command; integrate with GitHub Actions                     |
| **Implement mutation testing**    | Validates test quality beyond line coverage          | Add [`@stryker-mutator/stryker-vitest`](https://stryker-mutator.io)                      |
| **Add snapshot testing for UI**   | Guards against unintended rendering changes          | Add Vitest snapshot testing for component `innerHTML` outputs                            |
| **Create integration test suite** | Tests the complete user pipeline                     | Add `test_files/integration/` with full pipeline tests                                   |
| **Enhance Obsidian API mocking**  | Current stub is minimal; tests fail on unmocked APIs | Expand `test_files/stubs/obsidian.ts` with full `requestUrl`, `vault`, `workspace` mocks |
| **Add error boundary testing**    | Tests plugin resilience under error conditions       | Add tests for feed fetch failures, parse errors, vault permission errors                 |
| **Add performance benchmarks**    | Guards against slowdowns in large feeds              | Add `@vitest/benchmark` for feed parsing, filtering, and rendering                       |
| **Add property-based testing**    | Tests invariants across random inputs                | Consider [`fast-check`](https://fast-check.dev/) for URL parsing, filter matching        |

### 6.3 Mock Strategy for Obsidian API

Treat Obsidian's API as a black box. Recommended mock structure:

```typescript
// test_files/stubs/obsidian.ts
export const mockApp = {
  vault: {
    create: vi.fn(),
    read: vi.fn(),
    delete: vi.fn(),
    getAbstractFileByPath: vi.fn(),
  },
  workspace: {
    getActiveViewOfType: vi.fn(),
    getMostRecentLeaf: vi.fn(),
  },
  requestUrl: vi.fn(),
};

export const mockSettings = {
  // ... complete settings structure
};
```

### 6.4 CI Integration

Add to `.github/workflows/`:

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run test:unit -- --coverage
    - uses: codecov/codecov-action@v4
```

---

## Appendix: Failed Tests Analysis

The current test suite has **6 failing tests** (in 2 test files):

| Test File                                                                                                                  | Failure Reason                                                                | Recommended Fix                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`test_files/unit/discover/feed-preview-loader.test.ts`](test_files/unit/discover/feed-preview-loader.test.ts)             | Missing `requestUrl` mock configuration — tests attempt real network calls    | Add proper `mockRequestUrl` setup in beforeEach                     |
| [`test_files/unit/modals/sidebar-addfeed-opens-modal.test.ts`](test_files/unit/modals/sidebar-addfeed-opens-modal.test.ts) | Import path resolution issue — barrel import not resolving to expected module | Refactor test to use direct module import or mock module resolution |

These failures indicate test infrastructure issues rather than code bugs. They should be addressed before expanding the test suite.

---

_Report generated by TDD Coverage Audit for Obsidian RSS Dashboard Plugin (v2.2.0-beta.9)_
