---
status: implemented
completed: 2026-09-09
released_in: unreleased
issue: ""
implementation: ""
---

# 03: Import FreshRSS subscriptions and recent articles manually

**What to build:** Make **Sync now** deliver the first useful FreshRSS result:
read the connected account, create or link FreshRSS-linked feeds, import a
bounded set of recent articles, persist opaque bindings, and report what
happened while preserving all local organization and lifecycle rules.

**Blocked by:** 02: Connect FreshRSS securely and establish a scoped sidecar.

**Status:** implemented

- [x] **Sync now** enters through one FreshRSS sync coordinator and acquires the
      shared data-sync lease before committing feed, article, or sidecar state.
- [x] The cycle reads FreshRSS subscription, tag, item-ID, and item-content
      responses through a typed protocol boundary with one request in flight.
- [x] All remote subscription, stream, tag, and article identifiers are stored
      and compared as opaque remote references.
- [x] An unbound subscription links to exactly one local feed with the same
      canonical feed URL, creates a new local feed when no match exists, and
      reports multiple matches without guessing.
- [x] A newly created FreshRSS-linked feed receives its initial title and flat
      category placement from FreshRSS.
- [x] A previously linked feed retains its local folder placement, retention,
      templates, tags, refresh configuration, and saved-note behavior.
- [x] Imported articles use existing content-shard, merge, deduplication,
      rendering, and retention behavior while retaining exact remote article
      bindings in the sidecar.
- [x] A complete subscription response that omits an earlier remote
      subscription never deletes the local feed or its articles.
- [x] Remote article absence is never interpreted as local deletion.
- [x] The initial bounded read records a partial result when a continuation or
      budget proves that more data exists; it never treats one page as complete
      merely because the first page was persisted.
- [x] Checkpoints advance only for a fully completed bounded read and successful
      local writes; partial or failed reads retain the prior checkpoint.
- [x] A manual cycle persists one safe durable outcome, refreshes relevant views
      once, and shows one summary notice without leaking response or secret
      material.
- [x] Local-only feeds and articles remain untouched by the cycle.
- [x] Mocked coordinator tests assert the request transcript and resulting
      content shards, user state, sidecar bindings, outcome, and view behavior.
- [x] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.

## Implementation notes

- Sidecar bumped to `FRESHRSS_SIDECAR_VERSION = 2`
  (`src/services/freshrss-sidecar-repository.ts`), adding `feedBindings`,
  `articleBindings`, and `checkpoints` alongside the existing
  `pendingFacetMutations`. A v1 file is quarantined like any other
  unrecognized shape — safe, since no code has ever written anything but an
  empty `pendingFacetMutations` into a v1 file.
- Linkage lives entirely in the sidecar; `Feed`/`FeedItem` gained no new
  fields. A newly created FreshRSS-linked feed is marked
  `excludeFromRefresh: true` so the existing XML refresh path never
  double-manages it.
- New `src/services/freshrss-sync-client.ts` (subscription/tag/item-ID/item-
  content, one request per call) and
  `src/services/freshrss-sync-coordinator.ts` (link-or-create, bounded
  import, persistence, bindings/checkpoints, outcome). The coordinator works
  on in-memory clones of feeds/bindings/checkpoints and only commits them
  (one `saveSettings()` call, one sidecar write, one view refresh) once the
  cycle finishes — a mid-cycle authentication rejection discards the clones
  and persists nothing.
- `main.ts` gained `syncFreshRssNow()` (mirrors `testFreshRssConnection()`'s
  shape) and a "Sync now" button in the FreshRSS settings tab.
- Full session invalidation / one-shot reauthentication / authentication-pause
  state from `docs/plans/224-freshrss-capability-credential-ux.md` is
  intentionally **not** implemented here — none of the 15 acceptance items
  require it, and it isn't listed as this ticket's scope. A mid-cycle
  auth rejection is reported through the existing `"credentials-rejected"`
  status instead of inventing a new state.
- **Residual risk:** the Google-Reader-API-compatible endpoints
  (`subscription/list`, `tag/list`, `stream/items/ids`,
  `stream/items/contents`) are implemented and tested against a scripted
  fake HTTP client only — this has not been verified against a live FreshRSS
  server.
