---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 8
depends_on:
  - draft-20260908-freshrss-07-sync-recovery-scope-repair.md
release_requirement: ""
implementation: ""
---

# 08: Run automatic FreshRSS synchronization

**What to build:** Let a connected user opt into quiet startup and scheduled
FreshRSS synchronization. Every automatic trigger must use the same proven
coordinator, data-sync lease, pending-first behavior, backoff, and blocked-state
rules as **Sync now**.

**Blocked by:** 07: Harden paging, recovery, scope safety, and repair.

**Status:** ready-for-agent

- [ ] Automatic FreshRSS synchronization is opt-in and defaults off.
- [ ] The dedicated interval defaults to 15 minutes and is independent of
      ordinary global and per-feed refresh intervals.
- [ ] Startup sync can begin only after settings, content shards,
      `user-state.json`, and `freshrss-state.json` have hydrated successfully.
- [ ] Startup, dedicated timer, manual sync, and explicit retry enter through
      the same FreshRSS coordinator.
- [ ] Only one FreshRSS cycle runs at a time, and triggers received during it
      coalesce into at most one trailing cycle.
- [ ] FreshRSS cycles continue to share the data-sync lease with ordinary feed
      refresh and background ingestion.
- [ ] Success rearms the configured interval from completion; exhausted
      transient failures rearm from the computed backoff deadline.
- [ ] Capability, storage, credential, scope-test, authentication, and
      persistence blocks do not create retry or notification loops.
- [ ] Automatic success is quiet; automatic cycles notify only when the durable
      outcome changes or user action becomes required.
- [ ] Plugin unload cancels FreshRSS timers and prevents a late automatic result
      from committing after ownership ends.
- [ ] Fake-timer and plugin-orchestration tests prove scheduling, coalescing,
      backoff, blocked states, interaction with ordinary refresh, and unload.
- [ ] Focused tests, the broad unit suite, lint, platform checks, type checking,
      the complete build, and final generated-artifact inspection pass.
