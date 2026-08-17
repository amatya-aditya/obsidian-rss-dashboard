---
status: implemented
completed: 2026-08-17
released_in: unreleased
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/168
implementation: ""
---

# Retry Failed Feeds with Shift+Click

## Status and scope

- **Status:** Implemented and validated on `feat/168-retry-failed-feeds`.
- **Classification:** User-visible feature.
- **Risk:** Medium. The change spans sidebar input and refresh orchestration, but it does not require a new setting, dependency, or persistence schema.
- **Prerequisites:** [Per-feed auto-refresh scheduling fix](../166-per-feed-auto-refresh-scheduling.md) and [Refresh status and progress indicators](../167-refresh-status-indicators.md) were implemented, validated, committed, and archived first.
- **Sequence:** This is stage 3. Do not implement it in the same change or commit as either prerequisite.

## Problem

After a multi-feed refresh partially fails, the user can refresh every feed again or retry failed feeds individually. There is no quick way to rerun only the feeds that still have fetch errors.

The feed parser already stores the current error in `Feed.lastFetchError` and clears it after a successful refresh. That field can define the retry set without introducing a second failure registry.

## User experience

- A normal click on the **Refresh all feeds** icon keeps its current behavior.
- Shift+clicking the same icon retries only feeds whose `lastFetchError` is currently non-empty.
- The **All feeds** context menu includes **Retry failed feeds** as the accessible, touch-friendly equivalent.
- The icon tooltip communicates both actions: **Refresh all feeds. Shift+click to retry failed feeds.**
- After a multi-feed refresh completes with failures, its completion feedback hints: **Shift+click Refresh all feeds to retry failed feeds.** Do not add this hint until the failed-only action is implemented.
- If no eligible failed feeds exist, show **No failed feeds to retry.** and do not start a refresh.
- If another multi-feed refresh is active, retain the existing guard and do not start a competing retry batch.

## Eligibility rules

At activation time, take a snapshot of feeds that satisfy both conditions:

1. `lastFetchError` is non-empty.
2. The feed is eligible under the existing global-refresh exclusion policy.

The separate **Exclude from global refresh** option therefore excludes a failed feed from Shift+click retry as well. A feed's automatic refresh interval, including **Off**, does not prevent this explicit manual retry.

The snapshot is important: feeds that fail or recover while the batch is running must not change the membership of the active batch. Successful retries clear their existing error through the parser's current success path; feeds that fail again retain an updated error.

## Acceptance criteria

1. Plain click on the refresh-all icon refreshes the normal global feed set.
2. Shift+click refreshes only currently failed, non-excluded feeds.
3. The context-menu action refreshes the same failed-feed set as Shift+click.
4. Feeds excluded from global refresh are not retried.
5. A per-feed automatic interval of **Off** does not prevent manual retry unless the feed is also excluded from global refresh.
6. With no eligible failures, the plugin shows a clear notice and makes no parser request.
7. An active multi-feed refresh prevents a second normal or failed-only batch.
8. A successful retry clears the feed's error badge; another failure preserves or updates it.
9. Completion feedback for a batch with failures teaches the Shift+click retry gesture only after that gesture is available.
10. Refresh progress, persistence, article merging, and final view refresh use the existing multi-feed pipeline.
11. The interaction works in the main window and popout windows, and the context-menu action is available in the mobile sidebar.

## Implementation plan

Follow Red -> Green -> Refactor.

### 1. Add failing orchestration tests

Extend `test_files/unit/main/feed-refresh-pipeline.test.ts` with observable tests for a dedicated failed-feed retry entry point:

- It selects only feeds with `lastFetchError`.
- It delegates the snapshot to the existing selected-feed refresh pipeline.
- It excludes feeds governed by the global-refresh exclusion policy.
- It allows feeds whose automatic interval is **Off** when they are otherwise eligible.
- It shows **No failed feeds to retry.** and does not invoke the parser for an empty eligible set.
- It preserves the existing active-refresh concurrency guard.
- Successful and repeated-failure results retain the parser's existing error-clear/error-update behavior.
- A completed batch with failures includes the Shift+click retry hint, while a fully successful batch does not.

