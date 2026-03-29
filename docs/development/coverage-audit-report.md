# RSS Dashboard Plugin - Test Coverage Audit Report

## Summary Scorecard

| Category             | Files       | Tested    | Coverage | Risk Level  |
| -------------------- | ----------- | --------- | -------- | ----------- |
| **Plugin Lifecycle** | 1 (main.ts) | ❌ 0      | 0%       | 🔴 Critical |
| **Views**            | 6           | ~10 tests | ~25%     | 🟠 High     |
| **Components**       | 9           | ~18 tests | ~35%     | 🟡 Medium   |
| **Services**         | 11          | ~15 tests | ~60%     | 🟡 Medium   |
| **Settings**         | 11          | ~10 tests | ~20%     | 🟠 High     |
| **Modals**           | 9           | ~2 tests  | ~10%     | 🔴 Critical |
| **Utils**            | 25+         | ~10 tests | ~15%     | 🟡 Medium   |
| **Types**            | 3           | ❌ 0      | 0%       | 🟢 Low      |

**Overall Assessment**: ~45% code coverage with critical gaps in plugin lifecycle, modal interactions, and settings persistence.

---

## 1. Inventory

### Core Logic (Services)

| File                                          | Test File                                                                | Status          |
| --------------------------------------------- | ------------------------------------------------------------------------ | --------------- |
| `src/services/feed-parser.ts`                 | `test_files/unit/services/feed-parser.test.ts`                           | ✅ Well-covered |
| `src/services/article-saver.ts`               | ❌ None                                                                  | ❌ Gap          |
| `src/services/keyword-filter-service.ts`      | ❌ None                                                                  | ❌ Gap          |
| `src/services/highlight-service.ts`           | ❌ None                                                                  | ❌ Gap          |
| `src/services/opml-manager.ts`                | ❌ None                                                                  | ❌ Gap          |
| `src/services/opml-import-preview-model.ts`   | `test_files/unit/modals/opml-import-preview-model.test.ts`               | ⚠️ Partial      |
| `src/services/media-service.ts`               | `test_files/unit/services/media-service.normalizeNitterUrlToRss.test.ts` | ⚠️ Partial      |
| `src/services/sidebar-ordering-controller.ts` | ❌ None                                                                  | ❌ Gap          |
| `src/services/sidebar-search-service.ts`      | ❌ None                                                                  | ❌ Gap          |
| `src/services/web-viewer-integration.ts`      | ❌ None                                                                  | ❌ Gap          |
| `src/services/apple-podcasts-service.ts`      | ❌ None                                                                  | ❌ Gap          |

### UI Components / Views

| File                                      | Test File                                                | Status     |
| ----------------------------------------- | -------------------------------------------------------- | ---------- |
| `src/views/dashboard-view.ts`             | `test_files/unit/views/dashboard-*.test.ts` (8 files)    | ⚠️ Partial |
| `src/views/reader-view.ts`                | `test_files/unit/views/reader-view-*.test.ts` (8 files)  | ⚠️ Partial |
| `src/views/discover-view.ts`              | ❌ None                                                  | ❌ Gap     |
| `src/views/video-player.ts`               | ❌ None                                                  | ❌ Gap     |
| `src/views/podcast-player.ts`             | `test_files/unit/views/podcast-player.test.ts`           | ⚠️ Partial |
| `src/views/kagi-smallweb-view.ts`         | ❌ None                                                  | ❌ Gap     |
| `src/components/sidebar.ts`               | `test_files/unit/components/sidebar-*.test.ts` (4 files) | ⚠️ Partial |
| `src/components/article-list.ts`          | `test_files/unit/components/article-list.test.ts`        | ⚠️ Partial |
| `src/components/article-header.ts`        | `test_files/unit/components/article-header.test.ts`      | ✅ Covered |
| `src/components/article-filter-menu.ts`   | `test_files/unit/components/article-filter-menu.test.ts` | ✅ Covered |
| `src/components/discover-sidebar.ts`      | ❌ None                                                  | ❌ Gap     |
| `src/components/folder-selector-popup.ts` | ❌ None                                                  | ❌ Gap     |
| `src/components/folder-suggest.ts`        | ❌ None                                                  | ❌ Gap     |
| `src/components/keyword-filter-editor.ts` | ❌ None                                                  | ❌ Gap     |

