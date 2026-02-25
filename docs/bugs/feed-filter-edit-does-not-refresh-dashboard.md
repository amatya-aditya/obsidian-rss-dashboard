# Bug Report: Feed Filter Edit Does Not Refresh Dashboard Immediately

## Issue Summary

When editing per-feed filters in the `Edit feed` modal and clicking `Save`, the user sees `Feed updated`, but the dashboard DOM does not immediately reflect the new filter result set. The updated filtering only appears after leaving/reopening the view (or otherwise forcing a stronger reload path).

## Expected Behavior

- Editing feed filters in `Edit feed` modal should immediately update the currently visible dashboard article list.
- No manual navigation/reopen should be required.

## Current Behavior

- Save confirmation notice appears.
- Settings are persisted.
- Immediate visible DOM/article list update is inconsistent or missing.

## Scope

- `EditFeedModal` save flow.
- Dashboard view when currently focused on a feed or scope affected by that feed's filter rules.

## Attempted Fixes So Far

### Attempt 1: Refresh Dashboard After Modal Save

Implemented in [src/modals/feed-manager-modal.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/modals/feed-manager-modal.ts).

- After `await this.plugin.saveSettings();`, called dashboard refresh (initially via active view lookup).
- Result: did not reliably update visible DOM in all layouts.

### Attempt 2: Refresh All Dashboard Leaves

Implemented in [main.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/main.ts) with `refreshDashboardViews()`, then invoked from edit modal save flow.

- Iterates all `RSS_DASHBOARD_VIEW_TYPE` leaves and calls `view.refresh()`.
- Result: improved coverage, but user still reports stale DOM in real usage path.

### Attempt 3: Rebind Stale `currentFeed` Reference in Dashboard

Implemented in [src/views/dashboard-view.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/views/dashboard-view.ts):

- Added `syncCurrentFeedReference()`.
- Called at start of `render()` and `getFilteredArticles()`.
- Goal: avoid stale object references after feed mutations.
- Result: still not fully resolving user-observed issue.

## Observations / Risk Areas

1. Save flow calls both modal `onSave()` and dashboard refresh methods; order and async timing may still permit stale render passes.
2. More than one render path exists (`refresh()`, `render()`, sidebar callbacks, pagination/refilter); a partial refresh path may overwrite a full one.
3. `ArticleList.refilter()` paths can preserve header/menu state and may not fully rebuild all UI state when filter model changes.
4. Feed updates may mutate object state in-place while other logic assumes replacement-based updates.
5. Dashboard instances in deferred leaves may still race with refresh timing.

## Potential Solutions Ranked by Likelihood of Success

### 1) Force Deterministic Full Re-render Event from Plugin (Highest Likelihood)

Add a single plugin-level event (e.g. `workspace.trigger("rss-dashboard:filters-updated", { feedUrl })`) and have each `RssDashboardView` subscribe and run:

1. `syncCurrentFeedReference()`
2. reset pagination if needed for affected scope
3. full `render()`

Why likely:

- Removes ambiguity around which callback path wins.
- Decouples modal save timing from direct view object calls.
- Uses one authoritative refresh contract.

### 2) In Edit Save Flow, Reacquire View After Save + Delay to Next Tick (High Likelihood)

After `saveSettings()`, enqueue refresh with `requestAnimationFrame` or `setTimeout(0)` and reacquire each dashboard leaf right before rendering.

Why likely:

- Prevents refresh before settings mutation propagation and leaf readiness.
- Avoids acting on stale view references captured before save.

### 3) Replace `currentFeed` Object by URL in Save Path Before Refresh (Medium-High)

In edit save, if dashboard is currently on that feed, set dashboard `currentFeed` to canonical `settings.feeds.find(url)` immediately before render.

Why likely:

- Directly addresses stale object risk at source.
- Simple targeted patch if scope is only edit-feed-triggered refresh.

### 4) Always Use Full Render, Never `refilter`, for Filter Model Changes (Medium)

Ensure any keyword filter config change bypasses partial refilter routes and triggers full dashboard rebuild.

Why likely:

- Eliminates UI state drift from mixed incremental update paths.
- Slightly heavier render cost, but reliable.

### 5) Immutable Feed Replacement During Edit Save (Medium)

Instead of mutating `this.feed`, replace the feed entry in `settings.feeds` with a new object and then render.

Why likely:

- Improves reference consistency.
- May require broader adjustments where existing code relies on mutation semantics.

### 6) Hard Reload Active Dashboard Leaf State (Lower, but Reliable Fallback)

Programmatically re-open dashboard view state on the active leaf after save.

Why lower:

- Heavy-handed UX.
- More disruptive than needed if root cause is event ordering/reference drift.

## Recommended Next Step

Implement **Solution 1** (plugin event-based deterministic full re-render) first. It is the cleanest architecture and most robust against timing/reference issues already seen with direct refresh calls.

## Files Most Relevant for Next Fix Pass

- [src/modals/feed-manager-modal.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/modals/feed-manager-modal.ts)
- [main.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/main.ts)
- [src/views/dashboard-view.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/views/dashboard-view.ts)
- [src/components/article-list.ts](C:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/components/article-list.ts)
