---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 6
depends_on:
  - draft-20260908-freshrss-04-offline-first-read-sync.md
release_requirement: ""
implementation: ""
---

# 06: Synchronize mapped FreshRSS labels

**What to build:** Make membership in existing FreshRSS labels portable as
dashboard tags while preserving local tag colors and keeping unmapped,
automatic, and local-only tags outside the remote lifecycle.

**Blocked by:** 04: Synchronize read state offline-first.

**Status:** ready-for-agent

- [ ] FreshRSS tag discovery records each supported label's normalized name,
      exact opaque remote tag reference, and returned kind.
- [ ] Label lookup trims surrounding whitespace and compares a
      locale-independent lower-case key consistently on pull, local mutation,
      and reload.
- [ ] Read and starred system streams remain dedicated facets and are not
      exposed as dashboard label tags.
- [ ] Adding or removing a known mapped label on a FreshRSS article creates one
      `label:<normalized name>` pending facet mutation with an absolute desired
      value.
- [ ] Mapped-label mutations use the same sidecar-before-local-commit,
      pending-first, exact-`OK`, coalescing, stale-operation, and retention
      guarantees as read state.
- [ ] A complete remote label stream adds or removes only that mapped label's
      membership and cannot override a current pending label facet.
- [ ] The dashboard's chosen display spelling and tag color remain local when
      remote membership changes.
- [ ] Unmapped local tags, automatic tags, folder tags, saved tags, and other
      local presentation metadata create no remote label mutation.
- [ ] Version 1 does not create, rename, or delete FreshRSS labels; a local tag
      without a known remote mapping remains local.
- [ ] Local-only articles and saved-note behavior remain unaffected.
- [ ] Mocked coordinator tests cover case-normalized mapping, membership in both
      directions, collisions, pending conflicts, reload, stale acknowledgment,
      and unmapped-tag isolation.
- [ ] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.
