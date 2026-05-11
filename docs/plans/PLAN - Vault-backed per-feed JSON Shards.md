# Vault-Backed Per-Feed JSON Shards With Mobile-Safe Fallback

## Purpose
This document is the current implementation handoff for the vault-shard storage feature. It replaces the earlier proposal-only plan with the feature's actual shipped state, known bugs, debugging hooks, and next steps for a new context window.

The original goal remains the same:
- reduce monolithic `data.json` writes for users with many feeds
- keep bulky feed/article history in normal vault files instead of only inside the hidden plugin folder
- preserve one authoritative storage path at runtime
- improve cross-device portability for users syncing via third-party tools, especially when iOS does not expose `.obsidian/plugins/.../data.json` conveniently

## Current Feature State
The feature has been partially implemented and is available in the plugin UI as an opt-in experimental storage mode.

Implemented:
- `legacy-json` and `vault-shards` storage modes
- per-feed `feedId` persistence
- `FeedStorageRepository` storage abstraction
- per-feed JSON shard persistence in a user-chosen vault folder
- runtime hydration so `Feed.items` still exists in memory regardless of storage mode
- migration path from legacy `data.json` to shard files
- repair/rebuild path for shard files
- revert path from shard storage back to legacy JSON
- shard data import/export support for desktop/mobile workflows
- General tab storage controls
- responsive stacking for storage action buttons on smaller screens

Partially implemented or still incomplete:
- comprehensive automated test verification in-repo
- markdown mirror fallback mode
- hardening around all migration edge cases

## Implemented Architecture

### Control Plane
`data.json` still stores:
- global settings
- folders
- tags
- feed configuration/metadata
- storage settings
- per-feed `feedId`

When shard mode is active, persisted feed metadata intentionally excludes `items`.

### Data Plane
Feed/article history is stored as one JSON file per feed in a vault folder:
- default folder: `.rss-dashboard-data/feeds`
- file name: `{feedId}.json`
- shard shape:

```json
{
  "version": 1,
  "feedId": "stable-id",
  "feedUrl": "https://example.com/feed.xml",
  "updatedAt": 1710000000000,
  "items": []
}
```

### Runtime Contract
Views and services still work against hydrated in-memory `Feed.items`. They should not need to know whether data came from monolithic legacy JSON or shard files.

## Implemented Files
Primary implementation lives in:
- [main.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/main.ts)
- [src/services/feed-storage-repository.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/feed-storage-repository.ts)
- [src/types/types.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts)
- [src/settings/tabs/general-settings-tab.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/settings/tabs/general-settings-tab.ts)
- [src/services/import-export-service.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/import-export-service.ts)
- [src/services/backup-service.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/backup-service.ts)
- [src/styles/settings.css](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/styles/settings.css)

Related test files that were added or updated:
- [test_files/unit/services/feed-storage-repository.test.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/services/feed-storage-repository.test.ts)
- [test_files/unit/settings/storage-settings-general-tab.test.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/settings/storage-settings-general-tab.test.ts)
- [test_files/unit/services/import-export-service.test.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/services/import-export-service.test.ts)
- [test_files/unit/services/backup-service.test.ts](/c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/services/backup-service.test.ts)

## Settings UI State
Storage controls are in the General tab under `Storage (experimental)`.

Current controls:
- `Storage mode`
- `Storage folder`
- `Storage status`
- `Migrate to vault storage`
- `Repair/Rebuild storage`
- `Import shard data`
- `Export shard data`

Recent UI improvements:
- action buttons now stack vertically on smaller screens instead of staying in one horizontal row
- storage actions have dedicated responsive CSS

## Logging Note
Storage-feature console debugging has been removed to reduce noise in the Obsidian developer console.

Current behavior:
- storage failures still surface through user-facing notices
- repository/service error handling still throws targeted errors for settings and UI flows to handle

## Known Bug: Migration Fails With "Folder Already Exists"

### User-Observed Behavior
When switching from `legacy-json` to `vault-shards` and clicking migrate, the plugin shows a toast like:

`Vault migration failed: folder already exists`

The user also reported that switching modes previously felt like "nothing happened," which is why this flow was hardened and made explicit in the settings actions.

### Confirmed Causes
The failure comes from two implementation issues that compound each other:

- `ensureStorageFolderExists()` was not hardened as an idempotent folder-creation path
- the settings flow could flip `storageMode` before migration had actually completed

That combination allowed migration to fail on an already-existing folder while also risking a half-switched in-memory state.

