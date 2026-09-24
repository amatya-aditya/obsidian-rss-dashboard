# ADR 0004: Split article state from feed content in Shard storage v2

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-12

## Context and problem

Shard storage v1 (introduced in v2.3.0) writes one file per feed containing both feed content and each article's state (read, starred, tags, saved, playback progress).

Article state changes far more often than feed content. When two devices sync the same shard file, they therefore frequently produce conflicting writes even though the underlying content hasn't changed. The conflicts are structural: state and content are interleaved in one file.

## Decision

Shard storage v2 (v2.4.0-beta.3) splits article state from feed content. Feed content stays in the per-feed shard file, and all article state moves into a single separate `user-state.json`, so the high-churn data no longer collides with the stable data on every sync pass.

## Consequences

Three feed storage modes now coexist — Legacy JSON, Shard storage v1, and Shard storage v2 — each with different sync robustness, which is exactly the kind of proliferation a future ADR or v1 deprecation would need to resolve deliberately rather than by letting v1 linger indefinitely. That resolution was later recorded in [ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md).

This decision is not necessarily final: a `sync-v3` branch is under active development and testing, aiming to improve cross-platform syncability further than v2 does. The cross-platform sync challenges that motivated this split are documented in more detail elsewhere in the codebase and the README; if sync-v3 lands, it may supersede this ADR, and this one should be updated with a `superseded` status at that point rather than left silently outdated.

### Existing users and data

Shard storage v2 is opt-in and backwards compatible with v1 via auto-migration, so existing v1 users aren't forced to move immediately.

**Later development:** [ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md) deprecates Legacy JSON and Shard storage v1, which ends v2's opt-in status. From 2.7.0, users still on either older mode see a staged prompt to migrate to v2. When 3.0 ships, those modes become read-only, and a one-way importer to v2 remains available. ADR 0006 does not supersede this decision. The state/content split recorded here remains in force, and v2 becomes the single supported feed storage mode.

## Considered options

### Keep the v1 shape and rely on sync-tool-level conflict resolution

Rejected. The conflicts are structural (state and content interleaved in one file), not something a sync tool's merge strategy can reliably fix.

### Split state from content into two files

Chosen, as Shard storage v2: opt-in and backwards compatible with v1 via auto-migration.

## Related

- [ADR 0006 — Deprecate Legacy JSON and Shard storage v1](0006-deprecate-legacy-json-and-shard-storage-v1.md) — resolves the storage-mode proliferation described above
- [ADR 0010 — Hydration-gated user-state garbage collection](0010-hydration-gated-user-state-garbage-collection.md) — lifecycle of state held in `user-state.json`
- [Vault Shards storage guide](../storage-vault-shards-guide.md) — user documentation for the storage modes
- [Syncing across devices](../syncing.md) — user documentation for multi-device sync
