# Hydration-gated user-state garbage collection

## Status

accepted

## Decision

Shard storage v2 keeps article state in `user-state.json`, but state for
permanently pruned articles must not remain indefinitely. Version 3 retains the
existing feed-qualified state values and adds only compact lifecycle metadata:

- `missingSinceByStateKey` records when feed-qualified state was absent from a
  successfully validated shard.
- `unattributedFirstObservedAtByGuid` records when legacy bare-GUID state was
  first observed without a validated owner.

A successful, structurally validated shard read establishes an in-memory
hydration proof for that feed until the plugin session ends. A valid empty
shard is authoritative. Missing, corrupt, parser-refreshed, repaired, and
locally written shards do not establish proof. State absent from a proved shard
is retained for 90 days, then removed on a later normal state save. If the
article reappears in a later proved shard, its marker is cleared and its state
is retained. Legacy bare-GUID state can be attributed only by a proved shard
and follows the same 90-day horizon while unattributed.

Configured-feed removal continues to remove feed-qualified state immediately.
An unreadable `user-state.json` is never overwritten. Cross-device write-race
resolution remains outside this decision and belongs to Sync V3.

## Consequences

Long-lived vaults no longer accumulate state for articles that have been
permanently removed, while missing or unhealthy shard files remain safe. The
cleanup horizon is automatic and consistent across read, starred, tagged,
saved, and playback state; it adds no setting, command, notice, or scheduler.
The proof is intentionally session-scoped so stale knowledge from a previous
session cannot authorize deletion.

## Rejected alternatives

- **Delete state whenever it is absent from memory.** Rejected because missing,
  corrupt, unsynced, and retention-pruned shards are not deletion evidence.
- **Use the last successful proof across restarts.** Rejected because a stale
  proof could erase state before a shard arrives through sync.
- **Add a user-configurable horizon or cleanup control.** Rejected because the
  lifecycle is a storage invariant and should not add configuration burden.
- **Resolve cross-device write races here.** Rejected because that is Sync V3
  scope and would broaden this focused change.