### Plugin Lifecycle

| File                           | Test File | Status          |
| ------------------------------ | --------- | --------------- |
| `main.ts` (RssDashboardPlugin) | ❌ None   | ❌ Critical Gap |

### Settings / Modals

| File                                            | Test File                                                    | Status     |
| ----------------------------------------------- | ------------------------------------------------------------ | ---------- |
| `src/settings/settings-tab.ts`                  | `test_files/unit/settings/settings-tab-*.test.ts` (3 files)  | ⚠️ Partial |
| `src/settings/tabs/general-settings-tab.ts`     | `test_files/unit/settings/settings-tab-general.test.ts`      | ⚠️ Partial |
| `src/settings/tabs/display-settings-tab.ts`     | `test_files/unit/settings/settings-tab-display.test.ts`      | ⚠️ Partial |
| `src/settings/tabs/highlights-settings-tab.ts`  | `test_files/unit/settings/settings-tab-highlights.test.ts`   | ⚠️ Partial |
| Other settings tabs                             | ❌ None                                                      | ❌ Gap     |
| `src/modals/feed-manager/feed-manager-modal.ts` | ❌ None                                                      | ❌ Gap     |
| `src/modals/feed-manager/add-feed-modal.ts`     | ❌ None                                                      | ❌ Gap     |
| `src/modals/feed-manager/edit-feed-modal.ts`    | ❌ None                                                      | ❌ Gap     |
| `src/modals/feed-preview-modal.ts`              | ❌ None                                                      | ❌ Gap     |
| `src/modals/import-opml-modal.ts`               | `test_files/unit/modals/sidebar-addfeed-opens-modal.test.ts` | ⚠️ Partial |
| Other modals                                    | ❌ None                                                      | ❌ Gap     |

### Utilities

| File                               | Test File                                                     | Status     |
| ---------------------------------- | ------------------------------------------------------------- | ---------- |
| `src/utils/url-utils.ts`           | `test_files/unit/services/x-nitter-redirection.test.ts`       | ⚠️ Partial |
| `src/utils/validation.ts`          | `test_files/unit/utils/validation.test.ts`                    | ✅ Covered |
| `src/utils/pagination-utils.ts`    | `test_files/unit/utils/pagination-utils.test.ts`              | ✅ Covered |
| `src/utils/filter-title-format.ts` | `test_files/unit/utils/filter-title-format.test.ts`           | ✅ Covered |
| `src/utils/export-utils.ts`        | `test_files/unit/utils/export-utils.test.ts`                  | ✅ Covered |
| `src/utils/platform-utils.ts`      | ❌ None                                                       | ❌ Gap     |
| `src/utils/fetch-helpers.ts`       | `test_files/unit/services/fetch-helpers.test.ts`              | ⚠️ Partial |
| `src/utils/settings-migration.ts`  | `test_files/unit/settings/sidebar-settings-migration.test.ts` | ⚠️ Partial |
| Most other utils                   | ❌ None                                                       | ❌ Gap     |

---

## 2. Coverage Gap Analysis

### 🔴 CRITICAL GAPS

#### 2.1 `main.ts` - Plugin Lifecycle (0% coverage)

**Functions/Behaviors Untested:**

- `onload()` initialization flow (lines 156-340)
- `onunload()` cleanup and backup logic (lines 2145-2157)
- `refreshFeeds()` and all feed refresh variants
- `importOpml()` file handling and parsing
- `startBackgroundImport()` and `processBackgroundImportQueue()`
- `addFeed()`, `editFeed()`, `deleteFeed()` operations
- Settings load/save cycle with migrations
- `performAutoBackups()` and `performAutoBackupsSyncDesktop()`
- All command handlers and ribbon icon callbacks
- View activation (`activateView()`, `activateDiscoverView()`)

**Risk**: This is the **single most critical gap**. The plugin entry point handles:

