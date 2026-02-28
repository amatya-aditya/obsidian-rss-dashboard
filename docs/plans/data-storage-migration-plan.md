# Data Storage Migration Plan (`data.json` Split)

## Objective

Reduce `data.json` size and write amplification by separating heavy article payload data from user settings/configuration, while preserving backward compatibility and avoiding data loss.

## Why This Migration Is Needed

- Current storage model persists settings and full article payloads in one file (`data.json`).
- Current write path saves the full settings object via `saveData(this.settings)` in `saveSettings()`.
- Article actions (read/starred/tags/saved) trigger frequent writes, so a large payload is repeatedly rewritten.
- Current local sample is already large (~4.46 MB, 907 items, one feed with 777 items).

## Scope

- In scope:
  - Storage schema split.
  - Backward-compatible migration from legacy single-file format.
  - Read/write abstractions for new storage layout.
  - Recovery/rollback strategy.
- Out of scope:
  - UI changes.
  - Feed parsing logic changes unrelated to persistence.

## Target Storage Layout

### 1) `data.json` (small, durable settings/config)

- Keep:
  - User settings (`display`, `media`, `articleSaving`, pagination, sidebar state, folders, sort orders).
  - Feed metadata (`title`, `url`, `folder`, limits, filters, mediaType, scan settings, icon).
  - Storage version marker.
- Remove:
  - Large per-item payload fields (`description`, `content`, long summaries, media metadata blobs).

### 2) Plugin cache directory (heavy data)

- Path: `.obsidian/plugins/rss-dashboard/cache/feeds/<feedHash>.json`
- Contents per feed:
  - Article payload list keyed by GUID.
  - Mutable state fields (read/starred/tags/saved/savedFilePath) for the same GUIDs.
  - Last cache update timestamp and schema version.

This sharded per-feed cache avoids writing unrelated feed payloads when one feed changes.

## Versioning Strategy

- Introduce `storageVersion` in persisted settings:
  - `1` (or missing): legacy monolithic format.
  - `2`: split storage format.

## Implementation Plan

## Phase 0: Preparation

1. Add new persisted types (V2) in `src/types/types.ts`:
   - `PersistedSettingsV2`
   - `FeedCacheRecord`
2. Add storage constants:
   - `STORAGE_VERSION = 2`
   - Cache root path constants.
3. Add a storage service module:
   - Suggested file: `src/services/storage-service.ts`
   - Responsibility: all read/write/migration logic.

## Phase 1: Read Path (Backward Compatible)

1. On plugin load:
   - Read `data.json`.
   - If `storageVersion >= 2`, hydrate runtime `this.settings.feeds[].items` from per-feed cache files.
   - If legacy format, load as-is (no migration yet in this phase).
2. Keep runtime model unchanged (`this.settings` still contains `feeds[].items`) to avoid broad UI refactors.

## Phase 2: Write Path Split

1. Replace direct `saveData(this.settings)` writes with storage service:
   - `saveSettingsOnly()` for config/metadata.
   - `saveFeedCache(feedUrl)` for feed item changes.
2. Update high-frequency action paths to avoid full writes:
   - Article read/star/tag/saved changes should write only affected feed cache file.
3. Keep `saveSettings()` as compatibility wrapper initially, but route internally through new service.

## Phase 3: Migration (Legacy -> V2)

1. Detect legacy on load (`storageVersion` missing or `feeds[].items` present in persisted data).
2. Pre-migration backup:
   - Write backup file: `.obsidian/plugins/rss-dashboard/cache/migration-backup-<timestamp>.json`.
3. For each feed:
   - Extract items to `cache/feeds/<hash>.json`.
   - Keep feed metadata in `data.json`.
4. Write new `data.json` with `storageVersion: 2`.
5. Validate migration:
   - Feed count unchanged.
   - Total item count unchanged.
   - Random feed sample GUID checks pass.
6. If validation fails:
   - Restore from backup and continue running in legacy mode.

## Phase 4: Hardening

1. Add write queue to serialize writes and avoid race conditions.
2. Add debounce for bursts of article-state updates.
3. Add stale cache handling:
   - Missing feed cache file -> treat as empty and log warning.
4. Add cache cleanup for deleted feeds.

## File-Level Change Plan

- `main.ts`
  - Replace load/save internals with storage service calls.
  - Trigger migration after successful load of legacy settings.
- `src/types/types.ts`
  - Add persisted V2 types and storage version types.
- `src/services/storage-service.ts` (new)
  - Read/write/migration helpers and validation.
- Optional utilities:
  - `src/utils/hash.ts` for deterministic feed filename hashing.

## Data Integrity Rules

- Never delete legacy payload before new cache writes and validation succeed.
- Writes should be atomic where possible:
  - Write temp file, then replace target.
- On read failure of a single cache shard:
  - Keep plugin operational and surface a warning notice.

## Testing Plan

### Automated

1. Migration test:
   - Legacy fixture -> V2 output.
   - Assert equal feed/item counts and GUID preservation.
2. Persistence tests:
   - Article read/star toggles update only target feed cache shard.
3. Recovery test:
   - Simulated failed write restores from backup and no data loss.

### Manual

1. Open plugin with large legacy `data.json`.
2. Confirm first-run migration completes.
3. Toggle read/star/tags repeatedly and confirm performance improves.
4. Restart Obsidian and verify all state persists.

## Rollout Strategy

1. Ship V2 read support first (safe no-op for existing users).
2. Enable migration behind a feature flag for one release.
3. Enable by default after verification.
4. Keep legacy read path for at least 2 releases before optional removal.

## Acceptance Criteria

- `data.json` no longer stores full article payloads.
- Existing users migrate automatically without losing article state.
- Frequent article actions no longer rewrite large monolithic payloads.
- Plugin remains usable if a cache shard is missing/corrupted.
