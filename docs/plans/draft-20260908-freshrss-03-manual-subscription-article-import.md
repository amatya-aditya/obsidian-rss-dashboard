---
status: accepted
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 3
depends_on:
  - ../archive/plans/unreleased/draft-20260908-freshrss-02-secure-connection-scoped-sidecar.md
release_requirement: ""
implementation: ""
---

# 03: Import FreshRSS subscriptions and recent articles manually

**What to build:** Make **Sync now** deliver the first useful FreshRSS result:
read the connected account, create or link FreshRSS-linked feeds, import a
bounded set of recent articles, persist opaque bindings, and report what
happened while preserving all local organization and lifecycle rules.

**Blocked by:** 02: Connect FreshRSS securely and establish a scoped sidecar.

**Status:** ready-for-agent

- [ ] **Sync now** enters through one FreshRSS sync coordinator and acquires the
      shared data-sync lease before committing feed, article, or sidecar state.
- [ ] The cycle reads FreshRSS subscription, tag, item-ID, and item-content
      responses through a typed protocol boundary with one request in flight.
- [ ] All remote subscription, stream, tag, and article identifiers are stored
      and compared as opaque remote references.
- [ ] An unbound subscription links to exactly one local feed with the same
      canonical feed URL, creates a new local feed when no match exists, and
      reports multiple matches without guessing.
- [ ] A newly created FreshRSS-linked feed receives its initial title and flat
      category placement from FreshRSS.
- [ ] A previously linked feed retains its local folder placement, retention,
      templates, tags, refresh configuration, and saved-note behavior.
- [ ] Imported articles use existing content-shard, merge, deduplication,
      rendering, and retention behavior while retaining exact remote article
      bindings in the sidecar.
- [ ] A complete subscription response that omits an earlier remote
      subscription never deletes the local feed or its articles.
- [ ] Remote article absence is never interpreted as local deletion.
- [ ] The initial bounded read records a partial result when a continuation or
      budget proves that more data exists; it never treats one page as complete
      merely because the first page was persisted.
- [ ] Checkpoints advance only for a fully completed bounded read and successful
      local writes; partial or failed reads retain the prior checkpoint.
- [ ] A manual cycle persists one safe durable outcome, refreshes relevant views
      once, and shows one summary notice without leaking response or secret
      material.
- [ ] Local-only feeds and articles remain untouched by the cycle.
- [ ] Mocked coordinator tests assert the request transcript and resulting
      content shards, user state, sidecar bindings, outcome, and view behavior.
- [ ] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.