- Feed refresh scheduling and background imports
- Settings migration from legacy formats
- File system backup operations
- Article state synchronization across views

A regression in `loadSettings()` could silently corrupt user data. A bug in `refreshFeeds()` could delete articles incorrectly.

---

#### 2.2 `src/modals/` - Modal Interactions (5% coverage)

**Gap**: All modal interactions are essentially untested.

**Key Missing Behaviors:**

| File                         | Missing Coverage                                                  |
| ---------------------------- | ----------------------------------------------------------------- |
| `feed-manager-modal.ts`      | Modal open/close lifecycle, folder tree rendering, feed selection |
| `add-feed-modal.ts`          | URL validation, folder assignment, feed creation flow             |
| `edit-feed-modal.ts`         | Feed editing, URL change handling                                 |
| `feed-preview-modal.ts`      | Feed preview loading, error states, preview display               |
| `import-opml-modal.ts`       | OPML parsing, progress display, error recovery                    |
| `mobile-navigation-modal.ts` | Mobile-specific navigation                                        |

**Risk**: Modals handle user data entry and modification. Bugs can cause:

- Data loss (incorrect feed deletion)
- Feed corruption (bad URL/folder assignment)
- User confusion (broken UI states)

---

#### 2.3 `src/views/discover-view.ts` (0% coverage)

**Functions/Behaviors Untested:**

- Feed discovery and categorization
- Search functionality
- Discover sidebar interactions
- Discover→Dashboard navigation

**Risk**: Discover view is a major entry point. Bugs could affect feed discovery accuracy.

---

### 🟠 HIGH RISK GAPS

#### 2.4 `src/views/dashboard-view.ts` - Core View Logic (25% coverage)

**Current Coverage**: Only pagination, filter persistence, default filter startup, and header title batching.

**Missing Coverage:**

| Function                         | Line Range | Risk                                       |
| -------------------------------- | ---------- | ------------------------------------------ |
| `onOpen()`                       | 134-290    | Event registration, sidebar initialization |
| `getFilteredArticles()`          | 804-913    | Core filtering logic - CRITICAL            |
| `matchesFilters()`               | 1862-2006  | Complex filter matching                    |
| `applyKeywordFiltersWithStats()` | 978-1043   | Keyword rule application                   |
| `handleArticleClick()`           | 1553-1607  | Article opening logic                      |
| `handleArticleSave()`            | 1677-1707  | Article saving flow                        |
| `updateArticleStatus()`          | 1709-1749  | State management                           |
| `handleFileDeleted()`            | 2763-2783  | Vault event handling                       |
| `handleFileRenamed()`            | 2785-2805  | Path update logic                          |
| Sidebar resize logic             | 2113-2198  | UI interaction                             |
| Mobile sidebar handling          | 1448-1541  | Platform-specific                          |

**Risk**: Dashboard view is the primary interface. Filter logic bugs could cause articles to disappear unexpectedly.

---

#### 2.5 `src/services/article-saver.ts` (0% coverage)

**Functions/Behaviors Untested:**

- `saveArticle()` full content generation
- `saveArticleWithFullContent()` template rendering
- File path handling and conflict resolution
- Template variable substitution
- Obsidian vault write operations (must mock)

**Risk**: Article saving is a core user workflow. Bugs could:

- Lose article content
- Corrupt saved files
- Create duplicate files

---

#### 2.6 Settings Tabs (20% coverage)

**Gap**: Only general, display, and highlights tabs have minimal tests.

**Missing:**

- `about-settings-tab.ts` - About/version info display
- `article-saving-settings-tab.ts` - Template editor, folder selection
- `media-settings-tab.ts` - Podcast/video settings
- `import-export-settings-tab.ts` - Import/export flow
- `rules-settings-tab.ts` - Keyword rules configuration
- `tags-settings-tab.ts` - Tag management

**Risk**: Settings bugs could cause data loss during import/export or corrupt article saving configuration.

---

### 🟡 MEDIUM RISK GAPS

#### 2.7 `src/services/keyword-filter-service.ts` (0% coverage)

**Functions/Behaviors Untested:**

