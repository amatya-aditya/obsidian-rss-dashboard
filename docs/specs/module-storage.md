---
id: module-storage
type: submodule-design
status: draft
title: Service area — storage and user state
parent: architecture
---

# Service area — storage and user state

## Responsibility

Persist and hydrate the plugin's persisted model across three storage modes,
merge a synced metadata file against a device-local ancestor, and keep article
user state durable, journaled, and garbage-collected safely.

Entry points: `FeedStorageRepository`, `hydrateFeedStorage` / `persistFeedStorage`
(`feed-storage-runner.ts`), `FeedStorageShard`, `shard-baselines`,
`own-write-record`, `metadata-location`, `storage-json`,
`storage-bundle-parsers`, `UserStateStore`, `UserStateJournal`,
`ArticleStateJournal`, `SavedArticleAssociationService`. `SettingsStore`
belongs to [the shared kernel](./module-shared-kernel.md); this area owns the
shard and user-state machinery it calls.

## Boundary

It calls portability (the OPML backup path) and utils; it must not import any
UI module. Its two mutual edges — storage ↔ user state and storage ↔
portability — are intentional and stay acyclic at file level: no runtime
service cycle exists today.

## Invariants

- **Positive evidence only.** Article state is removed on a validated shard
  read or an explicit feed removal, never on absence alone
  ([ADR 0010](../../docs/adr/0010-hydration-gated-user-state-garbage-collection.md)).
- **The journal is device-local** and lives outside the metadata folder, with
  per-device checkpoints (schema v5). It is the merge input, not a synced
  artifact.
- **Change detection is by content, never by timing** (`own-write-record`),
  and shard baselines are deferred until a save asks for them.
- **Settings sync is a three-way merge** against a device-local ancestor of
  content hashes; only feeds and folders merge per entry
  ([ADR 0036](../../docs/adr/0036-merge-a-synced-data-json-against-an-ancestor.md),
  [ADR 0027](../../docs/adr/0027-merge-imported-settings-one-group-deep.md)).
  An ancestor is seeded only on a device's first load.
- **Article-state writes are batched on a fixed window**: a 2 s flush that is
  not restarted by later changes, a 25-change threshold, and 500 ms coalescing
  for playback progress. A write path that bypasses the queue breaks the
  flush contract.
- Storage placement follows the mode: Shard v2 keeps per-feed content shards
  plus a separate `user-state.json`
  ([ADR 0004](../../docs/adr/0004-split-article-state-from-feed-content-in-shard-storage-v2.md)).

The concrete modes and their file layout are in
[the feed data lifecycle](../development/data-flow.md).

## Known gaps

Storage is mid-migration: `legacy-json`, `vault-shards`, and `vault-shards-v2`
are all live, and ADR 0006 freezes the first two read-only for 3.0 with a
one-way importer. Any persistence change must hold in every mode until that
lands.
