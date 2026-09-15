# Split article state from feed content in Shard storage v2

## Status

accepted

## Decision

Shard storage v1 (introduced in v2.3.0) writes one file per feed containing both feed content and each article's state (read, starred, tags, saved, playback progress). Because article state changes far more often than feed content, two devices syncing the same shard file frequently produce conflicting writes even though the underlying content hasn't changed. Shard storage v2 (v2.4.0-beta.3) splits these: feed content stays in the per-feed shard file, and all article state moves into a single separate `user-state.json`, so the high-churn data no longer collides with the stable data on every sync pass.

## Considered Options

- **Keep the v1 shape and rely on sync-tool-level conflict resolution.** Rejected: conflicts are structural (state and content interleaved in one file), not something a sync tool's merge strategy can reliably fix.
- **Split state from content into two files (chosen).** Accepted as v2, opt-in and backwards compatible with v1 via auto-migration, so existing v1 users aren't forced to move immediately.

## Consequences

Three feed storage modes now coexist — Legacy JSON, Shard storage v1, and Shard storage v2 — each with different sync robustness, which is exactly the kind of proliferation a future ADR or v1 deprecation would need to resolve deliberately rather than by letting v1 linger indefinitely.

This decision is not necessarily final: a `sync-v3` branch is under active development and testing, aiming to improve cross-platform syncability further than v2 does. The cross-platform sync challenges that motivated this split are documented in more detail elsewhere in the codebase and the README; if sync-v3 lands, it may supersede this ADR, and this one should be updated with a `superseded by` status at that point rather than left silently outdated.
