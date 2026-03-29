# RSS Dashboard Plugin - Test Coverage Audit Report

**Generated:** 2026-03-29  
**Plugin Version:** 2.2.0-beta.9  
**Test Framework:** Vitest 1.6.1 + jsdom  
**Current Thresholds:** Lines: 40% | Branches: 30% | Functions: 50%

---

## 1. Inventory

### 1.1 Source Files by Category

#### Core Logic (Parsers, Models, Feed Handling, State Management)

| Source File                                                                                  | Has Test File                                                                                                             | Notes                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [`src/services/feed-parser.ts`](src/services/feed-parser.ts)                                 | ✅ [`test_files/unit/services/feed-parser.test.ts`](test_files/unit/services/feed-parser.test.ts)                         | Comprehensive parser tests              |
| [`src/services/article-saver.ts`](src/services/article-saver.ts)                             | ❌                                                                                                                        | No test file                            |
| [`src/services/highlight-service.ts`](src/services/highlight-service.ts)                     | ❌                                                                                                                        | No test file                            |
| [`src/services/keyword-filter-service.ts`](src/services/keyword-filter-service.ts)           | ❌                                                                                                                        | No test file                            |
| [`src/services/media-service.ts`](src/services/media-service.ts)                             | ✅ `media-service.normalizeNitterUrlToRss.test.ts`                                                                        | Partial - only Nitter URL normalization |
| [`src/services/opml-import-preview-model.ts`](src/services/opml-import-preview-model.ts)     | ✅ [`test_files/unit/modals/opml-import-preview-model.test.ts`](test_files/unit/modals/opml-import-preview-model.test.ts) |                                         |
| [`src/services/opml-manager.ts`](src/services/opml-manager.ts)                               | ❌                                                                                                                        | No test file                            |
| [`src/services/sidebar-ordering-controller.ts`](src/services/sidebar-ordering-controller.ts) | ❌                                                                                                                        | No test file                            |
| [`src/services/sidebar-search-service.ts`](src/services/sidebar-search-service.ts)           | ❌                                                                                                                        | No test file                            |
| [`src/services/web-viewer-integration.ts`](src/services/web-viewer-integration.ts)           | ❌                                                                                                                        | No test file                            |
| [`src/services/apple-podcasts-service.ts`](src/services/apple-podcasts-service.ts)           | ❌                                                                                                                        | No test file                            |

#### UI Components / Views

| Source File                                                                          | Has Test File                                                                              | Notes                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [`src/views/dashboard-view.ts`](src/views/dashboard-view.ts)                         | ❌                                                                                         | No test file                                                     |
| [`src/views/discover-view.ts`](src/views/discover-view.ts)                           | ❌                                                                                         | No test file                                                     |
| [`src/views/reader-view.ts`](src/views/reader-view.ts)                               | ✅ Multiple                                                                                | [`reader-view-*.test.ts`](test_files/unit/views/) - 8 test files |
| [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts)                 | ❌                                                                                         | No test file                                                     |
| [`src/views/podcast-player.ts`](src/views/podcast-player.ts)                         | ✅ [`podcast-player.test.ts`](test_files/unit/views/podcast-player.test.ts)                |                                                                  |
| [`src/views/video-player.ts`](src/views/video-player.ts)                             | ❌                                                                                         | No test file                                                     |
| [`src/components/sidebar.ts`](src/components/sidebar.ts)                             | ✅ Multiple                                                                                | 3 test files for collapse, scrolling, icons                      |
| [`src/components/article-list.ts`](src/components/article-list.ts)                   | ✅ [`article-list.test.ts`](test_files/unit/components/article-list.test.ts)               |                                                                  |
| [`src/components/article-header.ts`](src/components/article-header.ts)               | ✅ [`article-header.test.ts`](test_files/unit/components/article-header.test.ts)           |                                                                  |
| [`src/components/article-filter-menu.ts`](src/components/article-filter-menu.ts)     | ✅ [`article-filter-menu.test.ts`](test_files/unit/components/article-filter-menu.test.ts) |                                                                  |
| [`src/components/discover-sidebar.ts`](src/components/discover-sidebar.ts)           | ❌                                                                                         | No test file                                                     |
| [`src/components/folder-selector-popup.ts`](src/components/folder-selector-popup.ts) | ❌                                                                                         | No test file                                                     |
| [`src/components/folder-suggest.ts`](src/components/folder-suggest.ts)               | ❌                                                                                         | No test file                                                     |
| [`src/components/keyword-filter-editor.ts`](src/components/keyword-filter-editor.ts) | ❌                                                                                         | No test file                                                     |