Prefer a plugin method such as `refreshFailedFeeds()` over filtering `plugin.settings.feeds` inside the sidebar. This keeps eligibility policy in the refresh orchestration layer and gives every UI entry point identical behavior.

### 2. Add failing sidebar interaction tests

Extend the matching tests under `test_files/unit/components/`:

- Plain click invokes the existing refresh-all path.
- Shift+click invokes the failed-only path and does not invoke refresh-all.
- The click handler stops propagation so the action does not also select **All feeds**.
- The icon has discoverable tooltip and accessible-name text.
- The **All feeds** context menu exposes **Retry failed feeds** and calls the same failed-only path.
- Both actions remain guarded while a multi-feed refresh is active.

Use jsdom, the shared Obsidian stubs, and DOM/mock cleanup required by the testing guide.

### 3. Implement failed-feed orchestration

In `main.ts`:

- Add a narrow `refreshFailedFeeds(): Promise<void>` entry point.
- Snapshot the currently failed feeds.
- Apply the same exclusion policy used by global refresh.
- Return with the empty-state notice when the eligible snapshot is empty.
- Delegate the non-empty snapshot to `refreshFeeds(selectedFeeds)` so queueing, merging, persistence, progress state, notices, and view refresh remain centralized.

Avoid duplicating the parser loop or maintaining a second refresh-active flag.

### 4. Wire desktop, keyboard, and touch-accessible UI paths

In `src/components/sidebar.ts` and its callback wiring in `src/views/dashboard-view.ts`:

- Inspect `MouseEvent.shiftKey` on the refresh-all icon.
- Route Shift+click to the failed-only callback and plain click to refresh-all.
- Add **Retry failed feeds** to the **All feeds** context menu.
- Update tooltip and accessible-name text using sentence case.
- Continue using owning-document APIs and registered/disposable event patterns required for popout compatibility.

No CSS change is expected. If implementation reveals that a visual state is necessary, scope selectors under the existing `rss-dashboard` roots and do not use `!important`.

### 5. Preserve refresh-time semantics

When implemented after the refresh-indicator work:

- Each attempted feed must receive its individual completion state whether the retry succeeds or fails.
- A failed-only retry is not an explicit global refresh and must not advance **Last global refresh**.
- Folder/all derived status may change as the retried member feeds complete.
- The UI may show **In progress** only for scopes containing members of the retry snapshot.

## Validation

During implementation, run:

1. Focused sidebar and refresh-pipeline unit tests.
2. ESLint for every changed TypeScript file.
3. `npm run check:platform` because `src/` UI code changes.
4. TypeScript checking with `npm exec -- tsc --noEmit --skipLibCheck` or the repository build.
5. `npm run build` before handoff.
6. `git status --short` after validation to confirm no generated artifacts appeared.

Run the full unit suite if implementation couples this action to the shared refresh-attempt state introduced by the scheduler/indicator feature.

## Manual checks

- Create two failing feeds and one healthy feed; Shift+click and confirm only the failures enter progress.
- Retry a mix of recoverable and still-failing feeds; confirm recovered badges clear and remaining errors persist.
- Mark a failed feed **Exclude from global refresh**; confirm it is skipped.
- Set a failed feed's automatic interval to **Off** without excluding it; confirm manual retry still includes it.
- Confirm plain click still refreshes the full eligible global set.
- Confirm the empty state produces one notice and no refresh animation.
- Confirm the context-menu action on desktop and the mobile navigation modal.
- Confirm a partial-failure completion message teaches Shift+click, while a fully successful completion message does not.
- Repeat in a popout window and verify the correct window owns the interaction.
- Confirm repeated activation cannot start overlapping batches.

## Non-goals

- Automatic retry or exponential backoff.
- A picker for choosing individual failed feeds.
- Historical failure tracking beyond the current `lastFetchError` state.
- Changing what qualifies as excluded from global refresh.
- Implementing the refresh indicator or repairing per-feed scheduling in this feature.

## Changelog

Do not add a changelog entry until the behavior is implemented and validated. At implementation handoff, add one concise **Unreleased -> Features** bullet without an issue link unless a canonical issue URL is supplied.

After all required checks pass, reconcile this plan with the implementation,
move it to `docs/archive/plans/unreleased/`, update repository links and the
archive catalog, and commit the failed-only retry as an independently reviewable change.
