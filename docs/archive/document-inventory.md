# Documentation Migration Inventory

**Inventory date:** 2026-08-16
**Scope:** 72 Markdown documents under `docs/`, including this record.
**Method:** classify by present purpose, document status, changelog/release
evidence, and Git history; leave unknown issue and implementation metadata empty.

This is the durable audit record for [GH Issue #169](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/169). Each listed path is classified below; grouped entries have the same classification and lifecycle state.

## Durable current guidance

**Guidance — keep in topical `docs/` areas:**

- `docs/SECURITY.md`, `docs/storage-vault-shards-guide.md`, `docs/tags-primer.md`, `docs/keyboard-shortcuts.md`, `docs/design/design-spec.md`, and `docs/plugin-scorecard.md`.
- `docs/development/README.md`, `docs/development/auto-deletion.md`, `docs/development/compliance-patterns.md`, `docs/development/data-flow.md`, `docs/development/feed-validation.md`, `docs/development/obsidian-settings-reference.md`, `docs/development/release-notes-workflow.md`, `docs/development/test-lint-backlog-tracker.md`, and `docs/development/test_coverage/testing-guide.md`.

**Public release summaries — retain in `docs/releases/`:**

- `docs/releases/2.1.0.md`, `docs/releases/2.1.1.md`, `docs/releases/2.1.2.md`, `docs/releases/2.1.3.md`, `docs/releases/2.1.4.md`, `docs/releases/2.1.5.md`, `docs/releases/2.1.6.md`, `docs/releases/2.1.7.md`, `docs/releases/2.1.8.md`, `docs/releases/2.1.9.md`, `docs/releases/2.2.0.md`, `docs/releases/2.3.0.md`, `docs/releases/2.4.0.md`, and `docs/releases/2.5.0.md`.

## Active and future work

**Implementation plans — retain in `docs/plans/`:**

- `docs/archive/plans/unreleased/166-per-feed-auto-refresh-scheduling.md` — implemented, awaiting release.
- `docs/archive/plans/unreleased/167-refresh-status-indicators.md` — implemented, awaiting release.
- `docs/plans/168-retry-failed-feeds.md` — blocked by issues #166 and #167.
- `docs/plans/cover-image-fallback-og-fetch.md` — proposed future work.
- `docs/plans/deprecate-feed-manager-modal.md` — proposed 3.0 work.
- `docs/plans/draft-20260816-development-branch-realignment.md` — draft work.
- `docs/plans/main-ts-refactor.md` — in progress; no canonical issue or final implementation evidence.
- `docs/plans/media-notes-podcast-video-player.md` — idea awaiting product decisions.
- `docs/plans/public-roadmap.md` and `docs/plans/release-vnext-roadmap.md` — active coordination roadmaps, not archived implementation records.

## Archived implementation plans

**Released in 2.2.0:**

- `docs/archive/plans/v2.2.0/test-coverage-improvement.md` — implemented; release and commit evidence recorded in frontmatter.

**Released in 2.4.0:**

- `docs/archive/plans/v2.4.0/vault-metadata-watcher.md`
- `docs/archive/plans/v2.4.0/shift-click-range-selection-sidebar.md`
- `docs/archive/plans/v2.4.0/multi-folder-selection-sidebar.md`
- `docs/archive/plans/v2.4.0/rss-card-image-fallback.md`

All four are implemented and have completion, release, and commit evidence in frontmatter.

**Released in 2.4.1:**

- `docs/archive/plans/v2.4.1/collapsible-feed-headers.md` — implemented; issue #149 and commit evidence recorded in frontmatter.

**Implemented but unreleased:**

- `docs/archive/plans/unreleased/169-documentation-archive-cleanup.md` — implemented documentation migration for GH Issue #169.
- `docs/archive/plans/unreleased/wordpress-latex-image-rendering.md` — implemented; commit evidence recorded in frontmatter.

**Deferred:**

- `docs/archive/plans/unshipped/mp4-hero-images.md` — deferred after the attempted implementation was reverted on 2026-03-27.

## Historical investigations

**2026 investigations:**

- `docs/archive/investigations/2026/2.4.1-errors.md`
- `docs/archive/investigations/2026/audit-remediation-2.3.0.md`
- `docs/archive/investigations/2026/coverage-comparison.md`
- `docs/archive/investigations/2026/defuddle-evaluation.md`
- `docs/archive/investigations/2026/final-testing-pr-closeout-checklist.md`
- `docs/archive/investigations/2026/math-rendering.md`
- `docs/archive/investigations/2026/sidebar-visibility-row-compression-regression.md`
- `docs/archive/investigations/2026/substack-cdata-entity-encoding.md`
- `docs/archive/investigations/2026/youtube-shorts-tagging-failure.md`
- `docs/archive/investigations/2026/youtube-watch-progress.md`

**2.3.0 audit record set — historical audit/investigation, not current policy:**

- `docs/archive/investigations/2026/2.3.0-audit/CSS Refactor Prompt Template.md`
- `docs/archive/investigations/2026/2.3.0-audit/[TARGET_FILE.css] — Cleanup, Standardization & Split Plan.md`
- `docs/archive/investigations/2026/2.3.0-audit/\`modals.css\` Refactor Checklist.md`
- `docs/archive/investigations/2026/2.3.0-audit/controls.css — Cleanup, Standardization & Split Plan.md`
- `docs/archive/investigations/2026/2.3.0-audit/css-important-declaration-audit.md`
- `docs/archive/investigations/2026/2.3.0-audit/discover.css — Cleanup, Standardization & Split Plan.md`
- `docs/archive/investigations/2026/2.3.0-audit/discover-sidebar.css — Cleanup, Standardization & Split Plan.md`
- `docs/archive/investigations/2026/2.3.0-audit/remediate-direct-filesystem-access.md`
- `docs/archive/investigations/2026/2.3.0-audit/remove-dynamic-youTube-script-injection.md`
- `docs/archive/investigations/2026/2.3.0-audit/settings.css — Cleanup, Standardization & Split Plan.md`

**2.4.0 audit record set — historical audit/investigation, not current policy:**

- `docs/archive/investigations/2026/2.4.0-audit/2.4.0 audit.md`
- `docs/archive/investigations/2026/2.4.0-audit/2.4.0_audit_remediation_plan.md`

## Archive governance

- `docs/archive/README.md` — searchable archive catalog.
- `docs/archive/document-inventory.md` — this migration audit record.

## Explicit unresolved cases

None. The incomplete `main.ts` refactor remains active rather than being forced
into a historical state. Unknown historical issue URLs remain empty in archived
plan frontmatter; no issue, PR, commit, completion date, or release was inferred.
