# `main.ts` Refactor Audit

# STATUS: 4/14/26 - started and completed

## Phase 0 — Establish Baseline ✅

- [x] Read `main.ts` in full
- [x] Locate all related test files
- [x] Run full suite and record baseline

**Green baseline:** 112 test files · 843 tests · all passing.

Existing test files for `main.ts`:

- `test_files/unit/main/plugin-lifecycle.test.ts`
- `test_files/unit/main/background-import-orchestration.test.ts`
- `test_files/unit/main/feed-refresh-pipeline.test.ts`
- `test_files/unit/main/activate-view-leaf-selection.test.ts`
- `test_files/unit/main/settings-open-navigation.test.ts`

---

## Phase 1 — Audit & Smell Report ✅

- [x] Responsibility map
- [x] Coupling & cohesion issues
- [x] Testability gaps
- [x] Proposed module decomposition

### Responsibility Map

`main.ts` is **2,589 lines** and `RssDashboardPlugin` carries at least **11 distinct responsibilities**:

| #   | Responsibility                           | Approx. Lines | Key Methods                                                                                                                                         |
| --- | ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin lifecycle (Obsidian registration) | ~200          | `onload`, `onunload`, `applyMobileOptimizations`                                                                                                    |
| 2   | Settings load/normalize/migrate          | ~450          | `loadSettings`, `migrateLegacySettings`, `normalizeAndDedupeStoredFeedItems`                                                                        |
| 3   | Feed refresh pipeline                    | ~270          | `refreshFeeds`, `refreshSingleFeed`, `refreshFeedBatch`, `refreshFeedWithTimeout`, `refreshFeedDirect`, `mergeRefreshedFeed`                        |
| 4   | Background import orchestration          | ~380          | `startBackgroundImport`, `processBackgroundImportQueue`, `processBackgroundImportWorker`, `createPlaceholderFeed`, `ingestFeedsForBackgroundImport` |
| 5   | Feed CRUD                                | ~210          | `addFeed`, `addYouTubeFeed`, `addSubfolder`, `editFeed`, `updateArticle`, `applyFeedLimitsToAllFeeds`                                               |
| 6   | Folder management                        | ~90           | `folderPathExists`, `ensureFolderExists`, `repairMissingFolderPathsForFeeds`                                                                        |
| 7   | Import / export                          | ~185          | `importOpml`, `exportOpml`, `importUserSettingsJsonFromFile`, `getUserSettingsJson`, `exportUserSettingsJson`, `exportDataJson`, clipboard methods  |
| 8   | Auto-backup                              | ~115          | `performAutoBackups`, `performAutoBackupsSyncDesktop`                                                                                               |
| 9   | View navigation                          | ~175          | `activateView`, `activateDiscoverView`, `activateSmallwebView`, `getActive*View`, `openTagsSettings`, `openSettingsToTab`                           |
| 10  | Article sync / reader bridge             | ~85           | `onArticleSaved`, `updateArticleFromReader`, `syncReaderArticleUpdate`, `syncDashboardArticleUpdate`                                                |
| 11  | Article validation & utilities           | ~65           | `validateSavedArticles`, `checkSavedFileExists`, `sanitizeFilename`, `getAllArticles`                                                               |

### Coupling & Cohesion Issues

**God methods:**

- `onload()` (~200 lines) — initializes services, registers 4 views, registers a ribbon icon, adds a settings tab, registers 8 commands, sets up an auto-refresh interval, and triggers an immediate refresh. Registration is tightly tangled with initialization.
- `loadSettings()` (~160 lines) — reads raw data, merges defaults, normalizes `refreshInterval`, runs migration, normalizes feed `keywordRules`, migrates `autoDeleteDuration`/`maxItems` per-feed, normalizes all five page-size fields, repairs missing folder paths, deduplicates stored items, and saves if anything changed. Each of those tasks is its own responsibility.
- `migrateLegacySettings()` (~180 lines) — handles 8+ independent migration paths (savePath → articleSaving, template fields, addSavedTag, display settings, keywordRules, dashboardMultiFilters, per-feed rules, autoBackup). Each path is unrelated to the next.