### Expected Correct Behavior
Migration should treat an already-existing configured shard folder as valid and continue.

Desired behavior:
- if folder exists and is a folder: continue without error
- if folder does not exist: create it
- if path exists but is a file: fail clearly with a targeted notice/error

### Implemented Fix Rules
`ensureStorageFolderExists()` now needs to behave as an idempotent guard for migration and repair:

- normalize the folder path once
- check `getAbstractFileByPath(normalizedFolder)`
- if `null`, create the folder
- if `TFolder`, return success
- if `TFile`, throw a specific error explaining that the configured storage path points to a file
- if `createFolder()` throws "folder already exists", re-check the path and continue only if it now resolves to a folder

The settings flow should also treat mode changes as explicit actions:

- the storage mode dropdown is display/intent only and does not execute migration
- legacy -> shards runs only from `Migrate to vault storage`
- shards -> legacy runs only from an explicit revert action
- failed migration leaves `storageMode` on `legacy-json`

## Other Known Behavior Notes

### Revert Cleanup
There was an earlier bug where switching from shard storage back to legacy JSON did not remove shard files.

This was implemented afterward:
- reverting to legacy JSON now deletes shard `.json` files in the configured shard folder
- this cleanup happens on the explicit revert path

Note:
- leftover shard files from before that fix may still exist in user vaults until they re-run the mode switch or clean manually

### Mobile / Cross-Device Constraint Still Applies
The feature helps by moving bulk feed/article data into a normal vault path, but `data.json` still matters for settings and metadata.

This means:
- portability is improved, not fully solved
- the markdown-based visible-vault fallback is still a valid future direction if user workflows remain awkward

## Data Model State
Implemented settings fields:
- `storageMode: "legacy-json" | "vault-shards"`
- `storageFolder: string`
- `storageSchemaVersion: number`

Implemented persisted type additions:
- `feedId` on feeds
- `FeedItemsShard`
- `PersistedFeedConfig`
- `PersistedRssDashboardSettings`
- `PortableDataBundle`

## Current Migration / Rebuild Flow

### Migration to Vault Shards
Current intended flow:
1. ensure stable `feedId` values exist
2. normalize shard folder
3. ensure shard folder exists
4. write one shard per feed
5. save metadata to `data.json` without `items`
6. refresh services/views/settings UI

### Repair/Rebuild
Current intended flow:
1. normalize storage folder
2. force rewrite all shard files
3. force metadata save
4. update storage status

### Revert to Legacy JSON
Current intended flow:
1. delete shard JSON files in configured storage folder
2. switch mode to `legacy-json`
3. save full legacy settings back to `data.json`
4. refresh services/views/settings UI

## Testing Status
Targeted tests were added for repository/settings/import-export/backup pieces, but repo-wide unit testing is not currently trustworthy in this environment.

Known issue:
- `npm run test:unit` fails before meaningful execution because of a Vitest runner/config issue
- this appears to be an existing repo/environment problem rather than a storage-feature-only problem

Most recent reliable verification:
- `npm run build` passes

## Immediate Next Steps
1. Fix the `folder already exists` migration bug in `FeedStorageRepository.ensureStorageFolderExists()`.
2. Re-test mode switch from `legacy-json` to `vault-shards` with an already-existing shard folder.
3. Verify migration actually writes shard files and updates `data.json` metadata shape.
4. Re-test revert from shards back to legacy JSON and confirm cleanup still works.
5. Confirm General tab status text updates correctly after successful migration/revert.
6. Keep targeted unit tests for storage transitions and shard import/export flows stable in CI.

## Recommended Verification Procedure
Use this flow to validate storage behavior without relying on console debug logs:
1. Go to `Settings -> Community plugins -> RSS Dashboard -> General`.
2. Set storage mode to `Experimental vault shards`.
3. Click `Migrate to vault storage`.
4. Confirm shard files are created in the configured storage folder.
5. Confirm metadata in plugin data is persisted without embedded `items` when shard mode is active.
6. Trigger `Import shard data` and verify restored feeds + item history appear correctly.
7. Revert to `legacy-json` and verify expected cleanup behavior.

## Future Direction: Markdown Fallback
This is not implemented yet, but it should remain architecturally possible.

If JSON shards plus portable bundle workflows still do not adequately solve cross-device usability, the next storage evolution should be:
- a vault-visible Markdown mirror mode
- conventional folder structure inside the vault
- portability-first design

That future work should reuse the repository abstraction rather than bypassing it.
