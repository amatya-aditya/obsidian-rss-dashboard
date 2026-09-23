# First-Seen Date Fallback for Undated Items

Some proxied feeds (RSS2JSON) omit `pubDate` on individual items. #281/#282
stopped the plugin from inventing a fake `<pubDate>` for these, which fixed
sorting/retention correctness but left undated items sorting to the bottom
and being deleted immediately once auto-delete is enabled — RSS2JSON's own
option (c), deferred from #281 to this decision. #283 adds an opt-in
[[First-seen timestamp]] recorded on every article, used as a fallback
[[Effective date]] when no `pubDate` exists.

## Status

accepted

## Decision

- `FeedItem.firstSeenMs` is stamped **unconditionally** the first time
  `mergeFeedHistoryItems` observes an item, regardless of whether that item
  has a real `pubDate`. It is not proxy-specific: any item lacking a
  parseable `pubDate` at merge time gets the same treatment, since the merge
  function has no visibility into which source produced an item.
- The fallback (`pubDate` → `firstSeenMs` → effective date) is computed by
  one centralized function, consulted at every site that previously read
  `pubDate`/`getPubDateMs` directly for sorting or retention: feed retention
  cutoff and `byNewest` sort, the live article-list insertion sort, and the
  `dedupeAndNormalizeFeedItems` `byNewest` comparator.
- Gated by a global, default-off setting (`useFirstSeenDateFallback`).
  `rss2JsonToRss()` keeps omitting `<pubDate>` from generated XML either way
  — the setting only changes how downstream sorting/retention treats the
  resulting empty `pubDate`, not what proxy XML generation emits.
- A first-seen timestamp does not survive local deletion. If an undated item
  is later removed (by auto-delete or capacity trimming) and the same
  identity reappears in a subsequent fetch, it is stamped again as if newly
  observed — there is no separate "originally first seen" record kept past
  local storage.

## Considered Options

- **Stamp only undated items**: Rejected. It would save one field write on
  dated items, but introduces a two-state field (present vs. absent) whose
  meaning depends on context, for negligible storage cost under the v2
  write path ([ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md)).
  Unconditional stamping is simpler to reason about and leaves the field
  available for unrelated future uses (e.g. a "new to you" indicator).
- **Scope the fallback to proxy-sourced items only**: Rejected.
  `mergeFeedHistoryItems` doesn't know an item's source, and a source-generic
  rule ("no date → use first-seen") is simpler and correctly covers any
  future undated source without new plumbing. It is a no-op for the native
  parser path, which already synthesizes a `pubDate` at parse time.
- **Leave call sites with their own fallback logic**: Rejected. Retention,
  live sort, and dedup ordering must agree on the same effective date, or
  the same toggle would produce visibly inconsistent orderings depending on
  which code path touches an item first.
- **Treat first-seen as permanent across deletions**: Rejected — would
  require persisting a tombstone or history record past normal deletion,
  which the storage model doesn't otherwise keep for removed items.

## Consequences

- An undated item's effective date can change across its lifetime only in
  one direction: it resets to a new "now" if the item is deleted and later
  reappears. This is a deliberate simplification, not a bug, should a future
  reader notice a first-seen timestamp isn't perfectly stable across all
  circumstances.
- Every stored article now carries a `firstSeenMs` value, including articles
  that have always had a real `pubDate` and never need the fallback.
- Enabling the setting on a vault with pre-existing undated items (written
  before this field existed) backfills `firstSeenMs` lazily, the next time
  each such item is touched by a refresh — not retroactively for items that
  are never refreshed again.
