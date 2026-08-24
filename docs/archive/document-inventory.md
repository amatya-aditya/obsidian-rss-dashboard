# Documentation Migration Inventory

**Inventory date:** 2026-08-24
**Scope:** Markdown documentation under `docs/`, including this record.
**Method:** Classify documents by their present purpose and lifecycle state.

This is the durable audit record for [GH Issue #169](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/169).

## Durable current guidance

Keep the following in their topical `docs/` areas:

- `docs/SECURITY.md`, `docs/storage-vault-shards-guide.md`, `docs/tags-primer.md`, `docs/keyboard-shortcuts.md`, `docs/design/design-spec.md`, and `docs/plugin-scorecard.md`.
- `docs/development/README.md`, `docs/development/auto-deletion.md`, `docs/development/compliance-patterns.md`, `docs/development/data-flow.md`, `docs/development/feed-validation.md`, `docs/development/obsidian-settings-reference.md`, `docs/development/release-notes-workflow.md`, `docs/development/test-lint-backlog-tracker.md`, and `docs/development/test_coverage/testing-guide.md`.

## Public release summaries

Retain all version summaries in `docs/releases/`, including the prepared
`docs/releases/2.6.0.md`. The 2.6.0 document is a draft until release
validation and publication are complete.

## Active and future work

Keep these implementation plans and coordination documents in `docs/plans/`:

- `cover-image-fallback-og-fetch.md` - proposed future work.
- `deprecate-feed-manager-modal.md` - proposed 3.0 work.
- `main-ts-refactor.md` - in progress; no canonical issue or final implementation evidence.
- `media-notes-podcast-video-player.md` - idea awaiting product decisions.
- `public-roadmap.md` and `release-v2.6.0-roadmap.md` - active coordination roadmaps, not archived implementation records.

## Archived implementation plans

### Released in 2.6.0

- `docs/archive/plans/v2.6.0/draft-20260816-development-branch-realignment.md` - completed branch and documentation workflow for GH Issue #165.
- `docs/archive/plans/v2.6.0/166-per-feed-auto-refresh-scheduling.md`, `167-refresh-status-indicators.md`, `168-retry-failed-feeds.md`, `169-documentation-archive-cleanup.md`, and `173-cancel-global-refresh.md`.
- `docs/archive/plans/v2.6.0/175-independent-dashboard-preview-settings.md`, `177-image-preview-disk-cache.md`, `179-cancel-import-discover-fetches.md`, `181-ci-security-hardening.md`, `183-podcast-playlist-windowing.md`, and `185-mark-all-read-unread-controls.md`.
- `docs/archive/plans/v2.6.0/wordpress-latex-image-rendering.md` - implemented; commit evidence is recorded in frontmatter.

### Earlier versioned plans

- `docs/archive/plans/v2.2.0/` - released test coverage work.
- `docs/archive/plans/v2.4.0/` - released vault-watcher, sidebar-selection, and card-image work.
- `docs/archive/plans/v2.4.1/` - released collapsible feed-header work.

### Deferred plans

- `docs/archive/plans/unshipped/mp4-hero-images.md` - deferred after the attempted implementation was reverted on 2026-03-27.

## Historical investigations

The 2026 investigations remain under `docs/archive/investigations/2026/`,
including the 2.3.0 and 2.4.0 audit record sets. They are historical evidence,
not current implementation guidance.

## Archive governance

- `docs/archive/README.md` - searchable archive catalog.
- `docs/archive/document-inventory.md` - this migration audit record.

## Explicit unresolved cases

None. The incomplete `main.ts` refactor remains active rather than being forced
into a historical state. Unknown historical issue URLs remain empty in archived
plan frontmatter; no issue, PR, commit, completion date, or release was inferred.
