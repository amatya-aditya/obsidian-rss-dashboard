# Documentation Archive

Searchable catalog for completed plans and historical investigations. The
[Plan Lifecycle and Archive](../development/README.md#plan-lifecycle-and-archive)
policy governs new moves. The [migration inventory](document-inventory.md)
records the complete 2026-08-16 documentation classification.

## Implemented plans awaiting release

| Plan                                                                                   | Completed  | Issue                                                                               | Implementation |
| -------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- | -------------- |
| [Documentation archive cleanup](plans/unreleased/169-documentation-archive-cleanup.md) | 2026-08-16 | [GH Issue #169](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/169) | `314ae6f`      |
| [Per-feed auto-refresh scheduling fix](plans/unreleased/166-per-feed-auto-refresh-scheduling.md) | 2026-08-16 | [GH Issue #166](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/166) | `5592c39`      |
| [WordPress LaTeX image rendering](plans/unreleased/wordpress-latex-image-rendering.md) | 2026-08-08 | Unknown                                                                             | `9ce3582`      |

## Versioned plans

### 2.2.0

- [Test coverage improvement](plans/v2.2.0/test-coverage-improvement.md) — completed 2026-04-07 (`08030a7`).

### 2.4.0

- [Vault metadata watcher](plans/v2.4.0/vault-metadata-watcher.md) — completed 2026-06-15 (`b0e4c81`).
- [Shift+click range selection](plans/v2.4.0/shift-click-range-selection-sidebar.md) — completed 2026-06-19 (`58cda8c`).
- [Multi-folder sidebar selection](plans/v2.4.0/multi-folder-selection-sidebar.md) — completed 2026-06-18 (`78d54a7`).
- [RSS card image fallback](plans/v2.4.0/rss-card-image-fallback.md) — completed 2026-06-10 (`ad616ae`).

### 2.4.1

- [Collapsible feed headers](plans/v2.4.1/collapsible-feed-headers.md) — completed 2026-07-03; [GH Issue #149](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/149) (`422ada7`).

## Unshipped plans

| Plan                                                  | Status              | Decision                                                                               |
| ----------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| [MP4 hero images](plans/unshipped/mp4-hero-images.md) | Deferred 2026-03-27 | The original attempt was reverted because video URL parsing needed more investigation. |

## Investigations

### 2026

- [Math rendering](investigations/2026/math-rendering.md), [sidebar visibility and row compression](investigations/2026/sidebar-visibility-row-compression-regression.md), and [2.4.1 errors](investigations/2026/2.4.1-errors.md).
- [YouTube Shorts tagging failure](investigations/2026/youtube-shorts-tagging-failure.md) and [YouTube watch progress](investigations/2026/youtube-watch-progress.md).
- [Substack CDATA entity encoding](investigations/2026/substack-cdata-entity-encoding.md), [Defuddle evaluation](investigations/2026/defuddle-evaluation.md), [coverage comparison](investigations/2026/coverage-comparison.md), and [testing closeout checklist](investigations/2026/final-testing-pr-closeout-checklist.md).
- [2.3.0 audit working checklist](investigations/2026/audit-remediation-2.3.0.md), [2.3.0 audit records](investigations/2026/2.3.0-audit/), and [2.4.0 audit records](investigations/2026/2.4.0-audit/).

## Unresolved historical evidence

None. The active [main.ts refactor](../plans/main-ts-refactor.md) remains in
`docs/plans/` because its source still records in-progress work; it has no
canonical issue or final implementation reference.