#### Plugin Lifecycle

| Source File                      | Has Test File                                                                                       | Notes                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------- |
| [`main.ts`](main.ts)             | ✅ [`test_files/unit/main/plugin-lifecycle.test.ts`](test_files/unit/main/plugin-lifecycle.test.ts) | Comprehensive - 1084 lines |
| [`manifest.json`](manifest.json) | N/A                                                                                                 | Config file                |

#### Modals

| Source File                                                                                                | Has Test File                                                                                                 | Notes        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ |
| [`src/modals/feed-manager-modal.ts`](src/modals/feed-manager-modal.ts)                                     | ❌                                                                                                            | No test file |
| [`src/modals/feed-preview-modal.ts`](src/modals/feed-preview-modal.ts)                                     | ❌                                                                                                            | No test file |
| [`src/modals/import-opml-modal.ts`](src/modals/import-opml-modal.ts)                                       | ❌                                                                                                            | No test file |
| [`src/modals/import-success-modal.ts`](src/modals/import-success-modal.ts)                                 | ❌                                                                                                            | No test file |
| [`src/modals/mobile-discover-filters-modal.ts`](src/modals/mobile-discover-filters-modal.ts)               | ❌                                                                                                            | No test file |
| [`src/modals/mobile-navigation-modal.ts`](src/modals/mobile-navigation-modal.ts)                           | ❌                                                                                                            | No test file |
| [`src/modals/feed-manager/feed-manager-modal.ts`](src/modals/feed-manager/feed-manager-modal.ts)           | ❌                                                                                                            | No test file |
| [`src/modals/feed-manager/add-feed-modal.ts`](src/modals/feed-manager/add-feed-modal.ts)                   | ❌                                                                                                            | No test file |
| [`src/modals/feed-manager/edit-feed-modal.ts`](src/modals/feed-manager/edit-feed-modal.ts)                 | ❌                                                                                                            | No test file |
| [`src/modals/feed-manager/feed-preview-loader.ts`](src/modals/feed-manager/feed-preview-loader.ts)         | ✅ [`discover/feed-preview-loader.test.ts`](test_files/unit/discover/feed-preview-loader.test.ts)             |              |
| [`src/modals/feed-manager/supported-format-badges.ts`](src/modals/feed-manager/supported-format-badges.ts) | ✅ [`components/supported-format-badges.test.ts`](test_files/unit/components/supported-format-badges.test.ts) |              |

#### Settings

