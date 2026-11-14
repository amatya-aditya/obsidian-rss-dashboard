---
id: module-feed-ingestion
type: submodule-design
status: draft
title: Service area — feed ingestion and refresh
parent: architecture
---

# Service area — feed ingestion and refresh

## Responsibility

Turn a URL into stored articles: fetch the document, route it by format, build
`FeedItem`s, merge them with local history, apply retention, and orchestrate
single-feed, batch, and scheduled refreshes. Also the bulk paths that bring
feeds in: Discover, OPML import, and background import of newly added feeds.

Entry points: `FeedParser.parseFeed()` (`feed-parser/feed-parser-class.ts`),
`fetchFeedXml` (`feed-parser/feed-fetch.ts`), `routeFeedDocument`
(`feed-parser/xml-parser/feed-document-router.ts`),
`mergeFeedHistoryItems` / `applyFeedRetentionLimits`
(`feed-parser/feed-retention.ts`), `FeedRefreshRunner`,
`FeedRefreshScheduler`, `FeedSubscriptionService`, `BackgroundImportService`,
`FolderService`.

## Boundary

It calls the shared kernel (settings, the operation lock, timeouts and the
fetch semaphore), portability (OPML parsing), integrations (YouTube
resolution, inherited tags), and utils. It persists through the settings
store's save callback rather than writing shards itself. It never imports a
view, component, modal, or settings module.

`feed-parser/feed-retention.ts` is also the de-facto item-identity and date
kernel: 13 non-service modules import it directly, so a change there is a
change to item identity everywhere.

## Invariants

- Merge preserves local state. An item matched by guid keeps its `read`,
  `starred`, `saved`, `tags`, and `savedFilePath`; only content fields come
  from the remote. A refresh never resets reading history.
- Retention runs twice, both before persistence: `collectCarriedForwardItems`
  (`feed-parser/feed-item-builder.ts`) drops unprotected carry-forward items
  past the cutoff, then `applyFeedRetentionLimits` applies both the age and the
  count rule. Protection is `isProtectedItem` against the global protection
  settings.
- One settings persist per refresh batch, after every feed settles; one
  announcement per batch, never per feed
  (`refresh-announcements.ts`). The refresh runner and the subscription
  service do raise `Notice`s for user-facing failures — that feedback is part
  of their contract, not a facade concern.
- One refresh lock covers every multi-feed refresh. A new user-started global
  operation is refused with a notice; a scheduled one waits.
- The next due time is computed in memory from `lastRefreshAttemptCompletedAt`
  and the effective interval — never persisted. `lastGlobalRefreshCompletedAt`
  advances only for a complete eligible-set refresh. A changed feed URL starts
  a new refresh identity and clears completion and error history.
- Two error kinds stay separate on the feed: `lastFetchError` (refresh) and
  `importError` + `importStatus` (background import).

The merge, retention, and scheduling behavior is traced in
[the feed data lifecycle](../development/data-flow.md).
