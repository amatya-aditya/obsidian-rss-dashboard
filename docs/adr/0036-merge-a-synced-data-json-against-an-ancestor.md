# ADR 0036: Merge a synced data.json against an ancestor

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

proposed

## Date

2026-10-21

## Context and problem

When two devices share one vault through Obsidian Sync, each keeps its own copy
of `data.json`, which holds the settings, the feed list and the folder
organization. Sync treats a `.json` file in a visible folder as one opaque file:
the device that uploads last replaces the other's file whole. It makes no key
merge and creates no conflict file, even with "Create conflict file" turned on.

The plugin already guards one direction of this. A local save no longer writes
over a synced change it has not loaded (#1431), and when both sides changed the
feeds or folders it merges them per entry (#1449). The other direction is still
open. If device A renames feed X and device B renames feed Y while they are
apart, B's file replaces A's after both resume. By then A has saved, so A's last
written state and A's memory are the same, and the incoming file reads as pure
remote change. A adopts it whole and X is back to its old name, with no message.
The first Real Sync pass reproduced this twice: two different feeds renamed (the
later upload won whole) and one feed renamed on both devices (the later upload
won, though its edit was older). The evidence is in the run 2 section of the
probe ledger on #1430. The losing edit is unrecoverable from the plugin's last
written state, because that state moves forward on every local save.

This is a data-loss path for edits made on two devices while apart, so the way it
is resolved has to be a durable rule that later sync work follows.

## Decision

Keep a device-local **ancestor** of `data.json`: the state this device last knew
to be shared (see [Ancestor](../../CONTEXT.md)). When a delivered `data.json`
would replace the settings in memory, merge it with this device's own edits per
entry, using the ancestor to tell which side changed what, instead of adopting it
whole.

- **What the ancestor holds.** Per-entry content hashes (feed id, folder path,
  settings group), compared with the same normalisation as an own write: key order,
  `_syncNonce` and `_syncPad` are ignored. It holds no feed titles or URLs. It
  lives in Obsidian's device-local storage, keyed by vault, and never in the vault
  or the plugin folder, which can sync.
- **When it advances.** Only when an external `data.json` is loaded, to the state
  that file held. A local save does not advance it, and neither does a delivery
  that changes only a shard. With no ancestor, the delivery wins whole, as before,
  and the ancestor is seeded from it.
- **The merge.** An entry changed on one side only takes that side. If both sides
  edited the same entry, the delivery wins and the discarded local value is logged
  by entry id. If one side edited an entry and the other deleted it, the edit
  wins, logged by id.
- **Order.** When the delivery wins its conflicts, the delivered order of feeds
  and folders is the skeleton, and an entry only this device holds returns beside
  the neighbour it had here. Both devices then settle on one order. A change of
  order alone is not tracked per entry.
- **Bookkeeping.** Settings every device rewrites on its own refresh or launch
  (`lastRefreshTimestamp`, `lastGlobalRefreshCompletedAt`, `lastShownVersion`)
  take the delivered value without a report or a Notice, since no edit was lost.
- **Reporting.** The merge writes to `storageLog` by entry id and never logs
  values. A same-entry conflict that discards a local value also shows one short
  Notice with no values.
- **Scope.** `data.json` only. Shards, `user-state.json` and the Legacy JSON and
  Shard v1 modes are not covered.

## Consequences

### Benefits

- An edit made on one device survives a save on another, for everything except a
  same-entry conflict.
- No change to the `data.json` format, so devices on different plugin versions
  still read each other's files.
- The ancestor stores hashes, so it stays small however many feeds exist and
  leaks no feed content.

### Trade-offs

- A same-entry conflict still loses one edit. Without a clock shared between
  devices there is no way to pick the newer edit, so the rule is "the delivery
  wins", which matches Sync's own last-uploader result.
- The ancestor cannot tell a deliberate revert from "never saw it". If device B
  sees A's rename and renames the feed back, A keeps its rename. If B deletes a
  feed after seeing A's edit, A's edit resurrects it. The merge errs toward
  keeping data.
- A delivery that arrives while Obsidian is closed is not recovered, because
  restoring the local value would need a full device-local copy of the last
  written file.
- Two merge rules coexist: the delivery wins for a same-entry conflict here,
  while memory wins in #1431 and #1449 when a local save meets an unseen
  delivery.

### Existing users and data

- No migration. With no ancestor the first delivery after upgrading wins whole,
  as it does today, and seeds the ancestor.

## Considered options

### Option A — A local record of changes saved but not yet seen

Keep a list of this device's saved changes and replay it when a delivery
arrives. Rejected: the plugin cannot know when another device has seen a change,
so it cannot decide when to drop an entry, and a replay can overrule a real edit
made elsewhere.

### Option B — Per-entry modified stamps in `data.json`

Stamp each entry and let the newest stamp win. This would resolve same-entry
conflicts and tell a revert from a missed edit. Not chosen: it changes the
`data.json` format, #1439 ruled that out of scope, and it needs a clock the
devices share. It remains the way to remove the trade-offs above if the format is
ever opened up.

### Option C — Three-way merge against a device-local ancestor (chosen)

Needs no format change, recovers the common case, and fails toward keeping data.

### Option D — Memory wins on a same-entry conflict

Matches #1431 and #1449. Rejected for this path: each device then keeps its own
value against the other's delivery, saves, and uploads, so the two files overwrite
each other indefinitely. One rule that resolves the same way on both devices
converges in one round.

## Historical precedent

- [ADR 0010](0010-hydration-gated-user-state-garbage-collection.md): absence
  alone never authorizes removal, which is why an edit beats a delete here.
- [ADR 0027](0027-merge-imported-settings-one-group-deep.md): the import-side rule
  that a merge keeps what the other side did not change.

## Implementation notes

- The merge belongs where `loadSettings()` would replace memory with the delivered
  file, and it has to include any save still queued. Reuse the per-entry
  machinery in `settings-group-merge.ts`.

## Related

- [ADR 0035 — Test Real Obsidian Sync in the real vault](0035-test-real-obsidian-sync-in-the-real-vault.md)
- [GitHub Issue #1452](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1452)
- [GitHub Issue #1431](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1431)
- [GitHub Issue #1439](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1439)
- [GitHub Issue #1430](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1430)