**Tight coupling between unrelated concerns:**

- `showImportProgressModal()` (DOM construction producing a status UI) lives inside `RssDashboardPlugin`, binding UI presentation to import orchestration.
- `importOpml()` contains an Electron-specific `window.require` branch for desktop file dialogs, a fallback `<input type=file>` branch for mobile, and the actual OPML parse dispatch — three separate concerns in one 70-line method.
- Background import tracks 5 mutable state fields directly on the plugin class (`isBackgroundImporting`, `backgroundImportQueue`, `backgroundImportInFlightUrls`, `backgroundImportProcessedCount`, `backgroundImportTotalCount`), spreading the state machine across the class.

**Shared mutable state:**

- `this.settings` is mutated by settings loading, migration, feed CRUD, article updates, import, and backup — every responsibility writes to it.
- `this.activeRefreshState` (the per-feed refresh status map) is written by `refreshFeedBatch` and read externally by views; it leaks refresh-pipeline state onto the public plugin surface.

### Testability Gaps

- **`migrateLegacySettings()`** — no direct tests; only exercised via `loadSettings()` in `plugin-lifecycle.test.ts`. Individual migration paths (e.g. the display or dashboardMultiFilters branches) have no targeted coverage.
- **`normalizeAndDedupeStoredFeedItems()`** — only covered indirectly; the dedup/merge logic (pickLonger, mergeTags, canonicalization) has no standalone unit tests.
- **`showImportProgressModal()`** — zero test coverage; DOM construction logic is completely untested.
- **`importOpml()` Electron branch** — the `window.require` / `fs.readFileSync` desktop path is unreachable in the test environment and has no coverage.
- **`validateSavedArticles()` + `checkSavedFileExists()`** — the file-path construction logic (`sanitizeFilename`, folder/filename composition) has no direct unit tests.
- **`performAutoBackupsSyncDesktop()`** — the synchronous Electron-FS backup path is only smoke-tested via `onunload`; individual backup cases (data.json, opml, userdata fallback) are untested.

### Proposed Module Decomposition

Modules are ordered Low → Medium → High risk. Work them in that order.

