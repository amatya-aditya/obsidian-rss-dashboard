---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 11
depends_on:
  - draft-20260908-freshrss-03-manual-subscription-article-import.md
release_requirement: ""
implementation: ""
---

# 11: Prove the read contract against pinned FreshRSS

**What to build:** Establish the first real-server Docker contract for the
implemented secure connection and manual import path. A deterministic Linux
harness must prove the read assumptions against one exact official FreshRSS
build while remaining separate from normal unit tests.

**Blocked by:** 03: Import FreshRSS subscriptions and recent articles manually.

**Status:** ready-for-agent

- [ ] The required contract uses one reviewed official stable FreshRSS image
      pinned by exact version and digest; `latest` and `edge` are not used by the
      required job.
- [ ] The harness runs on Linux in a separate local command and CI job, and the
      ordinary unit suite requires neither Docker nor network access.
- [ ] A compose-scoped FreshRSS instance uses an isolated test-owned volume and
      runtime-only deterministic credentials.
- [ ] A local deterministic RSS/Atom fixture server supplies at least two
      categorized feeds, one uncategorized feed, and stable article content.
- [ ] Readiness requires container reachability, ClientLogin, an authenticated
      read-only probe, a modification-token probe, and observable seeded fixture
      data.
- [ ] Stable logical fixture identities are distinct from every opaque remote
      subscription, stream, tag, and article ID discovered from FreshRSS.
- [ ] The contract proves subscription/tag discovery, item-ID enumeration,
      content retrieval, initial local placement, opaque binding persistence,
      and local-only lifecycle boundaries.
- [ ] Restarting the FreshRSS container with the test-owned volume preserves the
      seeded account and contract data used by the read path.
- [ ] Success and failure both tear down only the compose project and
      test-owned volume.
- [ ] CI artifacts record image tag/digest, reported FreshRSS version/build,
      exercised API paths, readiness, and scenario results without credentials,
      auth values, sessions, or modification tokens.
- [ ] The mocked response corpus is reconciled with the observed pinned-server
      shapes without weakening malformed/incomplete-response validation.
- [ ] Local contract documentation explains prerequisites, commands,
      deterministic fixtures, artifacts, cleanup, and the finite compatibility
      claim.
- [ ] Focused tests, the ordinary unit suite, lint/type checks for harness code,
      the pinned Docker read contract, and final generated-artifact inspection
      pass.
