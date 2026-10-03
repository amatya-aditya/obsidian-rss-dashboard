---
status: in-progress
created: 2026-09-20
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/324"
milestone: "2.7.0"
owner: unassigned
workstream: sidebar refresh feedback
sequence: null
depends_on: []
release_requirement: required
implementation: ""
---

# Real-time per-feed refresh status

## Problem

During a global refresh, the sidebar initially renders every eligible feed as
queued (⏳). The batch updates its numeric progress as feeds finish, but does
not redraw feed rows until the complete batch ends. A feed that has already
settled therefore retains its hourglass while unrelated feeds are still queued
or fetching.

## Product contract

- A feed has a transient per-feed refresh status: **queued**, **fetching**, or
  **settled**.
- Queued feeds show the existing hourglass. A feed changes to the existing
  fetching spinner when a worker begins its request.
- A feed becomes settled as soon as its fetch, parse, and in-memory merge has
  succeeded, or its failure/timeout has been recorded. Its active indicator is
  removed at that point, regardless of other feeds still running.
- This status is not a promise of an individual durable write. The existing
  batch-level settings save remains after all feeds settle, avoiding one write
  per feed.
- The global refresh control and its progress text remain active until the
  entire eligible batch settles. Cancellation behavior, bounded concurrency,
  retries, timeouts, errors, and final notices remain unchanged.
- The same live state is visible on every navigation surface that uses the
  sidebar, including desktop and mobile. Existing background-import visuals
  retain priority when they overlap a refresh state.

## Rendering and performance contract

- Keep numeric `completed/total` progress updates lightweight and independent
  from feed-row redraws.
- Coalesce sidebar status redraw requests over a 250 ms window. This is a
  freshness budget, not a recurring timer: no redraw occurs without a state
  transition.
- Flush a final status redraw immediately when the last active feed settles,
  so the final feed never remains stale behind the coalescing window.
- Do not introduce a five-second gate or a changed-feed-count threshold. Both
  make user-visible latency inconsistent; the five-second option is visibly
  stale for ordinary refreshes.
- Do not invoke a full dashboard/article-list refresh per feed. The selected
  sidebar-only route must preserve article-list scroll and avoid resetting the
  current reading context.

## Implementation outline

1. In `main.ts`, retain the batch's existing `activeRefreshState` transitions
   and state cleanup, but notify open dashboard views after the
   queued-to-fetching transition and after each feed is removed on settlement,
   including when that removal empties the map.
2. Add a dedicated, coalesced sidebar-status notification path. It should use
   `RssDashboardView.refreshSidebarOnly()` and avoid bundling unrelated
   filter-status work into every per-feed transition.
3. Keep `refreshGlobalRefreshProgressOnly()` for throttled numeric progress;
   do not make it responsible for rereading or rebuilding feed rows.
4. Preserve the final batch refresh, validation, and single settings save as
   the authoritative completion path.

## Test plan

Follow red-green-refactor. Add focused tests before implementation.

- `test_files/unit/main/feed-refresh-pipeline.test.ts`
  - Hold two or more feed refresh promises open independently.
  - Assert a settled successful feed is removed from active refresh state and
    triggers a sidebar-status update while another feed remains active.
  - Repeat for failure and timeout paths.
  - Assert the final feed also produces the final status update; do not retain
    the old `activeRefreshState.size > 0` guard.
  - Assert closely grouped transitions coalesce within the 250 ms window, but
    final settlement flushes immediately.
- `test_files/unit/components/sidebar-core.test.ts`
  - Render queued and fetching rows, update the plugin's active state, then
    rerender through the sidebar-only route.
  - Assert settled rows no longer show ⏳ or the fetching spinner while other
    rows still do.
  - Preserve the existing assertion that background-import visuals take
    precedence over refresh visuals.
- Extend or add a dashboard-view test if needed to prove sidebar-only status
  refresh preserves article-list scroll and works for each open dashboard leaf.

## Acceptance criteria

1. During a multi-feed global refresh, a successful feed loses its active
   indicator within 250 ms of its fetch/parse/merge outcome.
2. A failed or timed-out feed also loses its active indicator within that
   window and continues to expose its existing failure state.
3. Queued feeds become fetching when their worker starts.
4. The final settled feed clears immediately, without waiting for a debounce.
5. The global progress/control remains active until batch completion.
6. No per-feed settings save or full dashboard refresh is added.
7. Desktop, mobile, popout, and background-import precedence behavior remain
   correct.
8. Focused tests, lint for changed TypeScript, `npm run check:platform`, type
   checking, relevant unit tests, and `npm run build` pass; manual verification
   covers a slow feed alongside a fast success, failure, timeout, and final
   completion.

## Non-goals

- Changing network concurrency, request/soft timeout values, retry policy, or
  cancellation semantics.
- Persisting per-feed refresh state or writing settings per settled feed.
- Replacing the sidebar rebuild with a new row-level DOM patching subsystem.
- Altering refresh timestamps, error semantics, or article-list refresh logic.

## Issue intake

Tracked by [GH Issue #324](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/324)
in the 2.7.0 milestone. This is required release work because it corrects a
visible false in-progress state during ordinary global refreshes.