| Source File                                                                                                | Has Test File                                                                                          | Notes        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| [`src/settings/settings-tab.ts`](src/settings/settings-tab.ts)                                             | ❌                                                                                                     | No test file |
| [`src/settings/tabs/general-settings-tab.ts`](src/settings/tabs/general-settings-tab.ts)                   | ✅ [`settings-tab-general.test.ts`](test_files/unit/settings/settings-tab-general.test.ts)             |              |
| [`src/settings/tabs/display-settings-tab.ts`](src/settings/tabs/display-settings-tab.ts)                   | ✅ [`settings-tab-display.test.ts`](test_files/unit/settings/settings-tab-display.test.ts)             |              |
| [`src/settings/tabs/highlights-settings-tab.ts`](test_files/unit/settings/settings-tab-highlights.test.ts) | ✅ [`settings-tab-highlights.test.ts`](test_files/unit/settings/settings-tab-highlights.test.ts)       |              |
| [`src/settings/tabs/article-saving-settings-tab.ts`](src/settings/tabs/article-saving-settings-tab.ts)     | ❌                                                                                                     | No test file |
| [`src/settings/tabs/media-settings-tab.ts`](src/settings/tabs/media-settings-tab.ts)                       | ❌                                                                                                     | No test file |
| [`src/settings/tabs/import-export-settings-tab.ts`](src/settings/tabs/import-export-settings-tab.ts)       | ✅ [`import-export-settings-tab.test.ts`](test_files/unit/settings/import-export-settings-tab.test.ts) |              |
| [`src/settings/tabs/tags-settings-tab.ts`](src/settings/tabs/tags-settings-tab.ts)                         | ❌                                                                                                     | No test file |
| [`src/settings/tabs/rules-settings-tab.ts`](src/settings/tabs/rules-settings-tab.ts)                       | ❌                                                                                                     | No test file |
| [`src/settings/tabs/about-settings-tab.ts`](src/settings/tabs/about-settings-tab.ts)                       | ❌                                                                                                     | No test file |
| [`src/settings/modals/settings-modals.ts`](src/settings/modals/settings-modals.ts)                         | ❌                                                                                                     | No test file |

#### Utilities / Helpers

| Source File                                                                        | Has Test File                                                                                           | Notes                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| [`src/utils/url-utils.ts`](src/utils/url-utils.ts)                                 | ❌                                                                                                      | No direct test file    |
| [`src/utils/validation.ts`](src/utils/validation.ts)                               | ✅ [`validation.test.ts`](test_files/unit/utils/validation.test.ts)                                     |                        |
| [`src/utils/export-utils.ts`](src/utils/export-utils.ts)                           | ✅ [`export-utils.test.ts`](test_files/unit/utils/export-utils.test.ts)                                 |                        |
| [`src/utils/pagination-utils.ts`](src/utils/pagination-utils.ts)                   | ✅ [`pagination-utils.test.ts`](test_files/unit/utils/pagination-utils.test.ts)                         |                        |
| [`src/utils/popover-position.ts`](src/utils/popover-position.ts)                   | ✅ [`popover-position.test.ts`](test_files/unit/components/popover-position.test.ts)                    |                        |
| [`src/utils/platform-utils.ts`](src/utils/platform-utils.ts)                       | ❌                                                                                                      | No test file           |
| [`src/utils/settings-migration.ts`](src/utils/settings-migration.ts)               | ✅ Multiple                                                                                             | 5 migration test files |
| [`src/utils/dashboard-multi-filters.ts`](src/utils/dashboard-multi-filters.ts)     | ✅ [`dashboard-multi-filters-util.test.ts`](test_files/unit/utils/dashboard-multi-filters-util.test.ts) |                        |
| [`src/utils/favicon-utils.ts`](src/utils/favicon-utils.ts)                         | ❌                                                                                                      | No test file           |
| [`src/utils/filter-title-format.ts`](src/utils/filter-title-format.ts)             | ✅ [`filter-title-format.test.ts`](test_files/unit/utils/filter-title-format.test.ts)                   |                        |
| [`src/utils/tag-utils.ts`](src/utils/tag-utils.ts)                                 | ❌                                                                                                      | No test file           |
| [`src/utils/sidebar-icon-registry.ts`](src/utils/sidebar-icon-registry.ts)         | ✅ [`sidebar-icon-registry.test.ts`](test_files/unit/components/sidebar-icon-registry.test.ts)          |                        |
| [`src/utils/sidebar-sort-utils.ts`](src/utils/sidebar-sort-utils.ts)               | ❌                                                                                                      | No test file           |
| [`src/utils/sidebar-folder-sort-utils.ts`](src/utils/sidebar-folder-sort-utils.ts) | ❌                                                                                                      | No test file           |
| [`src/utils/folder-paths.ts`](src/utils/folder-paths.ts)                           | ✅ [`folder-paths.test.ts`](test_files/unit/utils/folder-paths.test.ts)                                 |                        |
| [`src/utils/folder-tree.ts`](src/utils/folder-tree.ts)                             | ✅ [`folder-tree-remove.test.ts`](test_files/unit/utils/folder-tree-remove.test.ts)                     | Partial                |