| New File                                    | Responsibilities Extracted                                                                                                                                                                                                                                                                   | Exported Surface                                                                                                                  | Risk       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/services/backup-service.ts`            | `performAutoBackups`, `performAutoBackupsSyncDesktop`                                                                                                                                                                                                                                        | `BackupService` class accepting `{ settings, manifest, vaultAbsolutePath, vault }`                                                | **Low**    |
| `src/services/folder-service.ts`            | `folderPathExists`, `ensureFolderExists`, `repairMissingFolderPathsForFeeds`                                                                                                                                                                                                                 | `FolderService` class or pure functions accepting `settings.folders`                                                              | **Low**    |
| `src/services/import-export-service.ts`     | `getUserSettingsJson`, `exportUserSettingsJson`, `exportDataJson`, `exportOpml`, `copyDataJsonToClipboard`, `copyUserSettingsJsonToClipboard`, `copyOpmlToClipboard`, `showExportNotice`, `showCopyNotice`                                                                                   | `ImportExportService` class accepting `{ settings, isMobile }`                                                                    | **Low**    |
| `src/services/background-import-service.ts` | `startBackgroundImport`, `processBackgroundImportQueue`, `processBackgroundImportWorker`, `mergeBackgroundImportedFeed`, `createPlaceholderFeed`, `ingestFeedsForBackgroundImport`, `parseFeedWithTimeout`, `updateBackgroundImportProgress`, `showImportProgressModal` + the 5 state fields | `BackgroundImportService` class accepting `{ feedParser, settings, getView, saveSettings, ensureFolderExists, addStatusBarItem }` | **Medium** |
| `src/utils/settings-loader.ts`              | `loadSettings` orchestration (normalization, page-size migration, feed defaults), `migrateLegacySettings` (all 8 paths), `normalizeAndDedupeStoredFeedItems`                                                                                                                                 | Pure functions: `loadAndNormalizeSettings(rawData)`, `migrateSettings(settings)`, `dedupeAndNormalizeFeedItems(feeds)`            | **High**   |

---

## Phase 2 — Red Phase (Failing Tests First)

Write tests for each new module **before** extracting any code. Confirm each new test is red before moving on.

### Module A · `backup-service.ts` · Low risk

- [x] Create `test_files/unit/services/backup-service.test.ts`
- [x] Test: `performAutoBackups` skips when `autoBackup` is falsy
- [x] Test: `performAutoBackups` writes `data.json.backup` when `backupDataJson` is true
- [x] Test: `performAutoBackups` writes `feeds.opml.backup` when `backupOpml` is true
- [x] Test: `performAutoBackups` writes `userdata.json.backup` when `backupUserdata` is true (userdata fallback chain)
- [x] Test: `performAutoBackupsSyncDesktop` returns `false` when `autoBackup` is falsy
- [x] Test: `performAutoBackupsSyncDesktop` returns `false` when `window.require` is absent
- [x] Test: `performAutoBackupsSyncDesktop` copies files via `fs.copyFileSync`
- [x] Confirm all new tests are **red** · failing output recorded

### Module B · `folder-service.ts` · Low risk

- [x] Create `test_files/unit/services/folder-service.test.ts`
- [x] Test: `folderPathExists` returns `true` for `"Uncategorized"` and empty string
- [x] Test: `folderPathExists` returns `true` for a path that exists in the hierarchy
- [x] Test: `folderPathExists` returns `false` for a missing top-level folder
- [x] Test: `folderPathExists` returns `false` for a missing nested path
- [x] Test: `ensureFolderExists` creates a missing top-level folder and returns `true`
- [x] Test: `ensureFolderExists` creates a nested path and returns `true`
- [x] Test: `ensureFolderExists` is a no-op for existing paths and returns `false`
- [x] Test: `ensureFolderExists` returns `false` for `"Uncategorized"`
- [x] Test: `repairMissingFolderPathsForFeeds` creates missing paths referenced by feeds
- [x] Test: `repairMissingFolderPathsForFeeds` is a no-op when all paths are valid
- [x] Confirm all new tests are **red** · paste failing output as comment in test file

### Module C · `import-export-service.ts` · Low risk

- [x] Create `test_files/unit/services/import-export-service.test.ts`
- [x] Test: `getUserSettingsJson` omits `feeds`, `folders`, `availableTags` from output
- [x] Test: `getUserSettingsJson` produces valid JSON
- [x] Test: `showExportNotice` fires correct `Notice` for each result variant (`downloaded`, `shared`, `canceled`, `failed`)
- [x] Test: `showCopyNotice` fires correct `Notice` for `copied` and `failed`
- [x] Test: `exportOpml` calls `exportBlob` with a `text/xml` blob
- [x] Test: `exportDataJson` calls `exportBlob` with an `application/json` blob containing full settings
- [x] Confirm all new tests are **red** · failing output recorded

### Module D · `background-import-service.ts` · Medium risk

- [x] Create `test_files/unit/services/background-import-service.test.ts`
- [x] Test: `createPlaceholderFeed` sets `mediaType` to `"video"` for YouTube folder
- [x] Test: `createPlaceholderFeed` sets `mediaType` to `"podcast"` for podcast folder
- [x] Test: `createPlaceholderFeed` falls back to global `defaultAutoDeleteDuration` when candidate value is absent
- [x] Test: `createPlaceholderFeed` falls back to global `maxItems` when candidate value is absent
- [x] Test: `mergeBackgroundImportedFeed` updates title/author/items from parsed feed
- [x] Test: `mergeBackgroundImportedFeed` is a no-op when feed URL is not in settings
- [x] Test: `updateBackgroundImportProgress` updates the text span in the status bar element
- [x] Confirm all new tests are **red** before extraction

### Module E · `settings-loader.ts` · High risk

- [x] Create `test_files/unit/utils/settings-loader.test.ts`
- [x] Test: `loadAndNormalizeSettings` merges `DEFAULT_SETTINGS` with raw data
- [x] Test: `loadAndNormalizeSettings` normalizes `refreshInterval` via `normalizeRefreshIntervalMinutes`
- [x] Test: `loadAndNormalizeSettings` applies `defaultAutoDeleteDuration` to feeds missing it
- [x] Test: `loadAndNormalizeSettings` applies `maxItems` to feeds missing `maxItemsLimit`
- [x] Test: `loadAndNormalizeSettings` normalizes all five page-size fields to `allArticlesPageSize`
- [x] Test: `migrateSettings` migrates `savePath` → `articleSaving.defaultFolder`
- [x] Test: `migrateSettings` migrates legacy `template` → `articleSaving.defaultTemplate`
- [x] Test: `migrateSettings` migrates `addSavedTag` → `articleSaving.addSavedTag`
- [x] Test: `migrateSettings` initializes missing `dashboardMultiFilters` from defaults
- [x] Test: `migrateSettings` normalizes `dashboardMultiFilters.logic` to `"OR"` when invalid
- [x] Test: `dedupeAndNormalizeFeedItems` merges duplicate GUIDs, preferring longer content
- [x] Test: `dedupeAndNormalizeFeedItems` merges `tags` without duplicates
- [x] Test: `dedupeAndNormalizeFeedItems` sorts items newest-first
- [x] Test: `dedupeAndNormalizeFeedItems` canonicalizes item GUIDs via `canonicalizeItemIdentityUrl`
- [x] Confirm all new tests are **red** before extraction

---

## Phase 3 — Green Phase (Extract One Module at a Time) ✅ Complete

**Current Status:** Phase 3 is complete. Phase 4 is the active phase. Latest verification: 117 test files · 896 tests passing.

**Rule:** Run the full suite after each extraction. All 843 previously green tests must stay green.
If a previously passing test goes red: stop, revert, document the regression.

### Module A · `backup-service.ts`

- [x] Create `src/services/backup-service.ts` with `BackupService` class
- [x] Move `performAutoBackups` into `BackupService`
- [x] Move `performAutoBackupsSyncDesktop` into `BackupService`
- [x] Replace usages in `main.ts` (`onunload`, `_beforeUnloadHandler`) with `BackupService` calls
- [x] Keep public delegation methods for backward compatibility
- [x] Update test mocks in `plugin-lifecycle.test.ts` to initialize `BackupService`
- [x] Run full suite — all 850 tests green
- [x] Leave checkpoint comment: `// ✅ BackupService extracted — all 850 tests passing`

