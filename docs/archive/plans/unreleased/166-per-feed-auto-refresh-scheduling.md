---
status: implemented
completed: 2026-08-16
released_in: unreleased
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/166
implementation: ""
---

# Per-Feed Auto-Refresh Scheduling Fix

## Status

- **Classification:** Bug fix for an existing nonfunctional Add/Edit Feed setting.
- **Risk:** High. Scheduling, refresh orchestration, persisted feed metadata,
  storage modes, settings lifecycle, and synchronization are affected.
- **Required next stage:** [Refresh status and progress indicators](../../../plans/167-refresh-status-indicators.md).
- **Gate:** Implement, validate, commit, and archive this plan before starting
  the indicator feature.

## Problem

The Add/Edit Feed modal persists `Feed.scanInterval`, but runtime scheduling
reads only the global interval. The displayed **Auto refresh interval** values
therefore do not control scheduling.

This fix must also establish an unambiguous per-feed completion timestamp. A
failed attempt must reset the next due time just like a successful attempt;
otherwise failing feeds can enter rapid retry loops. Preserve `Feed.lastUpdated`
as the latest successful parse rather than repurposing it.

## Behavior contract

### Effective interval

- `scanInterval === -1`: automatic refresh is Off; no next due.
- `scanInterval > 0`: use that feed-specific number of minutes.
- `scanInterval === 0` or absent: inherit the global interval.
- An inherited global interval `<= 0` makes automatic refresh Off.
- A positive per-feed interval continues scheduling when the global interval is Off.
- `excludeFromRefresh === true` excludes a feed from automatic and bulk refresh.
- Automatic refresh Off affects scheduling only. Explicit refresh actions still
  include the feed unless bulk exclusion applies.
- An explicitly requested single-feed refresh remains available for an excluded feed.

### Completion and due time

- Add `Feed.lastRefreshAttemptCompletedAt?: number`.
- Stamp it once when each attempt finishes, including success, parser-reported
  failure, thrown failure, and timeout.
- Preserve or update `lastFetchError` separately and preserve `lastUpdated` on failure.
- Derive `nextDueAt` as completion time plus effective interval; do not persist it.
- Every completed manual or automatic attempt resets the next due time.
- A never-checked eligible feed is due promptly after the startup gate.
- Interval shortening and lengthening recalculate from the same completion anchor.
- Failed automatic attempts wait their normal interval; rapid retry and
  exponential backoff remain out of scope.

### Scheduler lifecycle

- Replace the single global `window.setInterval` with one due-aware scheduler.
- Prefer a focused service with explicit `start`, `reschedule`, and `stop` methods.
- Maintain one rearmable owning-window `setTimeout` for the nearest due time;
  clamp long delays and reevaluate after delayed wakeups.
- Snapshot due feeds at batch start.
- Start only after settings and storage initialization plus the existing startup delay.
- Reschedule after attempt completion, interval changes, feed add/edit/delete,
  external metadata adoption, and storage-mode reload.
- Stop and clear the timeout on plugin unload.
- Do not overlap multi-feed batches. Reevaluate due work after the active batch finishes.

### Persistence and identity

- Persist the per-feed completion timestamp through legacy JSON, vault metadata,
  shards, backup/import, and external reload flows.
- When absent, seed it from a finite positive `lastUpdated`; otherwise use `0`.
- Do not persist active state or `nextDueAt`.
- Metadata-only edits preserve history.
- A changed feed URL is a new refresh identity: reset completion and error state
  before the replacement URL's first attempt.
- Cross-device timestamps may defer local work after synchronization; distributed
  locking is out of scope.
- Keep legacy `lastRefreshTimestamp` readable for compatibility, but stop using
  it for scheduling.

## Code seams

- `src/types/types.ts`: add the per-feed completion field to feed and metadata contracts.
- `src/utils/refresh-intervals.ts`: add pure effective-interval, next-due, and
  due-feed helpers.
- New service under `src/services/`: own timer lifecycle and request due-feed
  orchestration without fetching or persisting itself.
- `main.ts`: carry explicit batch intent, centralize attempt finalization,
  initialize/reschedule/dispose the scheduler, and prevent overlap.
- `src/utils/settings-loader.ts` and storage services: migrate and round-trip timestamps.
- Add/Edit Feed and general settings flows: reschedule after relevant changes,
  preserve metadata history, and reset URL identity state.