#### Test Files Summary

| Category      | Source Files | Tested | Untested | Coverage % |
| ------------- | ------------ | ------ | -------- | ---------- |
| Core Services | 11           | 3      | 8        | 27%        |
| Views         | 6            | 3      | 3        | 50%        |
| Components    | 8            | 6      | 2        | 75%        |
| Modals        | 10           | 1      | 9        | 10%        |
| Settings      | 11           | 5      | 6        | 45%        |
| Utilities     | 16           | 9      | 7        | 56%        |
| **Total**     | **62**       | **27** | **35**   | **44%**    |

---

## 2. Coverage Gap Analysis

### 2.1 Critical Gaps (P0 - High Risk)

#### [`src/services/feed-parser.ts`](src/services/feed-parser.ts:559) - `fetchFeedXml()` Function

- **Risk Level:** Critical
- **Untested Behaviors:**
  - Feed discovery via HTML page scraping
  - AllOrigins proxy fallback chain
  - Codetabs proxy fallback
  - rss2json API fallback
  - FeedBurner URL discovery
  - WordPress alternative URL discovery
  - HTTP/HTTPS scheme toggling
- **Why Risky:** This is the primary data ingestion path. Failures here mean users get no feed content. The proxy chain complexity (6+ fallback strategies) is prone to regressions.

#### [`main.ts`](main.ts:906) - `startBackgroundImport()` / `processBackgroundImportQueue()`

- **Risk Level:** Critical
- **Untested Behaviors:**
  - Background queue processing logic
  - Progress reporting
  - SaveEvery/renderEvery batch logic
  - Import status tracking
  - Abort handling
- **Why Risky:** Large OPML imports (thousands of feeds) rely on this. Bugs here cause data loss or infinite loops.

#### [`src/services/article-saver.ts`](src/services/article-saver.ts) - Entire File

- **Risk Level:** Critical
- **Untested Behaviors:**
  - File saving to vault
  - Template rendering
  - Path resolution and sanitization
- **Why Risky:** Core user value proposition - saving articles. Failures result in data loss or corrupt files.

#### [`main.ts`](main.ts:574) - `refreshFeeds()` Error Handling

- **Risk Level:** High
- **Untested Behaviors:**
  - Partial feed refresh failures
  - Notice message formatting for errors
- **Why Risky:** Users need to know when feeds fail, but error handling paths are mocked away in tests.

### 2.2 High Priority Gaps (P1)

#### Views - Dashboard, Discover, Smallweb

- **[`src/views/dashboard-view.ts`](src/views/dashboard-view.ts)** - No tests
  - Risk: Filter application, pagination, rendering logic untested
- **[`src/views/discover-view.ts`](src/views/discover-view.ts)** - No tests
  - Risk: Feed discovery UI, preview loading untested