### Module B · `folder-service.ts`

- [x] Create `src/services/folder-service.ts` with `FolderService` class (or pure functions)
- [x] Move `folderPathExists`, `ensureFolderExists`, `repairMissingFolderPathsForFeeds`
- [x] Update all call sites in `main.ts` (CRUD methods, `loadSettings`, `ingestFeedsForBackgroundImport`)
- [x] Update call sites in views that call `plugin.ensureFolderExists` directly
- [x] Run full suite — all tests green
- [x] Leave checkpoint comment: `// ✅ FolderService extracted — all 865 tests passing`

### Module C · `import-export-service.ts`

- [x] Create `src/services/import-export-service.ts` with `ImportExportService` class
- [x] Move `getUserSettingsJson`, `exportUserSettingsJson`, `exportDataJson`, `exportOpml`
- [x] Move `copyDataJsonToClipboard`, `copyUserSettingsJsonToClipboard`, `copyOpmlToClipboard`
- [x] Move `showExportNotice`, `showCopyNotice`
- [x] Keep thin public wrappers on `RssDashboardPlugin` that delegate to the service (callers in settings tab, views, commands)
- [x] Fix Module B regression: add null guard to `repairMissingFolderPathsForFeeds()` for the initial `loadSettings()` call before `folderService` is initialized
- [x] Run full suite — all 875 tests green
- [x] Leave checkpoint comment: `// ✅ ImportExportService extracted — all 875 tests passing`

### Module D · `background-import-service.ts`