- Rule evaluation logic
- Include/exclude logic
- Match mode handling (contains, exact, regex)
- Feed-level rule application

**Risk**: Keyword filters are user-configurable business logic. Bugs could silently exclude or include wrong articles.

---

#### 2.8 `src/services/highlight-service.ts` (0% coverage)

**Functions/Behaviors Untested:**

- Word matching with regex
- Case sensitivity handling
- Whole-word boundary logic
- Field selection (titles, content, summaries)

**Risk**: Lower user impact but affects reading experience.

---

#### 2.9 `src/components/sidebar.ts` (15% coverage)

**Current Coverage**: Only icon registry, scrolling, and collapse logic.

**Missing Coverage:**

- Folder tree rendering
- Feed list population and sorting
- Tag section management
- Unread badge calculation
- Folder collapse/expand persistence
- Add/edit/delete feed UI flows
- Drag-and-drop folder reordering

**Risk**: Sidebar is the primary navigation. Bugs could make feeds inaccessible.

---

#### 2.10 Utilities - Platform & Fetch (0% coverage)

| File                          | Missing                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `src/utils/platform-utils.ts` | `sleep()`, `setCssProps()`, `shouldUseMobileSidebarLayout()` |
| `src/utils/fetch-helpers.ts`  | `robustFetch()`, encoding detection, error handling          |
| `src/utils/safe-html.ts`      | HTML sanitization logic                                      |

**Risk**: Platform utilities affect cross-platform behavior. Encoding bugs could corrupt feed content.

---

### 🟢 LOW RISK GAPS

#### 2.11 Types and Interfaces

**Gap**: No tests for type utilities or validation helpers.

**Risk**: Low - TypeScript provides compile-time safety.

---

## 3. Test Quality Assessment

### 3.1 Tests with Happy-Path Only (Missing Error/Edge Cases)

#### `test_files/unit/services/feed-parser.test.ts` (BEST)

**Strengths**:

- Tests CDATA handling, malformed XML recovery
- Tests encoding edge cases (BOM, Unicode)
- Tests merge deduplication logic
- Tests retention limit logic

**Weaknesses**:

- No tests for network timeout scenarios
- No tests for HTTP error responses (4xx, 5xx)
- No tests for malformed date parsing
- Missing feed pagination handling

---

#### `test_files/unit/settings/sidebar-settings-migration.test.ts`

**Issue**: Tests reproduce the migration logic inline rather than testing the actual implementation.

```typescript
// Line 43-47 - This duplicates implementation instead of importing it
if (typeof feedWithoutAutoDelete.autoDeleteDuration !== "number") {
  feedWithoutAutoDelete.autoDeleteDuration = settings.defaultAutoDeleteDuration;
}
```

**Risk**: If migration logic changes, tests pass but real migration fails.

---

#### `test_files/unit/services/encoding-detection.test.ts`

**Issue**: Tests a local copy of the detection logic, not the actual implementation in `platform-utils.ts`.

```typescript
// Line 7-17 - Duplicated implementation
function detectCharsetFromBody(text: string): string | null {
  const charsetMatch = text.match(/<meta[^>]+charset=["']?([^"' >]+)/i);
  // ...
}
```

**Risk**: Tests pass even if `platform-utils.ts` implementation differs or has bugs.

---

### 3.2 Tests Tightly Coupled to Implementation Details

#### `test_files/unit/components/sidebar-collapse-logic.test.ts`

```typescript
// Line 6-10 - Entire file is a placeholder
describe("sidebar collapse (DOM-based)", () => {
  it("collapse behaviour is validated via sidebar-icon-registry.test.ts", () => {
    // applyResponsiveCollapse operates on live DOM scrollWidth/clientWidth —
    // not testable as a pure function.
  });
});
```

**Issue**: No actual test assertions. Cannot detect regressions.

---

#### `test_files/unit/views/dashboard-default-filter-startup.test.ts`

**Potential Issue**: Tests may be checking internal state rather than observable behavior.

---

### 3.3 Missing Integration-Level Tests

#### Critical Missing Pipeline Tests:

1. **Feed Fetch → Parse → Render Pipeline**
   - No tests for: fetch XML → parse → merge with existing items → apply filters → display

