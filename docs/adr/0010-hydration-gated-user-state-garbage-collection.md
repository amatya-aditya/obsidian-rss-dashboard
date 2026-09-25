# ADR 0010: Hydration-gated user-state garbage collection

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-20

## Context and problem

Shard storage v2 keeps article state — read, starred, tagged, saved, and playback state — in `user-state.json`, separate from each feed's shard file. When an article is permanently pruned from its feed, its state remains in `user-state.json`. State for permanently pruned articles must not remain indefinitely, or the file grows without bound in long-lived vaults.

Removing that state safely is harder than it looks. An article can be absent from memory for reasons that do not mean it is gone: its shard file may be missing, corrupt, or not yet synced to this device. Deleting state on any of those signals would erase a user's reading history for articles that still exist.

The same trap exists one level up, for whole feeds. `user-state.json` is shared by every device syncing the vault, but a device's feed list can lag or differ from the one that wrote it: the file can arrive before its sibling `data.json`, or a backup or bundle can restore an older feed list. Removing state for every feed absent from the saving device's feed list erased another device's state on its next save ([GitHub Issue #374](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/374)).

We needed a rule for when article state may be removed that bounds storage growth without treating an unavailable shard, or an unfamiliar feed, as proof of deletion.

## User stories

The decision is intended to preserve these core user expectations:

1. As a long-term RSS Dashboard user, I want state for permanently pruned articles to expire, so that `user-state.json` remains bounded.
2. As a user whose shard has not synced to this device yet, I want my article state preserved, so that opening the plugin cannot erase it.
3. As a user who restarts the plugin, I want hydration proof re-established by a fresh shard read, so that stale prior-session knowledge cannot authorize cleanup.
4. As a user whose devices briefly disagree about my feed list, I want a device to keep state for feeds it doesn't know, so that one device cannot erase another's reading history.

For a complete list of all 14 user stories that were identified, visit [GitHub Issue #315](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/315).

## Decision

State for an article that has disappeared from its feed is removed only after validated feed data from the current session shows the article is gone, and only after a 90-day horizon. A shard that is missing or unhealthy never counts as evidence.

### Safety condition: hydration proof

A successful, structurally validated shard read establishes an in-memory hydration proof for that feed until the plugin session ends. A valid empty shard is authoritative. Missing, corrupt, parser-refreshed, repaired, and locally written shards do not establish proof.

### Removal horizon

State absent from a proved shard is retained for 90 days, then removed on a later normal state save. If the article reappears in a later proved shard, its marker is cleared and its state is retained. Legacy bare-GUID state can be attributed only by a proved shard and follows the same 90-day horizon while unattributed.

The existing feed-qualified state values are retained; only compact lifecycle metadata is added to record when state was first found missing or unattributed.

### Feed-level removal

Only an explicit feed removal on this device — deleting or unsubscribing a feed, singly, by folder, or all at once — removes that feed's state immediately. The removal is remembered in memory for the current session and applied on the next state save; it is not persisted.

State for any other feed absent from the device's feed list is unrecognized, not deleted. It is retained for the same 90-day horizon and removed on a later normal state save. If the feed reappears in the device's feed list first, its marker is cleared and its state is retained. Replacing the feed list by importing a bundle, a legacy `data.json`, or a preferences file that includes feeds, which is also how a backup is restored, is not an explicit removal, so state for feeds it drops follows the horizon and matches again if those feeds return.

### Unchanged behavior

An unreadable `user-state.json` is never overwritten. Cross-device write-race resolution remains outside this decision and belongs to Sync V3.

## Consequences

### Benefits

- Long-lived vaults no longer accumulate state for articles that have been permanently removed, while missing or unhealthy shard files remain safe.
- The cleanup horizon is automatic and consistent across read, starred, tagged, saved, and playback state; it adds no setting, command, notice, or scheduler.

### Existing users and data

- The proof is intentionally session-scoped so stale knowledge from a previous session cannot authorize deletion.
- Existing article state values are kept as stored; the format adds lifecycle metadata alongside them.
- Legacy bare-GUID state is not discarded on upgrade; it waits for a proved shard to attribute it, or expires after the same 90-day horizon.
- An unreadable `user-state.json` is left untouched rather than overwritten.
- A device running a plugin version older than this decision still removes state for every feed it doesn't know. Every device sharing the vault must be updated for the feed-level protection to hold.

### Trade-offs

- If a feed removal loses a race — another device saves before the removal syncs and writes the feed's state back — that state lingers for up to 90 days instead of disappearing at once.
- A removal made just before the plugin unloads, with no state save in between, falls back to the horizon.

## Considered options

### Delete state whenever it is absent from memory

Rejected because missing, corrupt, unsynced, and retention-pruned shards are not deletion evidence.

### Use the last successful proof across restarts

Rejected because a stale proof could erase state before a shard arrives through sync.

### Add a user-configurable horizon or cleanup control

Rejected because the lifecycle is a storage invariant and should not add configuration burden.

### Resolve cross-device write races here

Rejected because that is Sync V3 scope and would broaden this focused change.

### Hydration-gated removal after a fixed horizon

Chosen. Only a validated shard read in the current session can start the 90-day horizon, so state is removed only on positive evidence.

### Remove state for every feed absent from the device's feed list

Rejected for the same reason as removing state absent from memory: a device that has never seen a feed, or has an older feed list, is not evidence the feed was removed (#374).

### Shared feed-removal tombstones in `user-state.json`

Rejected. Recording each removal in the shared file would stop another device from writing removed state back, but it adds format and lifecycle work to avoid, at worst, 90 days of leftover state.

### Refuse or back up saves that shrink the file past a threshold

Rejected. Once only explicit removals take effect immediately, a large legitimate shrink such as deleting all feeds would trip the guard, and automatic backup already provides recovery.

### Explicit removal immediately, unrecognized feeds after the horizon

Chosen. It applies the article-level rule to whole feeds: absence alone never authorizes removal, and a deliberate user action takes effect at once.

## Implementation notes

The lifecycle metadata is introduced as version 3 of the `user-state.json` format, which adds three maps:

- `missingSinceByStateKey` records when feed-qualified state was absent from a successfully validated shard.
- `unattributedFirstObservedAtByGuid` records when legacy bare-GUID state was first observed without a validated owner.
- `unrecognizedFeedSinceByFeedId` records when a feed's state was first found without the feed in the saving device's feed list. It is kept separate from `missingSinceByStateKey` so a feed that returns does not carry stale article-level timestamps.

## Related

- [GitHub Issue #315](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/315) — bound `user-state.json` growth with hydration-gated GC
- [GitHub PR #326](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/326) — implementation
- [GitHub Issue #374](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/374) — state lost when devices share `user-state.json` but not their feed list
- [ADR 0004 — Split article state from feed content in Shard storage v2](0004-split-article-state-from-feed-content-in-shard-storage-v2.md) — introduced `user-state.json`
- [ADR 0002 — Configurable retention protections and unread expiration](0002-configurable-retention-protections-and-unread-expiration.md) — the retention rules that prune articles