- [x] Create `src/services/background-import-service.ts` with `BackgroundImportService` class
- [x] Move all 5 state fields into the class
- [x] Move `createPlaceholderFeed`, `showImportProgressModal`, `updateBackgroundImportProgress`
- [x] Move `parseFeedWithTimeout`, `mergeBackgroundImportedFeed`
- [x] Move `startBackgroundImport`, `processBackgroundImportQueue`, `processBackgroundImportWorker`
- [x] Move `ingestFeedsForBackgroundImport` (keep public delegation on plugin if needed by callers)
- [x] Update `main.ts` to instantiate `BackgroundImportService` and proxy public methods
- [x] Run full suite — all currently green tests pass (`settings-loader.test.ts` still intentionally red)
- [x] Leave checkpoint comment: `// ✅ BackgroundImportService extracted — all 882 currently green tests passing`

### Module E · `settings-loader.ts`

- [x] Create `src/utils/settings-loader.ts` with pure functions
- [x] Extract `dedupeAndNormalizeFeedItems` (formerly `normalizeAndDedupeStoredFeedItems`)
- [x] Extract `migrateSettings` (formerly `migrateLegacySettings`)
- [x] Extract `loadAndNormalizeSettings` containing all normalization logic from `loadSettings`
- [x] Rewrite `loadSettings` in `main.ts` to call the new pure functions and persist the result
- [x] Run full suite — all tests green
- [x] Leave checkpoint comment: `// ✅ settings-loader extracted — all 896 tests passing`

---

## Phase 4 — Refactor Phase · In Progress

Run the full suite after every non-trivial change.

- [x] Remove duplication: `parseFeedWithTimeout` timeout constant vs. `FEED_REFRESH_TIMEOUT_MS` — unified to shared `FEED_REQUEST_TIMEOUT_MS`
- [x] Rename for clarity: removed the remaining `normalizeAndDedupeStoredFeedItems()` wrapper in `main.ts`; load path now calls `dedupeAndNormalizeFeedItems()` directly
- [ ] Apply consistent error-handling pattern to all service methods (log + `new Notice` vs. rethrow)
- [ ] Add JSDoc to all exported members of the five new modules
- [ ] Review `main.ts` remaining size and responsibilities — target < 600 lines (`main.ts` currently 1,563 lines)
- [x] Run full suite — confirm still green (`npm run test:unit` → 117 test files · 896 tests passing)
- [ ] Commit: `refactor: decompose main.ts into focused service modules`

### Manual Verification Checklist

Use this after the code refactor to confirm behavior in a real Obsidian vault, not just unit tests.

- [x] Plugin startup: reload Obsidian or re-enable the plugin and confirm the dashboard opens without startup errors, settings load successfully, and no data is lost.
- [x] View registration: open the dashboard, discover, reader, and smallweb views and confirm each view activates normally after plugin load.
- [o] Feed refresh timeout path: trigger a refresh with at least one intentionally slow or unreachable feed and confirm timed-out feeds are reported without breaking the rest of the refresh batch.
- [x] Background import timeout path: import feeds through OPML or discovery, confirm the background import status bar appears, progress updates, and slow feeds fail or time out without aborting the queue.
- [x] Settings load normalization: restart with a vault containing existing RSS data and confirm duplicate stored items remain deduped, feed ordering is preserved, and migrated settings persist after reload.
- [x] Folder repair path: verify feeds assigned to nested folders still resolve correctly and missing folder paths are recreated during settings load when needed.
- [x] Import/export smoke test: export OPML, full `data.json`, and user-settings JSON; then verify each action completes and the exported content is non-empty.
- [x] Clipboard export smoke test: run the clipboard copy actions for OPML, full settings, and user-settings JSON and confirm success notices appear.
- [x] Auto-backup smoke test: enable auto-backup, unload or reload the plugin, and confirm backup files such as `data.json.backup`, `feeds.opml.backup`, and `userdata.json.backup` update as expected.
- [x] Feed CRUD regression check: add a feed, edit it, move it into a folder, and confirm folder creation, feed metadata updates, and article refresh still work.
