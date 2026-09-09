---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 7
depends_on:
  - draft-20260908-freshrss-05-starred-state-sync.md
  - draft-20260908-freshrss-06-mapped-label-sync.md
release_requirement: ""
implementation: ""
---

# 07: Harden paging, recovery, scope safety, and repair

**What to build:** Make the complete manual FreshRSS cycle safe under large
accounts, partial responses, crashes, transient failures, rejected credentials,
scope changes, and invalid remote bindings. Users must see a durable actionable
outcome without any incomplete stream being treated as authoritative.

**Blocked by:** 05: Synchronize starred state; 06: Synchronize mapped FreshRSS
labels.

**Status:** ready-for-agent

- [ ] Item-ID streams use pages of at most 1,000, item-content requests use
      batches of at most 100, and mutation dispatch uses deterministic batches
      of at most 50 with one request in flight.
- [ ] The default bootstrap budget is 25,000 IDs per relevant stream, and a
      budget-capped stream records a partial result rather than clearing state
      by absence.
- [ ] Missing required fields, malformed responses, malformed continuation
      cursors, repeated cursors, and abruptly incomplete streams stop the
      affected phase without claiming completion or advancing its checkpoint.
- [ ] Checkpoints and optional content watermarks advance only after all pages,
      required content, merges, and local writes for the stream succeed.
- [ ] Earlier successfully persisted pages may remain after a later failure and
      are safely reread from the old complete checkpoint without duplicates or
      data loss.
- [ ] Network failures, timeouts, HTTP 408, HTTP 429, and HTTP 5xx receive at
      most three in-cycle attempts at 1, 2, and 4 seconds plus bounded jitter.
- [ ] Exhausted transient failures schedule cycle backoff beginning at 5
      minutes and capped at 6 hours; a later successful cycle resets backoff.
- [ ] HTTP 401, HTTP 403, or rejected token state causes one fresh login from
      SecretStorage; a second rejection enters FreshRSS authentication pause
      with no automatic retry.
- [ ] HTTP 400, HTTP 404, HTTP 422, unknown bindings/items, and invalid mapped
      label operations retain the desired pending facet mutation with a
      terminal repair state and no automatic replay.
- [ ] Explicit retry can rearm a repaired terminal mutation, and explicit
      cancellation removes it only after a deliberate user action.
- [ ] A successful connection test for a new endpoint or authenticated user
      quarantines every old binding, checkpoint, outcome, and pending mutation
      before activating the new empty scope.
- [ ] No quarantined pending operation can be dispatched into the active scope,
      and local feeds, articles, placement, retention, and saved-note state
      remain intact across the change.
- [ ] Manual sync reports one durable success, partial-transient,
      authentication-blocked, scope-test-required, persistence-blocked, or
      success-with-terminal-actions outcome and refreshes views once.
- [ ] The optional `ot` query is absent from the correctness path unless a
      separately tested capability enables it as a content-only optimization.
- [ ] A sanitized golden mocked-response corpus deterministically covers every
      failure, cursor, acknowledgment-ordering, and recovery scenario.
- [ ] Focused tests, the broad unit suite, lint, platform checks, type checking,
      the complete build, and final generated-artifact inspection pass.
