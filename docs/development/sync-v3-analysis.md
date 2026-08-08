# Sync V3 analysis

## Why V2 was unsafe

Obsidian has no public API that says when Obsidian Sync has completed. Obsidian staff explicitly state that there is no published Sync API and warn that third-party synchronization can cause corruption or deletion. See the [forum answer](https://forum.obsidian.md/t/sync-api-way-to-access-syncd-data/25371/20). A watcher or timeout can report a file change, but neither establishes a globally complete sync state.

V2 wrote full JSON snapshots from whichever device happened to save. `user-state.json` was keyed only by article GUID, discarded explicit `false` values, and rewrote the full file after every save. A refresh therefore could persist stale/default state before a remote file arrived. The audit also found 12 GUID collisions across feeds, so one state record could be applied to unrelated articles. V2 shard and metadata repair can likewise overwrite a valid remote projection with a local incomplete snapshot.

## V3 design

V3 uses visible, device-owned files in `rss-dashboard-data/sync-v3`:

```
epoch.json
seed-manifest.json
replicas/<device-id>/config-log.json
replicas/<device-id>/state-0.json … state-f.json
```

The primary writes its config log and seed manifest before it writes `epoch.json`; secondaries only join after a valid epoch exists. Every device writes only under its own replica directory and serializes its own writes. Incoming files are merged rather than copied over local files.

Config mutations are append-only feed upserts, removals, and folder snapshots. Removal tombstones win unless an explicit upsert observes the removal. Article state is keyed by `feedId:guid` (falling back to the article link), so same-GUID items in separate feeds stay independent. Each mutable field carries a hybrid logical clock `(wall time, counter, device ID)`; the highest clock wins, including explicit `read: false`.

Article bodies, refresh timestamps, diagnostics, and device presentation settings are cached in `.rss-dashboard-cache-v3/runtime.json`. Obsidian Sync excludes dot-prefixed paths, so refreshing a feed changes this local cache only. This intentionally separates acquiring content from synchronizing user intent.

## Operations and maintenance

All participating devices must run a V3-capable RSS Dashboard and enable **Sync all other types**; Obsidian documents that JSON files require that setting and that dot-prefixed files/folders are excluded from Sync ([Sync settings](https://obsidian.md/help/sync/settings)). Do not exclude `rss-dashboard-data`.

The Storage screen reports RSS Dashboard replica health, not Sync completion. Invalid or missing foreign replicas are degraded health and must be investigated; they are never grounds for automatic rewrite or deletion. Old V2 files remain untouched, so rollback is recoverable. Obsidian’s own settings merge can favor local JSON keys ([conflict documentation](https://obsidian.md/help/sync/troubleshoot)); V3 avoids depending on that behavior for mutable shared state.

## Current scope and follow-up

The implemented foundation covers convergence of V3 config/state files, local cache refresh isolation, joining, and the status UI. Before a general-release migration, add the tracked confirmation/backup modal, diagnostics export, tests that inject late/duplicated replica delivery, and documentation links listed in the living plan.