2. **OPML Import → Feed Fetch → Display Pipeline**
   - No tests for: import OPML → validate URLs → background fetch → populate feeds → render sidebar

3. **Article Save Pipeline**
   - No tests for: click save → generate content → write to vault → update state → refresh UI

4. **Filter Change → Rerender Pipeline**
   - No tests for: change filter → apply to items → update counts → re-render list

---

### 3.4 Missing RSS/Atom Edge Case Coverage

#### Parser Edge Cases Not Tested:

| Edge Case                                  | File             | Risk                 |
| ------------------------------------------ | ---------------- | -------------------- |
| Malformed XML with missing closing tags    | `feed-parser.ts` | Data loss            |
| Empty `<item>` elements                    | `feed-parser.ts` | Display bugs         |
| Duplicate GUIDs in same feed               | `feed-parser.ts` | Deduplication issues |
| Invalid date formats (RFC 2822 edge cases) | `feed-parser.ts` | Sorting bugs         |
| Very long titles (>1000 chars)             | `feed-parser.ts` | UI overflow          |
| HTML entities in GUIDs                     | `feed-parser.ts` | Identity bugs        |
| Base64-encoded content                     | `feed-parser.ts` | Content loss         |
| Missing `<link>` element (Atom fallback)   | `feed-parser.ts` | Broken links         |
| Mixed namespaces in RSS/Atom               | `feed-parser.ts` | Parser failure       |
| Feed with only `<title>` and no items      | `feed-parser.ts` | Empty state handling |

---

## 4. Recommended Test Additions

### P0 - Critical (Fix Before Next Release)

#### 4.1 `main.ts` Plugin Lifecycle Tests

**Target**: `main.ts`

**Scenarios to Cover:**

```
describe("RssDashboardPlugin.onload")
  ├── should initialize feedParser and articleSaver
  ├── should register all view types
  ├── should register commands (6 total)
  ├── should set up refresh interval
  ├── should apply mobile optimizations when Platform.isMobile
  └── should handle initialization errors gracefully

describe("RssDashboardPlugin.refreshFeeds")
  ├── should refresh all feeds when no selection
  ├── should refresh selected feed only
  ├── should refresh feeds in folder
  ├── should show notice with feed count
  └── should handle refresh errors

describe("RssDashboardPlugin.loadSettings")
  ├── should apply DEFAULT_SETTINGS for missing fields
  ├── should migrate legacy keyword rules
  ├── should repair missing folder paths
  ├── should normalize page sizes
  └── should normalize and dedupe stored items

describe("RssDashboardPlugin.importOpml")
  ├── should handle file selection
  ├── should parse OPML content
  ├── should filter duplicate feeds
  └── should start background import

describe("RssDashboardPlugin.addFeed")
  ├── should reject duplicate URLs
  ├── should set mediaType based on folder
  ├── should parse feed before adding
  └── should handle parse errors gracefully

describe("RssDashboardPlugin.onunload")
  ├── should remove beforeunload listener
  ├── should perform sync backup on desktop
  └── should trigger async backup otherwise
```

**Mock Strategy**: Mock `this.app`, `this.app.vault`, `this.app.workspace`, `this.feedParser`, `this.articleSaver`.

---

#### 4.2 Dashboard View Filter Logic Tests

**Target**: `src/views/dashboard-view.ts`

**Scenarios to Cover:**

```
describe("getFilteredArticles")
  ├── should return all articles for all-feeds view
  ├── should filter by current feed
  ├── should filter by folder (including descendants)
  ├── should filter by selected tags (OR mode)
  ├── should filter by selected tags (AND mode)
  ├── should filter by selected tags (NOT mode)
  ├── should filter by special folders (unread/read/starred/saved)
  └── should sort by newest first (default)

describe("matchesFilters")
  ├── should match status filters (AND mode)
  ├── should match status filters (OR mode)
  ├── should match tag filters (AND mode)
  ├── should match tag filters (OR mode)
  ├── should respect age filter cutoff
  ├── should handle untagged/tagged special filters
  └── should combine status and tag filters correctly

describe("applyKeywordFiltersWithStats")
  ├── should exclude articles matching global exclude rules
  ├── should include articles matching global include rules
  ├── should apply feed-specific rules separately
  ├── should track exclusion counts for stats display
  └── should bypass all rules when bypassAll is true
```

