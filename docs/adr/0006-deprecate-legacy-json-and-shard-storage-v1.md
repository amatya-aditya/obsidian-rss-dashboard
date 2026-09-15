# Deprecate Legacy JSON and Shard storage v1

## Status

accepted

## Decision

Legacy JSON and Shard storage v1 are deprecated together. Shard storage v2 is
the single supported feed storage mode.

Both deprecated modes become read-only when 3.0 ships. A vault still on either
mode continues to open and display its articles, but stops writing: no feed
refresh, no starring, tagging, or saving to vault, and no retention
auto-delete. Portable bundle export stays available, so a deprecated vault is
never a trap. Read state may still be marked during a session but is discarded
on quit, and the migration prompt says so.

At 3.0 the v1 and legacy write paths, storage repair, revert-to-legacy, and
their entries in the storage-mode selector are removed. What remains is a
frozen one-way importer that reads a legacy or v1 vault and writes v2. It is
tested once and then does not change, so migration stays possible indefinitely
while live code converges on a single mode.

Warnings begin in 2.7.0 and are staged. Dismissing the prompt defers it to the
next minor rather than silencing it, and after a third dismissal the permanent
dismissal option is withdrawn — the prompt stays visible until the user acts,
though it can still be deferred. The existing
`storageMigrationDismissedPermanently` boolean is replaced by a version-aware
`storageMigrationDismissedUntil`, and that replacement must ship in 2.7.0: it
is what re-reaches users who permanently dismissed the optional v2 upsell under
the old flag and would otherwise meet the cutoff as unexplained breakage.

Warning copy names 3.0 as the trigger and no date — "when 3.0 ships, this will
stop working."

## Considered Options

- **Leave all three modes in place.** Rejected: it commits the project to
  maintaining three storage code paths, their tests, and their interaction with
  every future storage change, indefinitely. The confusion it creates compounds
  with each added mode.
- **Refuse to load a deprecated vault.** Rejected: the plugin must run in order
  to migrate, so a hard load failure strands the user. It also reads as
  breakage rather than as a deliberate change.
- **Read-only enforcement (chosen).** The data stays visible and intact, the
  stop is unmistakable, and nothing more is written into a mode being retired.
- **Delete the v1 and legacy read paths entirely at 3.0.** Rejected: any vault
  that missed the migration window would have no way back. The frozen importer
  preserves the exit without preserving the maintenance burden.
- **Announce a fixed cutoff date, or tie the cutoff to the next release.**
  Rejected. A fixed date cannot be honored, because 3.0 ships when its contents
  are ready rather than on a schedule. "Next release" is worse: it becomes
  false as soon as 3.0 slips, and repeating it across several 2.x releases
  trains users to read the notice as noise. Naming 3.0 as the trigger is vague
  on timing but never becomes untrue.
- **Decouple the cutoff from the rest of 3.0 so it ships on its own schedule.**
  Rejected. A major release is only cut when its contents justify it; the
  deprecation rides with the FreshRSS work and the `minAppVersion` floor raise
  those features require, so that users absorb one disruption instead of three.

## Consequences

Live storage code converges on v2, which is what makes a future storage
generation tractable: the next one is added alongside one supported mode rather
than three.

Because 3.0 is cut when its contents are ready, the cutoff has no date. The
staged prompt is therefore keyed to dismissal count rather than to a known
final pre-3.0 release, since which release that is cannot be known in advance.

Users who dismissed the old prompt permanently are deliberately re-prompted.
That flag was set against an optional upgrade offer; the deprecation is a
different proposition, and honoring the old dismissal through the cutoff would
silently strand exactly the users least aware of the change.

The experimental `replicated-v3` work on `feat/sync-v3` is unaffected. It
remains opt-in and is not a migration target; deprecated vaults migrate to v2,
not to v3.

This decision does not supersede [ADR 0004](0004-split-article-state-from-feed-content-in-shard-storage-v2.md);
it resolves the mode proliferation that ADR named as needing deliberate
resolution rather than indefinite lingering.
