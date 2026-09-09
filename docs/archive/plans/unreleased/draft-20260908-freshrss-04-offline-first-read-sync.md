---
status: implemented
completed: 2026-09-09
released_in: unreleased
issue: ""
implementation: ""
---

# 04: Synchronize read state offline-first

**What to build:** Make read and unread state portable in both directions. A
read-state action on a FreshRSS article must become durable before local commit,
survive offline use and reload, flush before remote reads, and remain
authoritative until FreshRSS acknowledges the current operation.

**Blocked by:** 03: Import FreshRSS subscriptions and recent articles manually.

**Status:** ready-for-agent

- [ ] All observable read/unread entry points, including reader, dashboard,
      context-menu, automatic-read, page, selection, folder, and all-feed
      actions, pass through one article-facet mutation boundary.
- [ ] A FreshRSS article read change creates one pending facet mutation keyed by
      scoped opaque article ID and `read`, with an opaque operation ID and
      absolute desired boolean state.
- [ ] A newer local read choice replaces the prior pending record for that
      article facet rather than appending a toggle history.
- [ ] The sidecar mutation is durably persisted under the data-sync lease before
      the corresponding synchronized local facet is reported as committed.
- [ ] A sidecar write failure leaves the synchronized facet uncommitted and
      reports an actionable local persistence error.
- [ ] Local-only articles retain their existing read behavior and create no
      FreshRSS sidecar record.
- [ ] A FreshRSS cycle obtains a fresh modification token and flushes pending
      read mutations before pulling remote read state.
- [ ] Only a successful response with an exact `OK` body acknowledges a
      mutation.
- [ ] An acknowledgment removes the pending record only when its operation ID
      still matches the current record; a delayed acknowledgment cannot remove
      a newer choice.
- [ ] Pulled remote state never overrides a still-pending local read facet.
- [ ] Remote read/unread absence changes local state only after the relevant
      item-ID stream is complete.
- [ ] Retention may remove a local article or user-state entry without removing
      its unacknowledged pending remote action.
- [ ] Reload tests prove that pending desired state overlays older remote/local
      state until acknowledgment.
- [ ] Mocked-protocol tests enter through the coordinator and assert
      pending-first ordering, mutation acknowledgment, pull reconciliation,
      persistence, and visible state rather than private helper calls.
- [ ] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.
