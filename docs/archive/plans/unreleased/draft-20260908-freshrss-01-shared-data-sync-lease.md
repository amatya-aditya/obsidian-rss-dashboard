---
status: implemented
created: 2026-09-08
completed: 2026-09-08
released_in: unreleased
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 1
depends_on: []
release_requirement: ""
implementation: ""
---

# 01: Introduce a shared data-sync lease

**What to build:** Introduce one shared ownership boundary for operations that
mutate feed or article data. Existing ordinary refresh, background ingestion,
storage hydration/reload, and future FreshRSS cycles must serialize their
commits without changing current refresh, import, cancellation, notice, or view
behavior. This is the prefactor that makes later FreshRSS tracer bullets safe.

**Blocked by:** None (can start immediately).

**Status:** implemented

**Risk:** High. This change coordinates shared feed/article state, persistence,
background work, and plugin cancellation/unload behavior. A missed ownership
guard could permit a stale write, while an over-broad lease could change refresh
concurrency or block independent UI work.

- [x] One named data-sync lease is shared by ordinary multi-feed refresh,
      single-feed refresh, background ingestion, and storage hydration/reload
      before any of them commits feed or article state.
- [x] An operation waiting for the lease starts only after the current owner
      releases it, including when the owner throws or is cancelled.
- [x] A cancelled or unloaded operation cannot commit a late network result
      after it has lost ownership.
- [x] The lease does not serialize unrelated rendering or read-only work.
- [x] Existing refresh concurrency limits remain intact inside the ordinary
      refresh owner.
- [x] Existing refresh, import, status, cancellation, persistence, and view
      behavior remains observably unchanged.
- [x] Plugin-level regression tests prove that competing data writers do not
      overlap and that queued work resumes after success and failure.
- [x] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.

## Implementation notes

- `DataSyncLease` is owned by the plugin and exposes one FIFO operation runner
  with an ownership signal and commit guard. Closing the lease on unload
  invalidates the active owner and prevents queued work from starting.
- Ordinary single-feed and multi-feed refresh, background placeholder ingestion
  and hydration, and settings/shard hydration all enter through that runner.
  Existing bounded feed-fetch concurrency remains inside the active owner.
- Owners re-check the guard after awaited network and storage boundaries before
  merging or persisting feed/article state. Independent view rendering and
  read-only plugin APIs do not acquire the lease.
- Refresh and background network timeout wrappers reject promptly on abort even
  when an underlying parser promise does not settle. Cancellation can therefore
  finish existing persistence and cleanup before releasing the next waiter,
  while the abandoned parser promise has no path back to a state commit.
- Existing overlapping multi-feed refresh rejection remains outside lease
  acquisition. Final view lookup/render work and throttled progress rendering
  do not extend the data ownership window.
- Plugin-level regression coverage exercises serialization across refresh,
  background ingestion, and storage hydration; queued work after success,
  failure, and cancellation; persistence fencing during cancellation; and late
  refresh completion after unload.
