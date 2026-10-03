# ADR 0005: Split the portable data bundle into a Feed bundle and a Settings bundle

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-12

## Context and problem

The portable data bundle (`PortableDataBundle`, `src/types/types.ts:586`) is the plugin's only structured export/import format beyond OPML. It bundles the entire settings object (`metadata`, including `folders` and `availableTags`) together with every feed's shard file (`shards`, including full per-article state — read, starred, tags, saved, playback progress) as one all-or-nothing unit. It is exposed identically, and duplicated, on both the Storage tab and the Import/Export tab.

This single bundle currently serves two distinct motivations with no way to tell them apart:

- **Bug-protection backup**: recovering from data loss caused by a plugin update, which is also why auto-backups exist (`src/services/backup-service.ts`).
- **Portability as an escape hatch**: a stated product value for a local-first, privacy-first plugin — letting a user move or extract their data without depending on any server.

A user who only wants one of these (e.g. sharing a subscription list without their read history, or resetting settings without touching feeds) currently has no bundle-level option; the only state-free path is OPML (feeds/folders only, no settings, no state), and the only settings-scoped path (`usersettings.json`) inconsistently excludes `folders`/`availableTags` from "settings" while the portable bundle's `metadata` field includes them.

## Decision

Split the portable data bundle into two independently exportable and importable pieces:

- **Feed bundle**: feeds, folders, tags, articles, and article state. No app settings.
- **Settings bundle**: app preferences only (display, retention, storage config, auto-backup, etc.). No feeds, folders, tags, or articles.

"Portable data bundle" remains the name for Feed bundle + Settings bundle together — i.e. everything, equivalent to today's single bundle.

Scope constraints for this split:

- No further granularity: no per-feed selection, no separate toggle to exclude article state from the Feed bundle. The state-free, feed-only case is already served by OPML, which remains a separate, orthogonal export path.
- Folders and tags move to the Feed bundle (not the Settings bundle), correcting the inconsistency between today's `usersettings.json` and the portable bundle's `metadata`.
- All three JSON buckets (Portable data bundle, Feed bundle, Settings bundle) get symmetric import as well as export — an export that can't be imported back isn't a usable backup.
- No platform restriction (desktop vs. mobile): there is no usage data suggesting mobile-only users are rare enough to justify gating a stated core value behind platform.

The technical hierarchy (two toggles, four valid outcomes) and a plain-language decision tree intended for a future settings-tab modal were worked out with the maintainer; see the [implementation plan for #254](../archive/plans/v2.7.0/254-export-bundle-hierarchy.md) for both, written out in full.

## Consequences

- The existing "Import/Export shard data" (now "Import/Export portable data bundle") buttons on the Storage tab and Import/Export tab keep working unchanged until this is implemented; this ADR does not itself change behavior.
- The duplicated bundle controls across the Storage tab and Import/Export tab remain duplicated; deduplicating them is separate follow-up work, not bundled into this decision.
- Implementing this requires: a `FeedDataBundle` and `SettingsBundle` type/format (or a `scope` field on `PortableDataBundle`), corresponding import validation, and UI for selecting a scope — tracked in the [implementation plan for #254](../archive/plans/v2.7.0/254-export-bundle-hierarchy.md) (child tickets under [GitHub Issue #254](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/254)).
- `usersettings.json`'s current behavior (excluding `feeds`/`folders`/`availableTags`) becomes the correct shape for the new Settings bundle rather than an inconsistency to fix later.

## Considered options

### Keep one all-or-nothing bundle (status quo)

Rejected. It conflates backup and sharing/portability use cases that want different content, and forces folders/tags into an arbitrary bucket depending on which existing export path is used.

### Add fine-grained selection (per-feed, per-state-field toggles)

Rejected for now. There is no evidence of demand beyond the two-way split, and OPML already covers the "just my subscriptions, no state" case. Revisit if a concrete use case (e.g. selective feed sharing) surfaces.

### Split into Feed bundle + Settings bundle

Chosen. Matches the two motivations actually in evidence (bug-protection backup wants everything; portability/sharing sometimes wants less) without inventing granularity nobody has asked for.

## Related

- [GitHub Issue #254](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/254) — split portable data bundle into Feed bundle + Settings bundle
- [Implementation plan for #254](../archive/plans/v2.7.0/254-export-bundle-hierarchy.md) — export hierarchy, decision tree, and child tickets
- [ADR 0004 — Split article state from feed content in Shard storage v2](0004-split-article-state-from-feed-content-in-shard-storage-v2.md) — the shard format the Feed bundle carries
