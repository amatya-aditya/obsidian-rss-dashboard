# Shard Storage 2.0 Implementation Plan

This document outlines the design and implementation approach for migrating to a hybrid three-file storage layout ("Shard Storage 2.0"), splitting rapidly-changing article content from user-interaction state to resolve sync race conditions.

## Resolved Design Decisions

### Auto-Tagging & Sparse State Implications
- **Unified Tags**: The `tags` field is entirely removed from the feed shards. `user-state.json` is the sole source of truth for all tags, whether applied manually or by an auto-tagging rule at ingestion.
- **Ingestion-Time Sparse Writes**: We will maintain the simple conceptual model: **any non-default state gets an entry.** If an auto-tag rule matches an article at ingestion, that article gets an entry in `user-state.json` containing those tags. Even if a user has broad auto-tag rules, the size is naturally bounded by the feed `maxItemsLimit`. When an auto-tagged article ages out and is pruned from the feed shard, its `user-state.json` entry is garbage-collected just like any other entry.
- **Rule Retroactivity**: For 2.0, auto-tags and manual tags remain indistinguishable in storage. Modifying an auto-tag rule only applies to newly ingested articles moving forward. (Tracking tag provenance could be a future fast-follow if retroactive rule updates are needed).

### UI Fallback & "Mark All Read"
- The UI layer will fall back to default values (`read: false`, `starred: false`, `tags: []`) for any GUID missing from `user-state.json`.
- "Mark all read" will simply iterate over currently unread items and add/update their entries in `user-state.json`. Items that are already at default state are left alone.

### Storage Version Schema
- The slim bootstrap pointer written to `.obsidian/.../data.json` will be updated to include `storageSchemaVersion: 2`. This allows a fresh mobile load to immediately know it should look for `vault-shards-v2` logic. Example: `{ metadataStorageMode, metadataStorageFolder, storageSchemaVersion: 2 }`.

## Proposed Changes

---

### Data Models & Schemas

#### [MODIFY] [types.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts)
- Update `FeedStorageMode` to include `"vault-shards-v2"`.
- Introduce `UserStateSchema` interface:
  ```typescript
  export interface ArticleUserState {
    read: boolean;
    starred: boolean;
    tags: Tag[];
  }

  export interface UserStateFile {
    version: number;
    states: Record<string, ArticleUserState>;
    _syncNonce?: string;
    _syncPad?: string;
  }
  ```