- `docs/development/data-flow.md`: correct the current claim that the persisted
  per-feed interval already controls runtime scheduling.

## TDD sequence

Follow Red -> Green -> Refactor. Finish each phase green before continuing.

1. **Pure scheduling rules:** test custom, inherited, Off, global-Off, excluded,
   invalid, never-checked, boundary-time, and interval-change cases under
   `test_files/unit/utils/`; then implement helpers.
2. **Migration and storage:** test timestamp seeding, preservation, legacy
   compatibility, all storage round trips, and non-persistence of active/derived
   state; then implement types and normalization.
3. **Refresh finalization:** test every success/failure/timeout path, error and
   `lastUpdated` preservation, exclusions, explicit single refresh, overlap
   rejection, and URL identity reset in main pipeline tests; then refactor orchestration.
4. **Scheduler lifecycle:** with fake timers, test nearest-due arming, global-Off
   custom schedules, startup gating, snapshots, rearming, active-batch delay,
   unload, delayed wakeup, and synchronized reload; then replace the global timer.
5. **Settings integration:** exercise Add and Edit Feed interval changes and
   confirm the scheduler is rescheduled with the effective value.

## Acceptance criteria

1. Add/Edit Feed's **Auto refresh interval** controls actual scheduling.
2. Use global, Off, positive custom, global-Off, and exclusion behavior match the contract.
3. Failed and successful attempts both advance per-feed completion and reset next due.
4. No automatic batch overlaps an existing multi-feed batch.
5. Settings, feed lifecycle, storage reload, wakeup, and unload correctly rearm or stop scheduling.
6. Completion history survives every supported storage path and identity rules.
7. No refresh-status UI or global-completion field is added in this change.
8. Focused tests, full unit tests, platform check, type-check, and build pass.
9. The change has its own commit, and this plan is reconciled and archived before stage 2 begins.

## Validation and handoff gate

Run focused tests throughout, ESLint for every changed TypeScript file,
`npm run check:platform`, `npm exec -- tsc --noEmit --skipLibCheck`, the full
`npm run test:unit`, and `npm run build`. Finish with `git status --short` and
verify no generated artifacts appeared.

Manually cover inherited/custom/Off schedules, global-Off with a custom feed,
interval changes around a due boundary, restart/wakeup, success/failure/timeout,
manual refresh before due time, feed add/edit/delete, URL change, bulk exclusion,
and each storage mode.

After every required check passes:

1. Update `CHANGELOG.md` under **Unreleased -> Fixes**.
2. Reconcile this plan with the delivered implementation and test results.
3. Move it to `docs/archive/plans/unreleased/` and update all links and the archive catalog.
4. Commit the complete scheduling fix as an independently reviewable change.
5. Only then start the linked refresh-status indicator plan.

## Delivered implementation

- Added pure effective-interval, due-time, and due-feed helpers with Use global,
  Off, custom, exclusion, boundary, and global-Off coverage.
- Added a single-timeout `FeedRefreshScheduler` that starts after the configured
  startup gate, snapshots due feeds, handles delayed wakeups, avoids active
  multi-feed overlap, and re-arms after settings saves, reloads, refreshes, and
  unload.
- Added `lastRefreshAttemptCompletedAt` to feed metadata. Legacy records seed it
  from a positive `lastUpdated`, and all storage modes preserve it through their
  existing feed-config serialization paths.
- Finalized every refresh attempt at success, parser-reported failure, thrown
  error, or timeout without repurposing `lastUpdated`; URL changes reset the
  completion and error identity.

## Automated validation

- Focused scheduling, migration, refresh-pipeline, modal, and lifecycle tests passed.
- `npm run check:platform`, `npm exec -- tsc --noEmit --skipLibCheck`,
  `npm run test:unit` (188 files, 1,645 tests), and `npm run build` passed.

## Remaining manual checks

- In Obsidian desktop and mobile, exercise inherited/custom/Off schedules,
  global-Off custom scheduling, interval changes around a due boundary,
  restart/wakeup, success/failure/timeout, manual refresh before due time,
  add/edit/delete, URL change, bulk exclusion, and each storage mode.

## Non-goals

- Refresh status-bar or sidebar indicators.
- A global-refresh completion timestamp.
- Folder-specific refresh intervals.
- Relative-time UI polling.
- Rapid retry, exponential backoff, or distributed locking.
- Shift+click failed-only retry.
