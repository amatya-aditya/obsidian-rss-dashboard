# Auto-Deletion Mechanism

This document describes how the RSS Dashboard plugin handles automatic article deletion and data persistence as of 2.2.0-beta.6, March 16, 2026 (note: 2.2.0-beta.6 wasmistagged as 2.3.0-alpha.2).

## 1. Data Persistence (`data.json`)

The plugin uses Obsidian's standard `data.json` for storage.

- **Storage Location**: `.obsidian/plugins/obsidian-rss-dashboard/data.json`.
- **Mechanism**: The entire settings object (including all feed items) is loaded into memory when the plugin starts.
- **Deletion**: When items are deleted, they are removed from the in-memory JavaScript array. The plugin then calls `saveSettings()`, which overwrites the `data.json` file with the updated data.
- **Note**: This mechanism replaced an experimental SQLite implementation (reverted in `2.2.0-beta.4`) to ensure better stability across different platforms (Windows, macOS, iOS, Android).

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
- **Persistence**: These items remain in `data.json` unless they are manually deleted or caught by the auto-deletion criteria described above.

## 4. Summary Table

| Article State       | Time-based Deletion | Max Item Limit               |
| :------------------ | :------------------ | :--------------------------- |
| **Unread**          | 🟢 Kept             | 🔴 Deleted (if beyond limit) |
| **Read**            | 🔴 Deleted          | 🔴 Deleted                   |
| **Starred / Saved** | 🟢 Always Kept      | 🟢 Always Kept               |
