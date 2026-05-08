# Feed Data Lifecycle: Fetch, Merge, Retention, and Persistence

Traces the full journey of a feed item — from the first remote fetch through local merge, retention pruning, disk persistence, and dashboard display. Covers what is actually stored, when items are permanently deleted vs. visually filtered, and how retention setting changes affect stored data.

---

## 1. The Full Lifecycle at a Glance

```
Remote RSS/Atom feed (XML)
        │
        ▼
  ┌─────────────┐
  │    FETCH    │  HTTP request to the feed URL
  └──────┬──────┘
         │  raw XML text
         ▼
  ┌─────────────┐
  │    PARSE    │  Extract title, guid, pubDate, content, media type…
  └──────┬──────┘
         │  new FeedItem[]
         ▼
  ┌──────────────────────────────────────────────────┐
  │                    MERGE                         │
  │                                                  │
  │  new items  ──────────────────────────► merged   │
  │                                          list    │
  │  existing items not in new fetch                 │
  │  (carry-forward) ──────────────────────►         │
  └──────────────────────┬───────────────────────────┘
                         │  combined FeedItem[]
                         ▼
  ┌──────────────────────────────────────────────────┐
  │            RETENTION PASS 1 (inline)             │
  │                                                  │
  │  Carry-forward candidates are pre-filtered:      │
  │  drop unprotected items older than cutoff        │
  │  before they enter the merged list               │
  └──────────────────────┬───────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────┐
  │            RETENTION PASS 2 (applyFeedLimits)    │
  │                                                  │
  │  Time-based:  drop read items older than cutoff  │
  │  Count-based: drop oldest non-protected items    │
  │               beyond the max-items limit         │
  │                                                  │
  │  Protected (starred / saved) → always kept       │
  └──────────────────────┬───────────────────────────┘
                         │  trimmed FeedItem[]
                         ▼
  ┌─────────────┐
  │   PERSIST   │  saveSettings() → data.json
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │   DISPLAY   │  Dashboard reads from in-memory settings;
  │             │  view filters (unread / starred / folder…)
  │             │  are applied on top — no additional items
  │             │  are deleted at display time
  └─────────────┘
```

Key point: **retention happens before the write to disk**, not at display time. Items removed by retention are gone from `data.json` after the next save.

---

## 2. Storage

The plugin saves its entire settings object to `.obsidian/plugins/obsidian-rss-dashboard/data.json`. This includes:

- All feed configuration (URL, folder, per-feed retention settings, scan interval, keyword rules, etc.)
- All article items (`FeedItem[]`) for every feed
- Global plugin settings (display preferences, tag definitions, highlight words, sidebar state, icon ordering, etc.)

Not stored: raw RSS/XML documents. There is no hidden local XML archive.

- On startup: the entire settings object is loaded into memory.
- On every save: `saveSettings()` overwrites `data.json` with the full current in-memory state.
- Single-feed refresh: saves immediately after that feed's merge + retention step.
- Multi-feed batch refresh: one save at the end of the entire batch, not per-feed.

> SQLite was trialled in 2.2.0-beta.2 and reverted in 2.2.0-beta.4 for cross-platform stability. JSON has been the sole persistence mechanism since then.

---

## 3. Fetch and Parse

Each refresh cycle:

1. Sends an HTTP request to the feed URL.
2. Parses the raw XML into structured `FeedItem` objects (title, guid, pubDate, content, media type, cover image, etc.).
3. Passes the parsed items into the merge step.

Feeds with `excludeFromRefresh: true` are skipped by bulk and auto-refresh. They can still be refreshed manually. Per-feed `scanInterval` overrides can also exclude a feed from a given bulk refresh cycle.

---

## 4. Merge and Carry-Forward

The merge step combines two sources:

| Source                    | What it contains                                               |
| :------------------------ | :------------------------------------------------------------- |
| **Freshly fetched items** | Whatever the remote feed returned this cycle                   |
| **Carried-forward items** | Existing locally-stored items that were absent from this fetch |

