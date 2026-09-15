---
status: proposed
created: 2026-09-15
issue: ""
milestone: ""
owner: unassigned
workstream: "storage"
sequence: null
depends_on: [278]
release_requirement: ""
implementation: ""
---

# Shard storage v2 sync mitigations

**Conditional plan.** Every item here is a partial substitute for something
Sync V3 ([#274](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/274))
does properly. Do this work only if V3 slips far enough that v2 remains the
only sync-capable mode for another release cycle or more. If V3 lands, close
this plan unimplemented.

Distinct from [#278](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/278),
which fixes outright correctness bugs and is **not** conditional.

## Problem

v2's cross-device failure is structural: every device rewrites shared files
from its own in-memory state, and no API reports when Obsidian Sync has
delivered another device's change. That cannot be closed within v2. It can be
narrowed.

## Candidate mitigations

### 1. Merge-on-write for `user-state.json`

Today the write is `adapter.write(path, JSON.stringify(...))` built entirely
from memory, with no read of the existing file. Re-reading the on-disk file
immediately before writing and merging the local delta into it would convert
silent total loss into loss only when two writes genuinely interleave inside
the read-merge-write window.

Depends on `DataSyncLease` (`src/services/data-sync-lease.ts`, currently on
`feat/fresh-rss`): a read-merge-write is only safe if it is atomic against
other in-process writers, so this naturally sequences with or after the
FreshRSS merge rather than before it.

Best effort-to-benefit ratio of the three.

### 2. Refresh write-path isolation

A feed refresh currently writes synced shard files, so routine fetching
generates sync traffic and conflict surface even when the user changed nothing.
`withSyncNonce` additionally pads every write with 1–2KB to force sync tools to
notice the change. Routing refreshed content to a local, unsynced cache would
shrink the conflict window to actual user actions.

This is a direct partial adoption of V3's Phase 3, and is the item most likely
to be wasted effort if V3 lands.

### 3. Orphan shard reconcile

The Phase 0 audit found 31 shard files with no matching configured feed.
`repairVaultShards` regenerates shards from current feed data but does not
detect or report orphans. A reconcile pass comparing shard filenames against
configured feed IDs would surface them.

Lowest risk and smallest of the three; also the least urgent, since orphans
waste space rather than corrupt state.

## Out of scope

**Intercepting Obsidian Sync conflict files.** Obsidian Sync can be configured
to auto-merge or to write conflict files, and in principle the plugin could
detect a conflict file and reconcile from it. Rejected on three counts:

- It is reactive — the conflict file only appears *after* state was already
  lost, so it cannot prevent the loss.
- It depends on a user-toggleable setting, so it cannot be relied on to exist.
- Parsing another tool's conflict artifacts is brittle and would couple the
  plugin to undocumented behavior.

The existing explanation — that no sync-completion API is available — remains
the honest answer. Recorded here and on #274 so it is not re-litigated.
