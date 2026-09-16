# Sync V3 implementation plan

Status legend: `pending`, `in progress`, `complete`, or `blocked`. A phase is complete only when its listed checks pass.

## Phase 0 — Baseline and documentation — complete

- [x] Record the absence of a public Obsidian Sync completion API and the V2 failure analysis.
- [x] Preserve the current audit: 72 configured feeds, 103 shard files, 31 orphan shards, 12 cross-feed GUID collisions, and no persisted explicit read values.
- [x] Record the product decisions: concurrent devices, shared config/state only, local article cache, persistent deletion, latest action wins, and a primary migration device.

## Phase 1 — V3 model and TDD foundation — complete

- [x] Add `replicated-v3` storage mode, hybrid logical clocks, replica file types, and feed-qualified article-state keys.
- [x] Add regression tests for publication order, same-GUID isolation, explicit unread transitions, and cache-only refresh writes.
- [x] Use a deterministic `(wall time, counter, device ID)` comparison for ties.

Validation: focused Sync V3 tests pass. TypeScript and platform checks are rerun in Phase 7 after integration changes.

## Phase 2 — Device-owned replicas — complete

- [x] Use the shared layout `rss-dashboard-data/sync-v3/{epoch.json,seed-manifest.json,replicas/<device>/...}`.
- [x] Serialize a device’s writes; no client writes another device’s files.
- [x] Store feed operations in append-only config logs and article fields in independent state buckets.
- [x] Retain deletion tombstones and never remove foreign replica files automatically.

## Phase 3 — Local cache and refresh isolation — complete

- [x] Put runtime content in `.rss-dashboard-cache-v3/runtime.json`.
- [x] Route a V3 refresh to the local cache instead of a shared config/state write.
- [x] Reload incoming replica changes immediately; this is file-driven and does not claim to know when Obsidian Sync is complete.
- [x] Rebuild settings-backed services after an incoming projection is applied.

## Phase 4 — Migration and joining — in progress

- [x] Create a V3 set writes the primary config and manifest before publishing `epoch.json`.
- [x] Joining devices load the existing epoch and do not seed a second shared configuration.
- [x] Require a confirmation and portable backup export before the primary publishes a V3 epoch.
- [ ] Add portable migration diagnostics and a recovery action.

## Phase 5 — Storage UI and docs — in progress

- [x] Add V3 status, device ID, replicas, local cache location, last write/merge, create, and join controls to Settings → Storage.
- [x] Clearly label legacy V1/V2 repair controls as recovery-only.
- [x] Create implementation analysis and a manual walkthrough.
- [ ] Link the final user guide from README and the storage guide.
- [x] Add first-run local/V3 onboarding, document first/additional-device roles, and regress fragment rendering and legacy-only migration prompts.

## Phase 6 — final validation — complete

- [x] Focused V3, lifecycle, refresh, and Storage UI tests.
- [x] Full unit suite: 185 files and 1,598 tests passed on 2026-08-08.
- [x] ESLint, platform check, TypeScript check, and production build passed on 2026-08-08.
- [x] Removed the build-regenerated `styles.css` artifact to preserve the user's explicit deletion.

## Design constraints

- V3 never treats a quiet period, a file watcher, or a refresh as confirmation that Obsidian Sync has completed.
- Only `rss-dashboard-data/sync-v3` is shared. The dot-prefixed cache is intentionally local.
- A refresh never writes subscriptions, folders, or shared article state.
- A `false` user-state field is meaningful and is stored explicitly after a transition.
- No automatic cleanup may delete V2 files, foreign replicas, unmatched state, or tombstones.