Carry-forward exists so local history is not wiped every time a feed server stops returning older items. The local list accumulates over time — up to the retention limits.

The merge actually has three distinct paths, not two:

```
For each item guid seen in this refresh:
        │
        ├── exists locally? ─────────────────────────────────────────────────┐
        │                                                                     │
        │   YES: build updatedItem as { ...existingItem, ...freshFields }    │
        │        Fresh content fields (title, description, content,          │
        │        pubDate, coverImage, etc.) are taken from the remote.       │
        │        Local state fields (read, starred, saved, tags,             │
        │        savedFilePath) are preserved from existingItem.             │
        │        → goes into updatedItems[]                                  │
        │                                                                     │
        │   NO:  brand-new item — read:false, starred:false, tags:[]         │
        │        → goes into newItems[]                              ◄───────┘
        │
        └── (after iterating all fetched items)

For each existing local item NOT seen in this refresh:
        │
        ├── older than autoDeleteCutoff AND unprotected? ──► skip (pre-filter)
        │
        └── otherwise ──► carry forward unchanged into carriedForward[]

Final merged list = [...carriedForward, ...updatedItems, ...newItems]
```

Key implication: refreshing a feed **does not reset read state, tags, or starred status**. Those fields are always taken from the locally-stored version when the item matches by guid.

---

## 5. Retention Rules

Retention runs in two passes during `parseFeed`, both before the write to disk.

**Pass 1 (inline, during carry-forward assembly):** Unprotected carry-forward candidates older than `autoDeleteCutoffMs` are dropped before they enter the merged list at all. This prevents old items from reappearing as unread when a duration is re-enabled after being disabled.

**Pass 2 (`applyFeedLimits`):** Runs `applyFeedRetentionLimits()` on the fully merged list, applying both time-based and count-based rules.

The two passes are separate functions with independent logic. Pass 1 only applies the time-based cutoff to carry-forward items. Pass 2 applies both rules to all items.

### 5a. Time-Based Cleanup (Auto-Delete Duration)

Removes old, read articles so the feed does not grow indefinitely.

- **When it runs**: every feed refresh; also the "Apply feed limits to all feeds" command.
- **What it removes**: articles that are all of — read, older than the cutoff, and not starred/saved.
- **Unread articles are never removed** by this rule, regardless of age.
- **Tagged-only articles are not protected.** Having tags does not make an item exempt. A read, out-of-window article with tags is removed exactly like one without tags.

```
For each article in merged list:
        │
        ├── starred or saved? ──────────────────────► KEEP
        │
        ├── unread? ────────────────────────────────► KEEP
        │
        ├── pubDate within cutoff window? ──────────► KEEP
        │
        └── read + older than cutoff + unprotected ► REMOVE
```

### 5b. Count-Based Cleanup (Max Items Limit)

Enforces a hard cap on the number of non-protected articles per feed.

- Keeps the newest N non-protected items (N = `maxItemsLimit`).
- Protected items (starred / saved) are excluded from the count and never removed.
- Unread articles **can** be removed if they are old enough to fall outside the newest N.
- **Tagged-only articles are not protected.** Tags do not affect the count or exempt an item from the limit.

```
Non-protected items sorted newest → oldest:
  [1] [2] [3] … [N]  ← kept
  [N+1] [N+2] …      ← removed

Protected items: always appended, never counted
```

### 5c. What Counts as "Protected"?

Protection is determined solely by `isProtectedItem()`, which checks two fields:

```ts
function isProtectedItem(item: FeedItem): boolean {
  return !!item.saved || !!item.starred;
}
```

**Tags are not a protection qualifier.** An article that is tagged but not starred and not saved is treated identically to an untagged article by both retention passes. It can be removed by the time-based rule (if read and out-of-window) or by the count-based rule (if it falls beyond the max-items limit).

If you want tagged articles to survive retention, you must also star or save them.

### 5d. Retention Summary

