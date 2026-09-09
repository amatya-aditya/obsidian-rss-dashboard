---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 5
depends_on:
  - ../archive/plans/unreleased/draft-20260908-freshrss-04-offline-first-read-sync.md
release_requirement: ""
implementation: ""
---

# 05: Synchronize starred state

**What to build:** Extend the proven pending-facet path so starring and
unstarring a FreshRSS article remains portable, offline-safe, and independent
from local retention and tag presentation behavior.

**Blocked by:** 04: Synchronize read state offline-first.

**Status:** ready-for-agent

- [ ] Dashboard, reader, inline-reader, context-menu, and other existing
      star/unstar actions use the shared article-facet mutation boundary.
- [ ] FreshRSS article changes coalesce to one current `starred` pending facet
      mutation with an absolute desired value and new operation ID.
- [ ] Starred mutations use the same sidecar-before-local-commit guarantee,
      pending-first cycle order, exact `OK` acknowledgment, and stale-operation
      protection as read state.
- [ ] Remote starred and unstarred state reconciles only from a complete
      authoritative stream and never overrides a current pending mutation.
- [ ] Local starred retention protection continues to govern local article
      lifecycle independently of FreshRSS retention.
- [ ] Existing automatic Favorite-tag behavior remains consistent, and its
      local presentation side effect does not create an unrelated FreshRSS
      label mutation.
- [ ] Dashboard tag colors, saved state, saved-note paths, playback progress,
      and other local facets remain unchanged by starred reconciliation.
- [ ] Local-only articles continue to star and unstar without FreshRSS network
      or sidecar activity.
- [ ] Reload, delayed acknowledgment, remote conflict, retained pending action,
      and local-only regression scenarios pass through the coordinator seam.
- [ ] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.