---

#### 4.3 Article Saver Pipeline Tests

**Target**: `src/services/article-saver.ts`

**Scenarios to Cover:**

```
describe("saveArticle")
  ├── should generate markdown with template variables
  ├── should handle missing optional fields gracefully
  ├── should write file to correct vault path
  ├── should return TFile on success
  └── should throw on write failure

describe("saveArticleWithFullContent")
  ├── should fetch full article content
  ├── should apply custom template
  ├── should handle fetch timeout
  └── should handle invalid HTML gracefully

describe("verifyAllSavedArticles")
  ├── should mark unsaved articles that have files
  ├── should unmark saved articles with missing files
  └── should handle path conflicts
```

---

### P1 - High Value (Add After P0)

#### 4.4 Modal Interaction Tests

**Target**: `src/modals/feed-manager/add-feed-modal.ts`

```
describe("AddFeedModal")
  ├── should validate URL format on input
  ├── should show folder suggestions
  ├── should preview feed before adding
  ├── should handle network errors during preview
  ├── should call plugin.addFeed on submit
  └── should close modal on cancel
```

---

#### 4.5 OPML Manager Tests

**Target**: `src/services/opml-manager.ts`

```
describe("parseOpmlMetadata")
  ├── should parse standard RSS outline
  ├── should handle nested folder structure
  ├── should extract xmlUrl attribute
  ├── should handle missing title (use xmlUrl)
  └── should handle invalid XML gracefully

describe("generateOpml")
  ├── should generate valid OPML with header
  ├── should output all feeds as outlines
  ├── should preserve folder structure
  └── should handle empty feeds list
```

---

#### 4.6 Keyword Filter Service Tests

**Target**: `src/services/keyword-filter-service.ts`

```
describe("evaluateForArticle")
  ├── should include article matching include rule
  ├── should exclude article matching exclude rule
  ├── should handle regex match mode
  ├── should respect applyToTitle/Summary/Content flags
  └── should apply AND logic between multiple rules

describe("hasActiveRules")
  └── should return true when any enabled rule exists
```

---

#### 4.7 Platform Utilities Tests

**Target**: `src/utils/platform-utils.ts`

```
describe("robustFetch")
  ├── should retry on timeout
  ├── should handle CORS proxy
  ├── should detect encoding from header
  ├── should detect encoding from meta tag
  └── should fallback to UTF-8

describe("shouldUseMobileSidebarLayout")
  ├── should return true below 768px
  ├── should return false above 768px
  └── should handle tablet breakpoint (768px)
```

---

#### 4.8 Discover View Tests

**Target**: `src/views/discover-view.ts`

```
describe("DiscoverView")
  ├── should load discover-feeds.json
  ├── should categorize feeds by type
  ├── should handle search/filter
  └── should navigate to dashboard on feed selection
```

---

### P2 - Nice to Have

#### 4.9 Feed Parser Edge Cases

```
describe("CustomXMLParser")
  ├── should handle missing guid (use link fallback)
  ├── should handle malformed pubDate
  ├── should handle empty CDATA sections
  ├── should handle mixed namespace elements
  ├── should handle very large feeds (>1000 items)
  └── should handle special characters in titles
```

---

#### 4.10 Settings Migration Tests (Import Real Implementation)

**Current Issue**: Tests duplicate migration logic.

**Fix**: Import actual functions from `settings-migration.ts`:

```typescript
import { migrateKeywordRulesSettings } from "../../../src/utils/settings-migration";

// Then test actual implementation, not copy
describe("migrateKeywordRulesSettings", () => {
  it("should migrate legacy filter field", () => { ... });
});
```

---

#### 4.11 End-to-End Pipeline Tests

