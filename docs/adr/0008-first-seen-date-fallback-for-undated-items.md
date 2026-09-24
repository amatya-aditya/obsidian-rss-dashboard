# ADR 0008: First-seen date fallback for undated items

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-18

## Context and problem

Some proxied feeds (RSS2JSON) omit `pubDate` on individual items. [#281](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/281)/[#282](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/282) stopped the plugin from inventing a fake `<pubDate>` for these, which fixed sorting/retention correctness but left undated items sorting to the bottom and being deleted immediately once auto-delete is enabled.

Option (c) in #281 — a stable, non-declarative fallback such as a first-seen time recorded on the item — was deferred from #281 to this decision. [#283](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/283) adds an opt-in _first-seen timestamp_ recorded on every article, used as a fallback _effective date_ when no `pubDate` exists. Both terms are defined in the [data retention and article lifecycle glossary](../../CONTEXT.md#data-retention-and-article-lifecycle).

## Decision

RSS Dashboard records when it first observes each article. When the user opts in, that first-seen timestamp becomes the article's effective date for sorting and retention whenever it has no publish date.

- `FeedItem.firstSeenMs` is stamped **unconditionally** the first time `mergeFeedHistoryItems` observes an item, regardless of whether that item has a real `pubDate`. It is not proxy-specific: any item lacking a parseable `pubDate` at merge time gets the same treatment, since the merge function has no visibility into which source produced an item.
- The fallback (`pubDate` → `firstSeenMs` → effective date) is computed by one centralized function, consulted at every site that previously read `pubDate`/`getPubDateMs` directly for sorting or retention: feed retention cutoff and `byNewest` sort, the live article-list insertion sort, and the `dedupeAndNormalizeFeedItems` `byNewest` comparator.
- Gated by a global, default-off setting (`useFirstSeenDateFallback`). `rss2JsonToRss()` keeps omitting `<pubDate>` from generated XML either way — the setting only changes how downstream sorting/retention treats the resulting empty `pubDate`, not what proxy XML generation emits.
- A first-seen timestamp does not survive local deletion. If an undated item is later removed (by auto-delete or capacity trimming) and the same identity reappears in a subsequent fetch, it is stamped again as if newly observed — there is no separate "originally first seen" record kept past local storage.

## Consequences

- An undated item's effective date can change across its lifetime only in one direction: it resets to a new "now" if the item is deleted and later reappears. This is a deliberate simplification, not a bug, should a future reader notice a first-seen timestamp isn't perfectly stable across all circumstances.

### Existing users and data

- Every stored article now carries a `firstSeenMs` value, including articles that have always had a real `pubDate` and never need the fallback.
- Enabling the setting on a vault with pre-existing undated items (written before this field existed) backfills `firstSeenMs` lazily, the next time each such item is touched by a refresh — not retroactively for items that are never refreshed again.

## Considered options

### Stamp only undated items

Rejected. It would save one field write on dated items, but introduces a two-state field (present vs. absent) whose meaning depends on context, for negligible storage cost under the v2 write path ([ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md)). Unconditional stamping is simpler to reason about and leaves the field available for unrelated future uses (e.g. a "new to you" indicator).

### Scope the fallback to proxy-sourced items only

Rejected. `mergeFeedHistoryItems` doesn't know an item's source, and a source-generic rule ("no date → use first-seen") is simpler and correctly covers any future undated source without new plumbing. It is a no-op for the native parser path, which already synthesizes a `pubDate` at parse time.

### Leave call sites with their own fallback logic

Rejected. Retention, live sort, and dedup ordering must agree on the same effective date, or the same toggle would produce visibly inconsistent orderings depending on which code path touches an item first.

### Treat first-seen as permanent across deletions

Rejected. It would require persisting a tombstone or history record past normal deletion, which the storage model doesn't otherwise keep for removed items.

## Related

- [GitHub Issue #283](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/283) — opt-in first-seen date for undated proxy items
- [GitHub Issue #281](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/281) and [GitHub PR #282](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/282) — stop fabricating `pubDate` for undated RSS2JSON items
- [ADR 0002 — Configurable retention protections and unread expiration](0002-configurable-retention-protections-and-unread-expiration.md) — the retention rules the effective date feeds into
- [ADR 0006 — Deprecate Legacy JSON and Shard storage v1](0006-deprecate-legacy-json-and-shard-storage-v1.md)
- [Glossary: Data retention and article lifecycle](../../CONTEXT.md#data-retention-and-article-lifecycle)
