---
id: module-shared-kernel
type: submodule-design
status: draft
title: Service area — shared kernel (settings, operations, protocol)
parent: architecture
---

# Service area — shared kernel (settings, operations, protocol)

## Responsibility

Own the pieces every other area receives by constructor injection. This area
owns `SettingsStore` — the settings object, its three-way merge, and its single
save path — because every area needs it and none may own it alone; the shard
and user-state machinery it calls belongs to
[the storage area](./module-storage.md).

Entry points: `SettingsStore`, `SettingsAncestorStore` / `settings-group-merge`
(ancestor merge), `FeedOperationTracker` (one global operation), `feed-timeout`
(shared timeout constants), `TagChipRadiusSync`, `UriActionHandler`.

## Boundary

Shared kernel may call the storage area; every other area may call shared
kernel. It must stay free of UI imports and free of area-specific policy: a
new cross-area need belongs here only once two areas already need it —
otherwise it is owned by the area that needs it.

`SettingsStore` is the single write path for settings. A module that mutates
the settings object and saves it elsewhere breaks the merge and ancestor
contract.

## Invariants

- **One global feed operation at a time.** A user-started multi-feed refresh
  is refused while another holds the lock; a scheduled refresh waits.
- **Settings changes go through the store**, which is what makes the
  three-way merge, the journal, and the shard write consistent.
- **No UI dependency.** `settings-store.ts` may not import views, components,
  modals, or settings modules — enforced by `check:architecture`.
- The protocol handler validates the incoming URI before acting on a feed URL.
- `feed-timeout` holds shared constants used by both ingestion and the proxy
  check, so it is a kernel module, not an ingestion detail.

## Known gaps

`SettingsStore` is the largest service file (~1,700 lines) and the main
ratchet pressure point. It holds one persisted model, so splitting it must
follow a real seam; size alone is not a reason to cut it.
