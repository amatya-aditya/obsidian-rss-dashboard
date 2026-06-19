# Auto-Deletion Mechanism

This document describes how the RSS Dashboard plugin handles automatic article deletion and data persistence as of 2.2.0-beta.6, March 16, 2026 (note: 2.2.0-beta.6 was mistagged as 2.3.0-alpha.2).

## 1. Data Persistence

The plugin supports three storage modes: **Legacy JSON**, **Vault Shards v1**, and **Vault Shards v2**. In all modes, feed items are manipulated in memory using the retention functions described in §2; the difference is where and how the resulting state is written to disk.

### 1.1 Legacy JSON (`data.json`)

- **Storage Location**: `.obsidian/plugins/obsidian-rss-dashboard/data.json`.
- **Mechanism**: The entire settings object (including all feed items) is loaded into memory when the plugin starts.
- **Deletion**: When items are deleted by retention rules, they are removed from the in-memory JavaScript array. The plugin then calls `saveSettings()`, which overwrites the `data.json` file with the updated data.
- **Note**: This mechanism replaced an experimental SQLite implementation (reverted in `2.2.0-beta.4`) to ensure better stability across different platforms (Windows, macOS, iOS, Android).

### 1.2 Shard Storage v1 (`vault-shards`)

- **Storage Location**: Per-feed `.json` files in a vault folder (default: `.rss-dashboard-data/feeds/`).
- **Mechanism**: Plugin metadata (feed definitions, settings, and last-refresh timestamps) is stored in `data.json`, but feed item history is moved to individual shard files. Feed IDs map to shard filenames (`<feedId>.json`).
- **State**: User state (read, starred, tags, saved, savedFilePath, playbackProgress) is embedded directly in each feed's shard alongside the items.
- **Write Path**: `applyFeedRetentionLimits()` runs against in-memory items, then `persistSettings()` writes each feed's updated items (with embedded state) back to its shard. The metadata file is saved without item arrays.

### 1.3 Shard Storage v2 (`vault-shards-v2`)

- **Storage Location**: Per-feed content-only `.json` shard files in a vault folder, plus a separate `user-state.json` in the metadata folder.
- **Mechanism**: The same shard file structure as v1, but user state is stripped from feed shards and mirrored to a dedicated state file.
- **State Separation**: Feed shards contain only article content and metadata; per-item interaction state is written to `<metadataFolder>/user-state.json`.
- **Metadata Schema**: Storage mode is forced to vault-location, and the metadata schema is upgraded to v2.
- **Write Path**: `applyFeedRetentionLimits()` modifies in-memory items. `persistSettings()` writes feed shards without user-state fields, then `saveUserStateFromFeeds()` writes the current user state to `user-state.json`.

## 2. Auto-Deletion Logic

The core logic for automatic item removal is implemented in `applyFeedRetentionLimits()` (within `src/services/feed-parser.ts`).

### A. Time-based Cleanup (Auto-delete duration)

This removes old, read articles to prevent the database from growing indefinitely.

- **Trigger**: Every feed refresh and the `Apply feed limits to all feeds` command.
- **Criteria**:
  - **Read State**: Only articles marked as **Read** are eligible for time-based deletion.
  - **Age**: The article's `pubDate` must be older than the configured `autoDeleteDuration` (in days).
- **Protection**: Articles that are **Starred** or **Saved** are explicitly exempt from this cleanup.

### B. Count-based Cleanup (Max item limit)

This enforces a hard cap on the number of non-protected articles per feed.

- **Criteria**:
  - It keeps the newest $N$ items (where $N$ is the `maxItemsLimit`).
  - It calculates this limit only on **non-protected** items.
- **Protection**: **Starred** and **Saved** articles do not count towards this limit and are never removed by it.

## 3. Article Retention ("Carrying Forward")

The plugin is designed to retain articles even if they are no longer present in the source RSS feed XML.

- **Logic**: During a refresh, the `mergeFeedHistoryItems()` function identifies existing items that are missing from the latest XML fetch and "carries them forward" into the new feed state.
- **Persistence**: These items remain in storage (shard files in shard modes, `user-state.json` state for v2, `data.json` in legacy mode) unless they are manually deleted or caught by the auto-deletion criteria described above.

## 4. How Retention Applies Across Storage Modes

- The in-memory retention functions run identically regardless of storage mode.
- In **Legacy JSON**, the surviving items are serialized into `data.json`.
- In **Shard Storage v1**, the surviving items (with embedded user state) are written back to each feed's shard file.
- In **Shard Storage v2**, the surviving feed items are written without user-state fields to shard files, and the current per-item read/starred/saved/tags/playback state is extracted and written to `user-state.json`.
- Carried-forward items that survive retention remain in the appropriate store and can still be matched to refetched GUIDs on subsequent refreshes.

## 5. Summary Table

| Article State       | Time-based Deletion | Max Item Limit               |
| :------------------ | :------------------ | :--------------------------- |
| **Unread**          | 🟢 Kept             | 🔴 Deleted (if beyond limit) |
| **Read**            | 🔴 Deleted          | 🔴 Deleted                   |
| **Starred / Saved** | 🟢 Always Kept      | 🟢 Always Kept               |