| Article State                 | Time-Based Deletion    | Max Items Limit            |
| :---------------------------- | :--------------------- | :------------------------- |
| **Unread**                    | 🟢 Always kept         | 🔴 Removed if beyond limit |
| **Read**                      | 🔴 Removed if past age | 🔴 Removed if beyond limit |
| **Tagged only** (not ★ or 💾) | 🔴 Same as above       | 🔴 Same as above           |
| **Starred**                   | 🟢 Always kept         | 🟢 Always kept             |
| **Saved**                     | 🟢 Always kept         | 🟢 Always kept             |
| **Starred + Saved**           | 🟢 Always kept         | 🟢 Always kept             |

---

## 6. Display and View Filters

The dashboard reads articles from the in-memory settings object (which mirrors `data.json`). View filters — unread, read, starred, saved, folder, tags — are applied at render time to decide which articles to show.

View filters are **not** retention. They do not remove articles from storage. An article hidden by the unread filter is still in `data.json`; switching the filter back reveals it.

```
data.json (all stored articles)
        │
        ▼
  in-memory settings
        │
        ├── view filter: unread  ──► show only !item.read
        ├── view filter: starred ──► show only item.starred
        ├── folder scope         ──► show only feeds in folder
        └── tag filters          ──► show only matching tags

Articles not matching the filter are hidden, not deleted.
```

---

## 7. If I Change the Auto-Delete Setting, What Happens?

The answer depends on _where_ you change the setting.

### Per-Feed Auto-Delete Duration (Edit Feed modal)

When you change `autoDeleteDuration` in the Edit Feed modal and click **Save**, the plugin:

1. Writes the new value to the in-memory feed object and saves to `data.json`.
2. **Immediately triggers a single-feed refresh** (`refreshSelectedFeed`) — the full fetch + merge + retention pipeline runs right away.

The new cutoff is enforced before you close the modal. You do not need to wait for the next scheduled refresh.

### Global Default Auto-Delete Duration (Settings tab)

Changing `defaultAutoDeleteDuration` in the plugin settings tab saves the new value to `data.json` but does **not** trigger any refresh. The new default is used the next time each feed refreshes, or immediately if you run the **"Apply feed limits to all feeds"** command.

### Tightening (e.g. 90 days → 30 days) or Re-enabling

Retention re-runs with the new cutoff. Articles that now fall outside the window are removed and the trimmed list is saved to `data.json`. For per-feed changes this happens immediately on save; for global changes it happens on the next refresh.

### Loosening (e.g. 30 days → 90 days) or Disabling

The setting change alone does not restore any articles. Articles that were already pruned from `data.json` are gone. On the next refresh, the plugin will carry forward whatever is still in local storage and will no longer remove items that are now within the wider window — but nothing is un-deleted.

Old articles only reappear if:

- The remote feed still publishes them and returns them on the next fetch, **or**
- They were still present in `data.json` when the setting was changed (i.e. they had not yet been pruned).

---

## 8. Implementation Reference

| Concern                             | Location                                                                             |
| :---------------------------------- | :----------------------------------------------------------------------------------- |
| Merge (all three paths)             | `parseFeed()` — `src/services/feed-parser.ts`                                        |
| Carry-forward pre-filter (pass 1)   | inline inside `parseFeed()` — `src/services/feed-parser.ts`                          |
| Final dedup + concat                | `mergeFeedHistoryItems()` — `src/services/feed-parser.ts`                            |
| Retention pass 2                    | `applyFeedRetentionLimits()` via `applyFeedLimits()` — `src/services/feed-parser.ts` |
| Refresh orchestration (single feed) | `refreshSingleFeed()` — `main.ts`                                                    |
| Refresh orchestration (batch)       | `refreshFeedBatch()` — `main.ts`                                                     |
| Exclude from refresh                | `getRefreshableFeeds()` — `main.ts`                                                  |
| Persist to disk                     | `saveSettings()` → `this.saveData(this.settings)` — `main.ts`                        |
| View filter application             | `getFilteredArticles()` / `getUnfilteredArticles()` — `src/views/dashboard-view.ts`  |