- **[`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts)** - No tests
  - Risk: Smallweb integration untested

#### Feed Management Modals

- **[`src/modals/feed-manager/add-feed-modal.ts`](src/modals/feed-manager/add-feed-modal.ts)** - No tests
- **[`src/modals/feed-manager/edit-feed-modal.ts`](src/modals/feed-manager/edit-feed-modal.ts)** - No tests
- **[`src/modals/import-opml-modal.ts`](src/modals/import-opml-modal.ts)** - No tests
  - Risk: User-facing feed management is completely untested

#### Settings Tabs

- **[`src/settings/tabs/article-saving-settings-tab.ts`](src/settings/tabs/article-saving-settings-tab.ts)** - No tests
- **[`src/settings/tabs/media-settings-tab.ts`](src/settings/tabs/media-settings-tab.ts)** - No tests

### 2.3 Medium Priority Gaps (P2)

#### Utilities - Network and Platform

- **[`src/utils/fetch-helpers.ts`](src/utils/fetch-helpers.ts)** - Partial tests only
- **[`src/utils/platform-utils.ts`](src/utils/platform-utils.ts)** - No tests
- **[`src/utils/favicon-utils.ts`](src/utils/favicon-utils.ts)** - No tests

#### Sidebar Services

- **[`src/services/sidebar-ordering-controller.ts`](src/services/sidebar-ordering-controller.ts)** - No tests
- **[`src/services/sidebar-search-service.ts`](src/services/sidebar-search-service.ts)** - No tests

---

## 3. Test Quality Assessment

### 3.1 Happy-Path Only Tests

| Test File                                                                               | Issue                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`feed-parser.test.ts`](test_files/unit/services/feed-parser.test.ts)                   | Tests valid RSS/Atom feeds but no malformed XML edge cases |
| [`article-list.test.ts`](test_files/unit/components/article-list.test.ts)               | Tests normal rendering, no empty states or error states    |
| [`settings-tab-general.test.ts`](test_files/unit/settings/settings-tab-general.test.ts) | Tests save paths exist, no invalid path handling           |
| [`export-utils.test.ts`](test_files/unit/utils/export-utils.test.ts)                    | Tests happy export paths, no permission error handling     |

### 3.2 Implementation-Detailed Tests (Fragile)

| Test File                                                                                            | Problem                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`reader-view-onclose-cleanup.test.ts`](test_files/unit/views/reader-view-onclose-cleanup.test.ts)   | Tests internal `_cleanup` method name                          |
| [`sidebar-settings-migration.test.ts`](test_files/unit/settings/sidebar-settings-migration.test.ts)  | Tests internal migration flag `didMigrateSidebarSettings`      |
| [`dashboard-filter-persistence.test.ts`](test_files/unit/views/dashboard-filter-persistence.test.ts) | Tests internal `display.showFilterStatusBar` property directly |

### 3.3 Missing Integration Tests

| Missing Integration                   | Description                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Feed Fetch → Parse → Render Pipeline  | No test covers the full path: `fetchFeedXml()` → `FeedParser.parseFeed()` → dashboard render |
| OPML Import → Background Fetch → Save | No test covers `ImportOpmlModal` → `startBackgroundImport()` → `saveSettings()`              |
| Add Feed → Parse → Sidebar Update     | No test covers `addFeed()` → feed parsing → sidebar refresh                                  |
| Settings Change → View Re-render      | No test covers settings tab changes → dashboard refresh                                      |

### 3.4 Missing RSS/Atom Parsing Edge Cases

| Edge Case                                       | Status                                |
| ----------------------------------------------- | ------------------------------------- |
| Malformed XML with unclosed tags                | Partial - fallback parser tested      |
| Missing `<channel>` element                     | Not tested                            |
| Duplicate item GUIDs                            | Not tested                            |
| Items with only `<guid>` and no `<link>`        | Not tested                            |
| Encoding: ISO-8859-1 feeds                      | Not tested (relies on network layer)  |
| Encoding: UTF-16BE/LE feeds                     | Not tested                            |
| Empty `<title>` or `<description>`              | Not tested                            |
| RFC 822 date formats (deprecated)               | Not tested                            |
| RFC 2822 date with timezones                    | Not tested                            |
| Content with embedded CDATA that contains `]]>` | Not tested                            |
| Feed with only `<category>` but no content      | Not tested                            |
| Atom feeds with `rel="enclosure"` links         | Not tested                            |
| RSS 1.0 (RDF) feeds                             | Parser code exists, but minimal tests |

---

## 4. Recommended Test Additions

### Priority P0 (Critical)

| File/Module                                       | Scenario                          | Test Structure                                                                                                        |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/services/feed-parser.ts` - `fetchFeedXml()`  | Test AllOrigins proxy fallback    | `describe("fetchFeedXml proxy fallback")` - mock `requestUrl` to return invalid feed, verify proxy chain is attempted |
| `src/services/feed-parser.ts` - `fetchFeedXml()`  | Test WordPress alternative URLs   | `describe("WordPress feed discovery")` - mock HTML response with `/feed/` links                                       |
| `src/services/feed-parser.ts` - `CustomXMLParser` | Test malformed XML error recovery | `describe("malformed XML handling")` - feed with unclosed tags, verify fallback parsing                               |
| `main.ts` - `processBackgroundImportQueue()`      | Test large batch import           | `describe("background import queue")` - mock 100+ feeds, verify batch saving                                          |
| `src/services/article-saver.ts` - `saveArticle()` | Test template rendering           | `describe("article saving")` - mock vault, verify template substitution                                               |

