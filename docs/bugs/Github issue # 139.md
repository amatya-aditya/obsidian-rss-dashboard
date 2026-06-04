Github issue # 139

https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/139

**Version:** RSS Dashboard 2.3.0, Obsidian 1.12.7, Windows 11

**Summary**
Clicking a feed in the sidebar does nothing when a sync plugin (Self-hosted LiveSync) is enabled. The click never filters to the selected feed. Disabling LiveSync makes filtering work again — but the root cause is in RSS Dashboard, not LiveSync.

**Root cause (diagnosed)**
On feed click, RSS Dashboard writes state to disk. LiveSync detects the write and emits a `vault.modify` event ~2ms later. RSS Dashboard responds to that event by tearing down and rebuilding its entire sidebar DOM (~500+ mutations), which destroys the `.rss-dashboard-feed` node before its own click handler completes. The handler is bound to a node that no longer exists, so the filter action never runs.

**Evidence**

- `document.elementsFromPoint()` at the click coordinate returns only RSS Dashboard + core Obsidian elements — no overlay, no LiveSync element. The click reaches the correct target. (Rules out any CSS/z-index/pointer-events theory.)
- A click listener bound to `.rss-dashboard-feed` in capture phase never fires — the node is replaced before dispatch completes.
- A MutationObserver on `.rss-dashboard-container` logs two bursts (507 then 130 changes) firing synchronously with the click, timestamped to the same millisecond as the resulting vault event. No mutations occur while idle, confirming the rebuild is event-triggered by the click's own write, not a timer.

**Steps to reproduce**

1. Enable any plugin that emits vault-modify events on file write (e.g. Self-hosted LiveSync in any active sync mode).
2. Add ≥2 feeds to RSS Dashboard.
3. Click a feed in the sidebar to filter to it.
4. Observed: sidebar fully re-renders, filter does not apply, clicked feed shows no effect.
5. Expected: only the selected feed's articles display.

**Suggested fix**
Debounce or guard the re-render: ignore `vault.modify` events for files RSS Dashboard itself just wrote, and/or do incremental DOM updates instead of a full teardown, and/or defer the rebuild so it doesn't fire during an in-flight click. A full DOM rebuild on every vault modify is fragile regardless of the trigger.

---

## Maintainer verification notes (June 1, 2026)

### What was verified in code

1. The sidebar feed click path does trigger a full dashboard render synchronously:
   - `handleFeedClick()` in `src/views/dashboard-view.ts` updates selection state and re-renders.
   - `render()` in `src/views/dashboard-view.ts` calls `sidebar.render()`.
   - `sidebar.render()` in `src/components/sidebar.ts` empties and rebuilds the sidebar DOM.

2. The reported immediate `vault.modify` rebuild path is not confirmed in current source:
   - `vault.on("modify")` in `src/views/dashboard-view.ts` schedules `verifySavedArticles()` with a 300000ms timeout.
   - This handler does not directly call `render()`.

3. Risk remains real even if the exact trigger differs:
   - Many code paths still use `saveSettings()` followed by `render()`.
   - Full DOM teardown on rapid back-to-back renders is fragile during UI interaction.

### Implementation status (started)

Implemented in `src/views/dashboard-view.ts`:

1. Added render reentrancy guard and coalescing:
   - `isRenderInProgress`
   - `hasPendingRender`

2. Added deferred render scheduler:
   - `scheduledRenderTimeout`
   - `scheduleRender()` (single queued render per tick)

3. Routed feed click through scheduler:
   - `handleFeedClick()` now calls `scheduleRender()` instead of immediate `render()`.

4. Routed high-frequency status flows through scheduler:
   - Mark all as read
   - Mark all as unread
   - Page size change

5. Added timer cleanup on close:
   - clears `scheduledRenderTimeout` in `onClose()`.

### Target files for remaining work

Primary:

- `src/views/dashboard-view.ts`
- `src/components/sidebar.ts`

Conditional (only if sync-plugin feedback loop still reproduces after scheduler hardening):

- `src/services/feed-storage-repository.ts`
- `src/services/article-saver.ts`

### Proposed remaining plan (do not execute yet)

1. Continue migrating selected high-churn `saveSettings() + render()` paths in `src/views/dashboard-view.ts` to `scheduleRender()` where safe.
2. Keep structural/destructive operations on immediate render unless testing shows they should also be scheduled.
3. Re-test with LiveSync enabled after each small batch.
4. Only if the repro still occurs, add narrow self-write suppression for RSS Dashboard-owned paths.

### Manual verification checklist

Run these manually in Obsidian without additional instrumentation first.

1. Baseline click flow:
   - Open dashboard with at least 2 feeds.
   - Click feed A, then feed B.
   - Confirm filter switches correctly and selected feed highlight updates each time.

2. Sync-enabled check:
   - Enable Self-hosted LiveSync (or equivalent).
   - Repeat feed A/B switching quickly (10-20 clicks).
   - Confirm no dead clicks and no stuck selection state.

3. Read/unread stress check:
   - Use "Mark all as read" and "Mark all as unread" in current view.
   - Immediately click a feed after each action.
   - Confirm feed click still applies the filter.

4. Pagination settings check:
   - Change page size.
   - Immediately click a feed.
   - Confirm both page-size persistence and feed filtering work.

5. Minimal console-only fallback (only if failure persists):
   - Add a temporary timestamped `console.debug` at feed click start and render entry/exit.
   - Reproduce once and remove logs immediately after capture.

### Success criteria

1. Feed click consistently filters to the selected feed with sync enabled.
2. No interaction path leaves the sidebar visually rebuilt but logically unselected.
3. No regressions in mark-read/unread and page-size flows.