- Make `read`, `starred`, and `tags` strictly optional/absent on `FeedItem` when reading from the 2.0 shard (since they won't be saved there). They will be populated at runtime by merging the data from `user-state.json`. 

---

### Storage Service Updates

#### [MODIFY] [feed-storage-repository.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/feed-storage-repository.ts)
- **Lazy `user-state.json` Schema & Operations**:
  - Add methods `loadUserState()` and `saveUserState(states)`.
  - When persisting user state, apply `withSyncNonce()` so same-size-write sync tools don't skip the update.
  - Implement sparse state logic: when saving state, only emit entries where `read === true || starred === true || tags.length > 0`. Items that fall back to default state are omitted/deleted.
- **Migration logic (`migrateToVaultShardsV2`)**:
  - Add `migrateToVaultShardsV2()`. It will read existing feeds (either legacy or v1 shards).
  - Extract user state for any article that isn't default (`read: true`, `starred: true`, or `tags` not empty). **All tags, regardless of origin, move to `user-state.json` with no special casing.**
  - Write `user-state.json`.
  - Update mode to `"vault-shards-v2"` and write cleaned `feeds/{feedId}.json` shards (completely stripping `tags`, `read`, and `starred`).
- **Garbage Collection**:
  - Enhance the persistence logic to perform GC on `user-state.json`. During feed item pruning (or inside `persistSettings`), cross-reference the active GUIDs in all feeds against `user-state.json`. If a GUID in `user-state.json` doesn't exist in any feed anymore, delete it from the state record.

#### [MODIFY] [main.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/main.ts)
- **`loadSettings()` Updates**:
  - Extend the `wasNullLoad` check to also encompass `user-state.json`. If `data.json` or `user-state.json` is missing or indicates a clean install, avoid preemptive `saveSettings()` to prevent overwriting incoming sync data.
  - After loading `data.json`, if mode is `vault-shards-v2`, load `user-state.json`. Merge the state into the loaded feed items so the UI has immediate access to `item.read`, `item.starred`, and `item.tags`.
- **`getMetadataSaveCallback()` Updates**:
  - Update the slim bootstrap pointer written to `.obsidian/.../data.json` to include `storageSchemaVersion`. Example: `{ metadataStorageMode, metadataStorageFolder, storageSchemaVersion: 2 }`.
- **Save Hooks**:
  - In `updateArticle()` and `onArticleSaved()`, when an item's state changes, update the in-memory user state map and trigger a save of `user-state.json`. (Only save `user-state.json` to avoid unnecessary writes to `data.json` or shards).

---

### UI Settings

#### [MODIFY] [storage-settings-tab.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/settings/tabs/storage-settings-tab.ts)
- Add "Vault location (v2 — split user state)" to the storage mode dropdown.
- When selected, trigger a confirmation dialog: "This will migrate your storage to Shard Storage 2.0, separating user state from feed content. Proceed?"
- On confirm, call `migrateToVaultShardsV2()`.

---

## Bug Fixes & Refinements During Implementation

**1. Modal UI Logic for V2 Migration**
- **Issue**: Transitioning from `vault-shards` (v1) to `vault-shards-v2` caused the confirmation modal to display the "reverting to legacy JSON" text because the logic strictly checked if `currentMode === "legacy-json"` to determine if it was a forward migration.
- **Fix**: Updated `StorageTransitionModal` to route its UI based on `targetMode` instead, ensuring accurate dialogue prompts when upgrading directly from V1 to V2 shards.

**2. Migration Reversion & Boot Pointer Desync**
- **Issue**: After completing a migration to Shard Storage 2.0, restarting the app would revert the storage mode back to `vault-shards` 1.0. The `migrateToVaultShardsV2` function was using Obsidian's default `saveData(data)` API instead of the dual-write `getMetadataSaveCallback()`. This resulted in the full settings payload being written to the plugin directory, but the *boot pointer* was never updated to point to the new `vault-location`. On restart, the old boot pointer was read, and the app reverted.
- **Fix**: Replaced the `saveData(data)` closure in `main.ts` with `getMetadataSaveCallback()` during `migrateToVaultShardsV2` execution to ensure the boot pointer accurately stores `storageSchemaVersion: 2` and the correct vault location.

**3. Incomplete Schema Extraction (Data Loss)**
- **Issue**: The original sparse state schema for `ArticleUserState` only accounted for `read`, `starred`, and `tags`. Properties like `saved`, `savedFilePath`, and `playbackProgress` were stripped from the Shard files during migration but were not extracted into `user-state.json`. If a user migrated, these states were permanently lost from the shards and not persisted in the new architecture.
- **Fix**: Expanded the `ArticleUserState` interface in `types.ts` to include `saved`, `savedFilePath`, and `playbackProgress` as optional properties. Updated `saveUserStateFromFeeds` to extract them, `hydrateSettings` to merge them, and `createFeedShard` to correctly strip them from disk.

**4. Edit Feed Modal Storage Address Display**
- **Issue**: The "Local storage address" setting in the Edit Feed modal falsely indicated that the feed was "Stored in legacy data.json" when using `vault-shards-v2`. This occurred because the `getFeedLocalStorageAddress` method hardcoded the return mode as `"vault-shards"`, and the modal strictly checked `localStorageAddressResult.mode === "vault-shards"`.
- **Fix**: Updated `getFeedLocalStorageAddress` to return `settings.storageMode` dynamically, and updated `edit-feed-modal.ts` to display the "Stored in shard storage" text for any mode that is `!== "legacy-json"`.

## Verification Plan

### Automated Tests
- Run existing test suite to ensure `legacy-json` and `vault-shards` (v1) remain backwards compatible.
- Add unit tests for sparse `user-state.json` creation and garbage collection on item pruning.

### Manual Verification
- **Clean Install**: Install plugin, verify no empty `user-state.json` is written initially (honoring `wasNullLoad`).
- **Migration**: Start with 1.0 vault-shards. Select 2.0 from dropdown. Verify shards are cleaned of all tags and states, and `user-state.json` is created correctly with sync nonce padding.
- **Sparse State**: Star an item. Check `user-state.json` to ensure only that GUID is written. Unstar it, ensure it's removed.
- **Mark All Read**: Execute on a large feed. Ensure only newly modified items get added to `user-state.json`.
- **Auto-Tags**: Trigger a feed refresh that applies auto-tags. Verify the tags appear in `user-state.json` and are preserved across subsequent refreshes.
- **Sync Padding**: Verify that saving `user-state.json` updates `_syncNonce` and `_syncPad` each time.