### Priority P1 (High Value)

| File/Module                                        | Scenario                | Test Structure                                                           |
| -------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `src/views/dashboard-view.ts`                      | Test filter application | `describe("dashboard filtering")` - apply filter, verify item visibility |
| `src/views/dashboard-view.ts`                      | Test pagination         | `describe("pagination")` - 100+ items, verify page boundaries            |
| `src/modals/import-opml-modal.ts`                  | Test OPML parsing       | `describe("OPML import")` - mock file with folders, verify feed creation |
| `src/modals/feed-manager/add-feed-modal.ts`        | Test URL validation     | `describe("add feed validation")` - invalid URLs, duplicates             |
| `src/settings/tabs/article-saving-settings-tab.ts` | Test template preview   | `describe("template preview")` - verify template renders correctly       |
| `src/services/opml-manager.ts`                     | Test OPML generation    | `describe("OPML generation")` - feeds with nested folders                |

### Priority P2 (Nice to Have)

| File/Module                               | Scenario                      | Test Structure                                                |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `src/utils/favicon-utils.ts`              | Test favicon fetching         | `describe("favicon extraction")` - mock HTML responses        |
| `src/utils/platform-utils.ts`             | Test mobile/desktop detection | `describe("platform utilities")` - verify Platform.isMobile() |
| `src/components/folder-selector-popup.ts` | Test folder tree navigation   | `describe("folder selection")` - nested folder navigation     |
| `src/views/kagi-smallweb-view.ts`         | Test Smallweb integration     | `describe("Smallweb view")` - data loading and rendering      |

---

## 5. Coverage Targets

### Recommended Targets by Category

| Category                         | Line % | Branch % | Function % | Justification                                         |
| -------------------------------- | ------ | -------- | ---------- | ----------------------------------------------------- |
| **Core Services (Feed Parsing)** | 85%    | 75%      | 90%        | Critical data path - failures affect all users        |
| **Article Saving**               | 80%    | 70%      | 85%        | Core user value proposition - data integrity critical |
| **Views (Dashboard, Reader)**    | 75%    | 65%      | 80%        | User-facing functionality, high visibility            |
| **Modals (Feed Management)**     | 70%    | 60%      | 75%        | User interactions, but less critical than core        |
| **Settings**                     | 70%    | 60%      | 75%        | Configuration impacts, but recoverable                |
| **Utilities**                    | 65%    | 55%      | 70%        | Helper functions, lower blast radius                  |
| **Overall Project**              | 75%    | 65%      | 80%        | Achievable with P0/P1 test additions                  |

### Current vs Target Comparison

| Metric    | Current Threshold | Recommended Target | Gap  |
| --------- | ----------------- | ------------------ | ---- |
| Lines     | 40%               | 75%                | +35% |
| Branches  | 30%               | 65%                | +35% |
| Functions | 50%               | 80%                | +30% |

