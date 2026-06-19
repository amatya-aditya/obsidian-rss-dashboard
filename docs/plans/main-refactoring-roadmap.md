# Refactoring Roadmap: `main.ts`

**CURRENT PROGRESS**

6/19/26 - Phase 5 completed work but some bugs apparent:

Plugin refreshees itself every second or seo

youtube progress no longer saves its last played time but podcasts do, although there is now a noticable lag between when going to play the podcast and it actually playing (about half a second)

---

Summary:
The `main.ts` file currently acts as a "God Object" for the Obsidian RSS Dashboard plugin. It manages plugin lifecycle, settings migration/persistence, view orchestration, service coordination, and domain-specific business logic. This makes it fragile, hard to test, and difficult to maintain.

This roadmap outlines a phased strategy to decouple `main.ts` into a clean, modular architecture following Single Responsibility and Dependency Injection principles.

## Ranked Refactoring Table

| Rank  | Section/Component Name                                                                                                                                          | Refactor Action                                                                                     | Severity/Difficulty | Justification & Risks                                                                                                                                                                                                                                             | Dependencies                     |
| :---- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| **1** | **[COMPLETED] Settings & State Management**<br/>(`loadSettings`, `saveSettings`, `migrateLegacySettings`, vault metadata listeners, `getMetadataPath`)          | Extract to `SettingsManager` or `ConfigurationService`.                                             | **Critical / High** | **Justification:** Settings are the bedrock of the plugin. Every view and service relies on them. `main.ts` currently handles complex vault vs. plugin data logic.<br/>**Risks:** Breaking settings could cause data loss. Must be done carefully using a facade. | None. Must be foundational.      |
| **2** | **[COMPLETED] View Orchestration & URI Handlers**<br/>(`activateView`, `activateDiscoverView`, `resolveRequestedUriAction`, `applyMobileOptimizations`)         | Extract to `ViewOrchestrator` and `UriProtocolHandler`.                                             | **High**            | **Justification:** UI registration and Obsidian protocol logic clutters the plugin lifecycle. Decoupling allows views to be managed independently.<br/>**Risks:** Breaking Obsidian workspace leaf management.                                                    | Phase 1 (Settings).              |
| **3** | **[COMPLETED] Feed Orchestration & Business Logic**<br/>(`refreshFeeds`, `applyFeedLimitsToAllFeeds`, `startBackgroundImport`, `addYouTubeFeed`, OPML wrappers) | Extract to `FeedOrchestrationService` and specific Domain Controllers.                              | **High**            | **Justification:** `main.ts` acts as a global dispatcher for feed updates, tightly coupling it to network logic.<br/>**Risks:** Race conditions during background sync if state isn't managed well.                                                               | Phase 1 (Settings).              |
| **4** | **[COMPLETED] Utility & Pure Functions**<br/>(`getVaultFilePath`, `decodeUriFeedUrl`, `buildUriAddFeedTitle`, `getAllArticles`, pure type guards)               | Isolate into pure functions in `src/utils/` (e.g., `uri-utils.ts`, `plugin-utils.ts`).              | **Moderate**        | **Justification:** Quick wins. These methods do not rely on plugin state but clutter the class.<br/>**Risks:** Minimal. Mostly import path updates.                                                                                                               | None. Can be done progressively. |
| **5** | **Plugin Lifecycle (Thin Entry Point)**<br/>(`onload`, `onunload`, timers)                                                                                      | Refactor `main.ts` to only handle Dependency Injection (DI) wiring and Obsidian event registration. | **Low**             | **Justification:** The end goal. `main.ts` should only initialize services and bind events.<br/>**Risks:** Minimal, provided previous phases are well-tested.                                                                                                     | Phases 1-4.                      |

---

## Execution Plan: Phase 1 (Settings & State Management)

Phase 1 is the most critical and must be executed without breaking existing views or components that expect `this.plugin.settings` or `this.plugin.saveSettings()` to exist. We will strictly adhere to **Test-Driven Development (TDD)** to ensure safety.

### Step 1: Write Failing Tests (Red Phase)

Before creating the new service or altering `main.ts`, write the test suite for the new `SettingsManager` in `test_files/unit/services/settings-manager.test.ts`.

- Mock Obsidian's `Plugin.loadData` and `Plugin.saveData`.
- Write tests that assert:
  - Default settings are applied if no data exists.
  - Legacy settings schemas are migrated correctly.
  - The correct data location is used based on `metadataStorageMode` ("plugin-default" vs "vault-location").
- **Verify the tests fail** because the `SettingsManager` class does not exist yet.

### Step 2: Create the Isolated Service (Green Phase)

Create the new class `SettingsManager` in `src/services/settings-manager.ts`. Move all settings-related methods (`loadSettings`, `saveSettings`, `migrateLegacySettings`, `migrateMetadataToVaultLocation`, and vault listeners) into this class.

- Inject the Obsidian `App` and the `Plugin` instance into the constructor.
- Implement the logic until the test suite passes.

### Step 3: Implement the Facade Pattern in `main.ts`

Instantiate the `SettingsManager` in `onload()`.
Do **not** remove `saveSettings()` or the `settings` property from `main.ts` immediately. Instead, turn them into delegates (a Facade) to prevent breaking changes across the codebase:

```typescript
// In main.ts
export default class RssDashboardPlugin extends Plugin {
  public settingsManager: SettingsManager;

  // Maintain backward compatibility for components
  get settings() {
    return this.settingsManager.settings;
  }

  async saveSettings() {
    await this.settingsManager.saveSettings();
  }
}
```

### Step 4: Progressive Decoupling & Cleanup (Refactor Phase)

Once the facade is stable and tests remain green, progressively update views and services to accept `SettingsManager` via constructor injection instead of the `RssDashboardPlugin` instance. Once all references are updated, remove the facade from `main.ts`.

### Step 5: Verification

Run the full test suite (`npm run test:unit`) to ensure the entire plugin continues to function perfectly and coverage meets thresholds (`lines 55`, `branches 45`, `functions 50`).