```
describe("Feed Refresh Pipeline")
  ├── should fetch → parse → merge → save → notify views
  └── should handle partial failures gracefully

describe("Article Save Pipeline")
  ├── should click → generate → write → update state → notify
  └── should handle vault permission errors

describe("Filter Change Pipeline")
  ├── should change filter → filter items → update counts → rerender
  └── should preserve article selection
```

---

## 5. Coverage Targets

### 5.1 Recommended Coverage Percentages by Category

| Category                                  | Line Coverage | Branch Coverage | Function Coverage | Rationale                                        |
| ----------------------------------------- | ------------- | --------------- | ----------------- | ------------------------------------------------ |
| **Plugin Lifecycle (main.ts)**            | 80%           | 70%             | 90%               | Critical entry point; bugs here affect all users |
| **Views (dashboard, reader, discover)**   | 70%           | 60%             | 85%               | Core user interactions; complex state management |
| **Services (feed-parser, article-saver)** | 85%           | 75%             | 95%               | Business logic; data integrity                   |
| **Components (sidebar, article-list)**    | 65%           | 55%             | 80%               | UI rendering; some DOM coupling                  |
| **Modals (feed-manager, import-opml)**    | 60%           | 50%             | 75%               | User data entry; secondary priority              |
| **Settings (tabs)**                       | 55%           | 45%             | 70%               | Configuration; lower risk of data loss           |
| **Utils (platform, url, validation)**     | 70%           | 60%             | 85%               | Shared utilities; bugs propagate                 |
| **Types**                                 | 0%            | 0%              | 0%                | TypeScript compile-time safety                   |

### 5.2 Category-Specific Targets

#### Core Business Logic (feed-parser, article-saver, keyword-filter)

- **Target**: 85% line, 75% branch
- **Justification**: These handle data integrity. Bugs can lose or corrupt user content.

#### Plugin Lifecycle (main.ts)

- **Target**: 80% line, 70% branch
- **Justification**: Single entry point. Initialization bugs affect all features.

#### Views (dashboard, reader)

- **Target**: 70% line, 60% branch
- **Justification**: Complex state, but DOM-dependent logic is harder to test in isolation.

#### UI Components (sidebar, article-list)

- **Target**: 65% line, 55% branch
- **Justification**: Heavy DOM coupling. Mock component behavior, test visual outcomes.

#### Modals

- **Target**: 60% line, 50% branch
- **Justification**: User workflows, but secondary to core functionality.

### 5.3 Current vs. Target Comparison

| Category         | Current | Target | Gap      |
| ---------------- | ------- | ------ | -------- |
| Plugin Lifecycle | 0%      | 80%    | **-80%** |
| Services         | 60%     | 85%    | **-25%** |
| Views            | 25%     | 70%    | **-45%** |
| Components       | 35%     | 65%    | **-30%** |
| Modals           | 10%     | 60%    | **-50%** |
| Settings         | 20%     | 55%    | **-35%** |
| Utils            | 15%     | 70%    | **-55%** |

---

## 6. Tooling Recommendations

### 6.1 Test Infrastructure Improvements

#### 1. **Add Vitest Coverage Reporting**

```bash
npm install -D @vitest/coverage-v8
```

**vite.config.mjs update:**

```javascript
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/types/**", "src/styles/**"],
    },
  },
});
```

**Benefit**: Track coverage trends over time, identify untested files.

---

#### 2. **Add Mutation Testing with Stryker**

```bash
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner
```

**Configuration** (`stryker.config.json`):

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "mutate": ["src/services/**/*.ts", "src/utils/**/*.ts", "!src/utils/*.d.ts"],
  "mutators": ["conditional", "boolean", "arithmetric", "statement"]
}
```

**Benefit**: Identifies tests that don't actually catch bugs (flaky or weak assertions).

---

#### 3. **Add Snapshot Testing for UI Components**

```bash
npm install -D @vitest/snapshot
```

**Usage** for `reader-format-portal.ts`:

```typescript
import { toMatchSnapshot } from "@vitest/snapshot";