---

## 6. Tooling Recommendations

### 6.1 Immediate Improvements

1. **Mutation Testing**
   - Tool: [`@vitest/mutation-testing`](https://github.com/vitest/dev)
   - Rationale: Identify tests that pass but don't verify behavior (e.g., mocked-away assertions)
   - Command: `vitest run --coverage --mutation`

2. **Network Mocking**
   - Tool: [`msw`](https://mswjs.io/) (Mock Service Worker)
   - Rationale: More realistic HTTP mocking than manual `vi.fn()` spies
   - Use for: `fetchFeedXml()` proxy chain tests

3. **Snapshot Testing**
   - Tool: Vitest built-in
   - Use for: Complex template rendering (article saving templates), OPML output

### 6.2 Test Infrastructure

1. **Shared Test Fixtures**
   - Create `test_files/fixtures/` for:
     - Sample RSS/Atom/JSON feeds
     - OPML files (simple, nested folders)
     - Sample article templates
   - Rationale: DRY - same fixtures used across multiple test files

2. **Custom Matchers**
   - Add to `test-dom-polyfills.ts` or new file:
     - `toHaveAttribute()` for DOM elements
     - `toBeValidFeed()` for feed validation
   - Rationale: More readable assertions

### 6.3 Mock Strategy for Obsidian API

Current approach uses [`test_files/stubs/obsidian.ts`](test_files/stubs/obsidian.ts). Recommendations:

1. **Add Integration Test Stub**
   - Create `test_files/stubs/integration.ts` that mocks full `app` context
   - Include: `app.vault.getAbstractFileByPath()`, `app.vault.adapter.read/write`

2. **Mock `requestUrl` Properly**
   - Current: Manual `vi.spyOn(obsidian, "requestUrl")`
   - Better: MSW handlers that return specific XML fixtures
   - Rationale: Easier to test proxy fallback chains

### 6.4 Coverage Enforcement

Add to `vitest.config.mjs`:

```javascript
// Fail CI if coverage drops below targets
coverage: {
  // ... existing config
  thresholds: {
    lines: 75,
    branches: 65,
    functions: 80,
    perFile: false, // Allow some files below threshold
  },
}
```

Add to `package.json`:

```json
"scripts": {
  "test:ci": "vitest run --config vitest.config.mjs --coverage",
  "pre-push": "npm run test:ci"
}
```

### 6.5 Missing Testing Tools

| Tool               | Status        | Recommendation                                           |
| ------------------ | ------------- | -------------------------------------------------------- |
| `sinon`            | Not installed | Consider for more sophisticated spies/stubs              |
| `testing-library`  | Not installed | Consider for DOM testing (current jsdom + manual DOM ok) |
| `nock`             | Not installed | Consider if MSW is too complex (HTTP mocking)            |
| `mutation-testing` | Not installed | HIGH PRIORITY - add for test quality                     |

---

## Summary Scorecard

| Category              | Current State           | Risk Level | Priority |
| --------------------- | ----------------------- | ---------- | -------- |
| **Core Feed Parsing** | Good - 70%+ coverage    | Critical   | P0       |
| **Article Saving**    | No tests                | Critical   | P0       |
| **Background Import** | No tests                | Critical   | P0       |
| **Views (Dashboard)** | No tests                | High       | P1       |
| **Views (Reader)**    | Good - 8 test files     | Medium     | Maintain |
| **Modals**            | Minimal tests           | High       | P1       |
| **Settings**          | Partial - ~50%          | Medium     | P1       |
| **Utilities**         | Partial - ~55%          | Low        | P2       |
| **Overall**           | 40% lines, 30% branches | High       | P0       |

---

_Report generated from analysis of 62 source files and 63 test files. Current test coverage thresholds: Lines 40%, Branches 30%, Functions 50%._
