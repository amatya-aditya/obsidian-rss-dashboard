# Refresh Regression: New Items Hidden + History Collapsing to “Latest N”

This document explains a pair of refresh-related regressions that presented as:

1) Users click **Refresh** and the fetch succeeds, but **new articles don’t appear** (until the feed is deleted and re-added).
2) A feed configured with **Max items limit > 25** still “sticks” around ~25 items over time, because **older cached history disappears after refresh**.

Both issues were caused by a combination of (a) a broken refresh merge, (b) incorrect retention behavior, and (c) view-layer slicing applied too early.

## Symptoms

### A) “Refresh works, but I don’t see new items”
- Refresh network/parsing completes without error.
- The feed appears unchanged (no new unread entries).
- Deleting and re-adding the feed suddenly shows the latest items again.

### B) “Max items limit > 25 doesn’t work”
- The user sets a per-feed `maxItemsLimit` to e.g. 50/100.
- After refreshes, the feed history collapses back toward the server’s “latest N” window (often ~20–30, frequently ~25).
- Items beyond that window are either **gone** (history loss) or effectively **unreachable** (view-limited to the front of an unsorted list).

## Root Causes

### 1) Refresh merge dropped cached history outside the server’s “latest N”
Most RSS/Atom feeds only publish the newest N entries. A correct refresh must:
- update existing entries that are still present in the feed payload,
- add newly discovered entries, and
- **preserve cached entries that the server no longer includes** (until an explicit retention policy removes them).

Previously, `FeedParser.parseFeed()` rebuilt `feed.items` mostly from the refreshed payload (`updatedItems` + `newItems`), but the carry-forward logic intended to keep older cached entries was incorrect. In practice, this caused older items to be lost on refresh, collapsing history toward the server window size.

### 2) Retention logic prioritized “keep read history” and could drop all unread
The prior “apply feed limits” implementation effectively did:
- keep **all read items** first, then
- keep only as many unread items as “fit” in the remaining budget.

This has a pathological case when `readItems.length >= maxItemsLimit`: the unread budget becomes 0, so **all unread items (including newly fetched) get dropped**. That perfectly matches “refresh succeeds but new items don’t show” once a user accumulates enough read entries.

It also never trimmed read items down to the limit, meaning the feed could remain dominated by read history and stay out-of-order.

### 3) View-layer slicing happened before filtering/sorting
In the single-feed view, the dashboard previously took `items.slice(0, limit)` *before* keyword/status filters and *before* sorting by publish date. When the underlying `items` array order was unfavorable (e.g., read items first, or new items appended later), slicing early could permanently exclude newly fetched items from consideration.

Even if new items existed in `feed.items`, they could be “hidden” simply by being outside the initial slice window.

### 4) (Related correctness) `0` (“Unlimited”) should not be treated as “falsy”
Several call sites used `||` to fall back to a default limit. That pattern turns `0` into “use default”, which breaks the common convention of `0` meaning “unlimited”.

While not the main cause of the ~25 collapse, this was corrected as part of making max-items semantics consistent.

## Fixes Implemented

### 1) Preserve cached history during refresh merges
We now explicitly merge refreshed items with previously cached items that fell out of the server window:

- `mergeFeedHistoryItems(existingItems, refreshedItems)` (exported, testable) in `src/services/feed-parser.ts`
  - keys items by `guid` (fallback to `link`),
  - de-duplicates refreshed payload items, and
  - carries forward cached items not present in the refreshed set.

`FeedParser.parseFeed()` uses this merge so a refresh cannot implicitly delete older cached entries just because the server didn’t include them this time.

### 2) Replace retention with deterministic, newest-first behavior
We replaced the read-first trimming with a single deterministic helper:

- `applyFeedRetentionLimits(feed, { nowMs })` in `src/services/feed-parser.ts`

Policy:
- **Protected items:** `saved === true` or `starred === true` are never removed by max-items or auto-delete.
- **Auto-delete:** removes **read-only** items older than the cutoff (keeps unread; keeps protected).
- **Max items:** keeps the newest **non-protected** items up to `maxItemsLimit`. Protected items **do not count** toward the cap (so totals may exceed the limit in edge cases with many protected items).
- Always sorts `feed.items` newest-first for predictable UI and persistence.

This helper is used by:
- `FeedParser.applyFeedLimits()` (refresh path), and
- `RssDashboardPlugin.applyFeedLimitsToAllFeeds()` in `main.ts` (manual “apply limits” path),
so both code paths behave identically.

### 3) Apply the per-feed display limit after filtering/sorting
In `src/views/dashboard-view.ts`, the single-feed path no longer slices early. The dashboard now:
1) collects items,
2) applies keyword/status/age filters,
3) sorts according to `articleSort`,
4) then applies the per-feed display limit.

This prevents newly fetched items from being excluded solely due to array order.

### 4) Preserve `0` semantics for limits
Where appropriate, `||` fallbacks were replaced with nullish/explicit checks so `0` is treated as an intentional value.

## Why This Fix Is Correct

- It restores the expected invariants for feed refresh:
  - refresh should not delete history unless retention explicitly says so,
  - retention should be stable, deterministic, and aligned with user expectations (“keep newest”),
  - view limiting should operate on the *sorted/filtered* set, not on an arbitrary slice of the underlying array.
- It eliminates the two failure modes that forced “delete + re-add” as a workaround:
  - read-history crowding out new items,
  - refresh merge dropping cached items outside the server window.

## Tests Added

Unit tests were added in `test_files/unit/feed-parser.test.ts` to cover:
- History merge preserves cached items outside the server’s latest window.
- `maxItemsLimit > 25` persists across repeated refresh cycles (does not collapse back to ~25).
- Retention behavior (newest-first, protect saved/starred, read-only auto-delete).

Run: `npm run test:unit`

## Notes / Constraints

- Increasing `maxItemsLimit` **cannot** fetch older items the server never returns; it only prevents the plugin from deleting items it already cached over time.
- For feeds that *only* ever publish ~25 entries, you will still see ~25 immediately after adding the feed; the benefit is that history no longer collapses on subsequent refreshes once you’ve accumulated more cached items.
