---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 13
depends_on:
  - draft-20260908-freshrss-08-automatic-sync.md
  - draft-20260908-freshrss-10-fetch-more-history.md
  - draft-20260908-freshrss-12-docker-state-opml-contract.md
release_requirement: ""
implementation: ""
---

# 13: Complete rollout validation and compatibility documentation

**What to build:** Finish the FreshRSS portable-state client as a coherent,
auditable user feature. Validate every supported path together, publish only the
compatibility evidence actually produced by the pinned contract, and reconcile
project documentation without reopening the settled Wayfinder decisions.

**Blocked by:** 08: Run automatic FreshRSS synchronization; 10: Fetch additional
FreshRSS history safely; 12: Prove state mutation and OPML contracts against
FreshRSS.

**Status:** ready-for-agent

- [ ] End-to-end manual verification covers capability-disabled settings,
      explicit Vault Shards v2 migration, SecretStorage selection, connection
      testing, initial import, manual sync, automatic sync, and unload.
- [ ] Manual verification covers local placement changes, remote subscription
      removal, local retention, saved-note independence, local-only feeds, and
      restart recovery.
- [ ] Offline read, starred, and mapped-label actions survive reload, remain
      authoritative through conflicts, flush first, and clear only after the
      current operation is acknowledged.
- [ ] Manual verification covers transient backoff, authentication pause,
      malformed/incomplete streams, terminal mutation retry/cancel, scope
      quarantine, and bounded **Fetch more history**.
- [ ] FreshRSS OPML is manually imported into the pinned server and remains
      documented as subscription-only.
- [ ] The compatibility matrix lists only tested Obsidian capability boundaries
      and exact FreshRSS image versions/digests with their exercised behavior.
- [ ] User documentation explains setup, Vault Shards v2, SecretStorage,
      connection scope, synchronized versus local state, pending facet
      mutations, repair, history bounds, OPML limits, and disconnect/scope
      behavior.
- [ ] Security documentation states that credential, auth, session, and token
      material never enters `data.json`, `freshrss-state.json`,
      `user-state.json`, logs, fixtures, or CI artifacts.
- [ ] The stale statement that issue #224 remained open is corrected without
      changing decision #226.
- [ ] Duplicate glossary entries are consolidated so FreshRSS connection scope
      and pending facet mutation consistently include mapped-label behavior and
      retain the settled vocabulary.
- [ ] No documentation claims remote deletion, subscription/category
      management, article-state OPML archival, or compatibility beyond the
      tested Docker contract.
- [ ] Changelog, plan lifecycle, archive catalog, and release-facing
      documentation are updated only after implementation and required
      validation actually succeed.
- [ ] The complete pure-unit and mocked-protocol suites pass without Docker, and
      the required pinned Docker contract passes on Linux with sanitized
      artifacts.
- [ ] Lint, platform checks, CSS policy checks when applicable, type checking,
      the complete build, and final git-status/generated-artifact inspection
      pass with no unexplained changes.