expect(html).toMatchSnapshot();
```

**Benefit**: Catches unintended UI changes without writing detailed assertions.

---

### 6.2 Mock Strategy Improvements

#### 1. **Create Comprehensive Obsidian Mock Library**

Current: `test_files/stubs/obsidian.ts` is minimal.

**Recommended additions**:

```typescript
// Mock DataVault
export class MockDataVault {
  adapter = new MockVaultAdapter();
  // ... proper implementation
}

// Mock Workspace with event system
export class MockWorkspace {
  getLeavesOfType = vi.fn().mockReturnValue([]);
  on = vi.fn().mockReturnValue(new MockEvent());
  trigger = vi.fn();
  // ...
}

// Mock TFile for article saving tests
export class MockTFile {
  path = "/RSS articles/test-article.md";
  basename = "test-article";
  extension = "md";
  // ...
}
```

---

#### 2. **Add Integration Test Fixtures**

Create `test_files/fixtures/` for real-world test data:

```
test_files/fixtures/
├── feeds/
│   ├── rss2-substack.xml
│   ├── rss2-medium.xml
│   ├── atom-medium.xml
│   ├── jsonfeed-example.json
│   ├── malformed/
│   │   ├── missing-guid.xml
│   │   ├── invalid-date.xml
│   │   └── empty-feed.xml
│   └── edge-cases/
│       ├── long-titles.xml
│       ├── special-chars.xml
│       └── nested-cdata.xml
├── opml/
│   ├── single-feed.opml
│   ├── nested-folders.opml
│   └── many-feeds.opml
└── articles/
    └── saved-template.md
```

**Benefit**: Real-world test data catches parsing issues that synthetic data misses.

---

### 6.3 Testing Patterns to Adopt

#### 1. **Behavior-Driven Tests for Views**

Instead of testing internal state, test observable behavior:

```typescript
// ❌ Fragile - tests implementation
it("should set currentFolder to null", () => {
  view.handleFolderClick(null);
  expect(view.currentFolder).toBe(null);
});

// ✅ Robust - tests behavior
it("should show all articles when All Feeds is clicked", async () => {
  const view = createDashboardView();
  await view.onOpen();

  // Click "All Feeds" in sidebar
  clickSidebarItem("All Feeds");

  // Assert observable: article list contains all items
  expect(articleListItems()).toHaveLength(totalFeedsItems);
  expect(headerTitle()).toBe("All articles");
});
```

---

#### 2. **Arrange-Act-Assert Pattern**

```typescript
it("should deduplicate items by canonical URL", async () => {
  // Arrange
  const existingItems = createItemsWithDuplicateUrls();

  // Act
  const result = mergeFeedHistoryItems(existingItems, refreshedItems);

  // Assert
  expect(result).toHaveLength(uniqueCount);
  expect(result[0].guid).toBe(canonicalUrl);
});
```

---

#### 3. **Descriptive Test Names**

```typescript
// ❌ Unclear
it("should work", () => { ... });

// ✅ Clear
it("should exclude articles matching global EXCLUDE rule with 'not' mode", () => {
  ...
});
```

---

### 6.4 CI/CD Integration

#### Add Coverage Gates to GitHub Actions

```yaml
# .github/workflows/test.yml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Check coverage thresholds
  run: |
    npx vitest run --coverage && \
    npx coverage-thresholds \
      --line=70 \
      --branch=60 \
      --function=80
```

---

## Summary

### Critical Findings

1. **Zero coverage on `main.ts`** - Plugin lifecycle untested
2. **Modal coverage <10%** - User data entry flows untested
3. **Dashboard filter logic untested** - Core user functionality at risk
4. **Article saver untested** - Data loss potential

### Priority Actions

1. **P0**: Add `main.ts` plugin lifecycle tests
2. **P0**: Add dashboard view filter logic tests
3. **P1**: Add article saver tests
4. **P1**: Add OPML manager tests
5. **P2**: Add mutation testing for critical services

### Estimated Test Files Needed

| Priority  | New Test Files        |
| --------- | --------------------- |
| P0        | ~8-10 files           |
| P1        | ~10-12 files          |
| P2        | ~5-8 files            |
| **Total** | ~23-30 new test files |

---

_Report generated: 2024-03-29_
_Plugin: obsidian-rss-dashboard v2.2.0_
