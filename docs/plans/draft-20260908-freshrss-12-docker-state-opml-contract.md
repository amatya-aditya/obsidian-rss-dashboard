---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 12
depends_on:
  - ../archive/plans/unreleased/draft-20260908-freshrss-07-sync-recovery-scope-repair.md
  - draft-20260908-freshrss-09-subscription-opml-export.md
  - draft-20260908-freshrss-11-pinned-docker-read-contract.md
release_requirement: ""
implementation: ""
---

# 12: Prove state mutation and OPML contracts against FreshRSS

**What to build:** Extend the pinned real-server contract so the full portable
state and subscription-export promises are verified against FreshRSS's actual
authentication, item-state, label, persistence, paging, and OPML behavior.

**Blocked by:** 07: Harden paging, recovery, scope safety, and repair; 09: Export
FreshRSS subscription OPML; 11: Prove the read contract against pinned FreshRSS.

**Status:** ready-for-agent

- [ ] Deterministic fixtures expose read/unread, starred/unstarred, and mapped
      label states plus enough items to exercise paging without public feeds.
- [ ] The contract verifies FreshRSS modification-token and exact `OK`
      acknowledgment behavior for read, starred, and mapped-label membership
      changes.
- [ ] A restart proves accepted FreshRSS state mutations persist and are read
      back through the implemented reconciliation path.
- [ ] Every remote identifier is discovered from the running server; no fixture
      derives or hard-codes an ID from URL, title, label name, or ordering.
- [ ] Observed paging and content-batch behavior remains compatible with the
      client's conservative completeness and checkpoint rules.
- [ ] The OPML scenario exports RSS Dashboard subscriptions, imports them into
      FreshRSS, exports the resulting FreshRSS feed list, and compares URLs,
      titles, flat categories, duplicate-collapse expectations, and a preserved
      baseline subscription.
- [ ] The OPML scenario explicitly makes no assertion about credentials,
      article bodies, read/starred state, labels, sidecar data, or FreshRSS
      archival state.
- [ ] Contract runs record the exact image digest, FreshRSS version/build,
      exercised API paths, and scenario outcomes in sanitized artifacts.
- [ ] A previous stable image may be added only as a scheduled or manual
      non-blocking job with its own recorded digest and results.
- [ ] Updating the required image or digest requires explicit fixture and
      contract review; `latest` and `edge` remain advisory at most.
- [ ] Normal unit and mocked-protocol suites remain deterministic and independent
      of Docker availability.
- [ ] The complete mocked corpus, ordinary unit suite, pinned Docker contract,
      relevant lint/type checks, and final generated-artifact inspection pass.
