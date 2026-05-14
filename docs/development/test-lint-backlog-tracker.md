# Test-Lint Backlog Tracker

Last updated: 2026-05-14 (Pass 45 completed)

This document tracks the test-file ESLint debt burn-down that branched from the audit scorecard after Pass 4.

Scope:

- Test-file lint backlog reduction and typed refactoring progress.
- ROI queue selection and pass-by-pass trend tracking.
- Validation outcomes (lint and test run status).

Out of scope:

- Direct plugin audit checklist ownership (tracked in `docs/plugin-scorecard.md`).

## Baseline and Handoff

- Handoff from scorecard at end of Pass 4:
  - Backlog at handoff: **2686 errors**, **54 warnings**
  - Test linting enforcement already enabled in ESLint config

## Progress Log

### Pass 5

- Continued systematic ESLint backlog burn-down in test files using the "one boundary cast" pattern: replace cascading `as any` with a single `as unknown as TypedInterface` at the scope boundary.
- Files fully cleaned (0 errors each):
  - `test_files/unit/views/dashboard-lifecycle.test.ts` — **101 → 0 errors**, 44/44 tests passing
  - `test_files/unit/services/article-saver.test.ts` — **119 → 0 errors**, 25/25 tests passing
  - `test_files/unit/main/plugin-lifecycle.test.ts` — **175 → 0 errors**, 63/63 tests passing
  - `test_files/unit/components/article-list-inplace-updates.test.ts` + `article-list-harness.ts` — **107 → 0 errors**, 7/7 tests passing
- Backlog trend this phase: **lint errors reduced from 2686 to 2020** (\-666), warnings still **54**.

### Pass 6

- Confirmed Pass 5 reductions remain reflected in the latest global ESLint snapshot and retained strict test-lint enforcement workflow.
- Refreshed ROI ranking from current `eslint-report.json` (72 files still carrying errors) and updated the execution queue to target highest-value files first.
- Current top-offender queue (live report at start of Pass 6):
  - `test_files/unit/modals/edit-feed-modal.test.ts` — **108** errors
  - `test_files/unit/views/discover-view.test.ts` — **102** errors
  - `test_files/unit/views/podcast-player.test.ts` — **99** errors
  - `test_files/unit/utils/filter-statusbar-counts.test.ts` — **93** errors
  - `test_files/unit/modals/import-opml-modal.test.ts` — **71** errors
- Backlog status at this checkpoint: **2020 errors**, **54 warnings**.

### Pass 7

- Targeted single highest-ROI file: `test_files/unit/modals/edit-feed-modal.test.ts` — **108 → 0 errors**.
- Backlog trend this phase: **2020 → 1912 errors** (\-108), warnings still **54**.

### Pass 8

- Targeted second highest-ROI file: `test_files/unit/views/discover-view.test.ts` — **102 → 0 errors**.
- Backlog trend this phase: **1912 → 1810 errors** (\-102), warnings still **54**.

### Pass 9

- Targeted highest remaining ROI file: `test_files/unit/views/podcast-player.test.ts` — **99 → 0 errors**.
- Backlog trend this phase: **1810 → 1711 errors** (\-99), warnings still **54**.

### Pass 10

- Targeted `test_files/unit/utils/filter-statusbar-counts.test.ts` — **93 → 0 errors**.
- Backlog trend this phase: **1711 → 1618 errors** (\-93), warnings still **54**.

### Pass 11

- Targeted `test_files/unit/modals/import-opml-modal.test.ts` — **71 → 0 errors**.
- Backlog trend this phase: **1618 → 1547 errors** (\-71), warnings still **54**.

### Pass 12

- Targeted `test_files/unit/modals/add-feed-modal.test.ts` — **58 → 0 errors**.
- Backlog trend this phase: **1547 → 1489 errors** (\-58), warnings still **54**.

### Pass 13

- Ran fresh test-file audit to replace ad-hoc "next highest ROI" selection with a persistent ranked working backlog.
- Commands run:
  - `npx eslint "test_files/**/*.ts" -f json -o eslint_test_report.json`
  - `npm run test:unit`
  - Generated `test_lint_backlog_ranked.json` from ESLint JSON (sorted queue artifact)
- Backlog trend this phase: **1489 → 1517 errors** (+28), warnings still **54**.
- Backlog trend this phase: **1454 → 1451 errors** (\-3), warnings still **54**.

### Pass 14

- Targeted `test_files/unit/components/article-list.test.ts` — **65 → 0 errors**.
- Backlog trend this phase: **1451 → 1386 errors** (\-65), warnings still **54**.

### Pass 15

- Targeted `test_files/unit/components/folder-selector-popup.test.ts` — **65 → 0 errors**.
- Backlog trend this phase: **1386 → 1321 errors** (\-65), warnings still **54**.

### Pass 16

- Targeted `test_files/unit/settings/article-saving-settings-tab.test.ts` — **65 → 0 errors**.
- Backlog trend this phase: **1321 → 1256 errors** (\-65), warnings still **54**.

### Pass 17

- Targeted `test_files/unit/services/backup-service.test.ts` — **64 → 0 errors**.
- Backlog trend this phase: **1256 → 1192 errors** (\-64), warnings still **54**.

### Pass 18

- Targeted `test_files/unit/components/discover-sidebar.test.ts` — **62 → 0 errors**.
- Backlog trend this phase: **1192 → 1130 errors** (\-62), warnings still **54**.

### Pass 19

- Targeted `test_files/unit/views/dashboard-reader-location.test.ts` — **59 → 0 errors**.
- Backlog trend this phase: **1130 → 1071 errors** (\-59), warnings still **54**.

### Pass 20

- Targeted `test_files/unit/main/feed-refresh-pipeline.test.ts` — **55 → 0 errors**.
- Backlog trend this phase: **1071 → 1016 errors** (\-55), warnings still **54**.

### Pass 21

- Targeted `test_files/unit/services/web-viewer-integration.test.ts` and `test_files/unit/services/web-viewer-integration-harness.ts` — **51 → 0 errors** and **6 → 0 errors** respectively.
- Backlog trend this phase: **1016 → 959 errors** (\-57), warnings still **54**.

### Pass 22

- Targeted `test_files/unit/main/activate-view-leaf-selection.test.ts` — **47 → 0 errors**, **1 → 0 warnings**.
- Backlog trend this phase: **959 → 912 errors** (-47), warnings **54 → 53** (-1).

### Pass 23

- Targeted `test_files/unit/components/sidebar-core.test.ts` — **41 → 0 errors**.
- Backlog trend this phase: **912 → 871 errors** (-41), warnings still **53**.

### Pass 24

- Targeted `test_files/unit/components/sidebar-icon-registry.test.ts` — **1 → 0 errors**.
- Backlog trend this phase: **871 → 870 errors** (-1), warnings still **53**.

### Pass 25

- Targeted `test_files/unit/components/article-header.test.ts` — **37 → 0 errors**.
- Backlog trend this phase: **870 → 833 errors** (-37), warnings still **53**.

### Pass 26

- Targeted `test_files/unit/components/article-list-empty-state.test.ts` — **1 → 0 errors**.
- Backlog trend this phase: **833 → 832 errors** (-1), warnings still **53**.

### Pass 27

- Targeted `test_files/unit/views/dashboard-pagination.test.ts` — **1 → 0 errors**.
- Backlog trend: **832 → 831 errors** (-1).
- Warnings total: **53 → 52** (-1).

### Pass 28

- Targeted `test_files/unit/modals/import-success-modal.test.ts` — **2 → 0 errors**.
- Backlog trend: **831 → 829 errors** (-2).

### Pass 29

- Targeted `test_files/unit/services/metadata-storage-repository.test.ts` — **2 → 0 errors**.
- Backlog trend: **829 → 827 errors** (-2).
- Warnings total: **52 → 48** (-4).

### Pass 31

- Targeted `test_files/unit/services/highlight-service.test.ts` — **2 → 0 errors**.
- Backlog trend: **825 → 823 errors** (-2).
- Warnings total: **48 → 47** (-1).

### Pass 32
 
- Targeted `test_files/unit/views/dashboard-filter-persistence.test.ts` — **2 → 0 errors**.
- Backlog trend: **823 → 821 errors** (-2).

### Pass 33

- Targeted `test_files/unit/services/feed-parser.test.ts` — **3 → 0 errors**.
- Backlog trend: **821 → 818 errors** (-3).

### Pass 34

- Targeted `test_files/unit/services/fetch-helpers.test.ts` — **3 → 0 errors**.
- Backlog trend: **818 → 815 errors** (-3).

### Pass 35

- Targeted `test_files/unit/settings/metadata-storage-settings-tab.test.ts` — **3 → 0 errors**.
- Backlog trend: **815 → 812 errors** (-3).
- Warnings total: **47 → 13** (-34).

### Pass 36

- Targeted `test_files/unit/services/opml-manager.test.ts` — **3 → 0 errors**.
- Backlog trend: **812 → 809 errors (-3)**.

### Pass 37

- Targeted `test_files/unit/utils/export-utils.test.ts` — **4 → 0 errors**.
- Backlog trend: **809 → 805 errors (-4)**.
- Warnings total: **13** (no change).

### Pass 38

- Targeted `test_files/unit/components/keyword-filter-editor.test.ts` — **4 → 0 errors**.
- Backlog trend: **805 → 801 errors (-4)**.
- Warnings total: **13** (no change).

### Pass 39

- Targeted `test_files/unit/modals/sidebar-addfeed-opens-modal.test.ts` — **4 → 0 errors**.
- Backlog trend: **801 → 797 errors (-4)**.
- Warnings total: **13** (no change).

### Pass 40

- Targeted `test_files/unit/components/sidebar-scrolling.test.ts` — **7 → 0 errors**.
- Backlog trend: **797 → 790 errors (-7)**.
- Warnings total: **13** (no change).

### Pass 41

- Targeted `test_files/unit/views/dashboard-restricted-save-rerender.test.ts` — **8 → 0 errors**.
- Backlog trend: **790 → 782 errors (-8)**.
- Warnings total: **13** (no change).

### Pass 42

- Targeted `test_files/unit/services/sidebar-ordering-controller.test.ts` — **10 → 0 errors**.
- Backlog trend: **782 → 772 errors (-10)**.
- Warnings total: **13** (no change).

### Pass 43

- Targeted `test_files/unit/components/reader-format-portal.test.ts` — **11 → 0 errors**.
- Backlog trend: **772 → 761 errors (-11)**.
- Warnings total: **13** (no change).

### Pass 44

- Targeted `test_files/unit/settings/import-export-settings-tab.test.ts` — **11 → 0 errors**.
- Backlog trend: **761 → 750 errors (-11)**.
- Warnings total: **13** (no change).

### Pass 45

- Targeted `test_files/unit/services/feed-storage-repository.test.ts` — **13 → 0 errors**.
- Backlog trend: **750 → 737 errors (-13)**.
- Warnings total: **13** (no change).

## Working Backlog Queue (Ranked)

Use this ordered list for each subsequent pass. Work top-to-bottom unless a file is blocked by dependency context.

Source artifact:

- `test_lint_backlog_ranked.json` (sorted queue generated during Pass 25)

| Rank | File                                                                    | Errors | Warnings |
| ---- | ----------------------------------------------------------------------- | -----: | -------: |
| 1    | `test_files/unit/components/supported-format-badges.test.ts`            |     36 |        0 |
| 2    | `test_files/unit/utils/tag-utils.test.ts`                               |     36 |        0 |
| 3    | `test_files/unit/components/sidebar-rendering.test.ts`                  |     36 |        1 |
| 4    | `test_files/unit/modals/mobile-navigation-modal.test.ts`                |     35 |        0 |
| 5    | `test_files/unit/views/dashboard-card-layout-filter-batch.test.ts`      |     32 |        0 |
| 6    | `test_files/unit/services/apple-podcasts-service.test.ts`               |     32 |        0 |
| 7    | `test_files/unit/settings/settings-tab-orchestrator.test.ts`            |     29 |        0 |
| 8    | `test_files/unit/settings/tags-settings-tab.test.ts`                    |     28 |        0 |
| 9    | `test_files/unit/components/article-renderer-summary-dedupe.test.ts`    |     28 |        0 |
| 10   | `test_files/unit/settings/media-settings-tab.test.ts`                   |     27 |        0 |
| 11   | `test_files/unit/main/background-import-orchestration.test.ts`          |     26 |        0 |
| 12   | `test_files/unit/utils/settings-loader.test.ts`                         |     26 |        0 |
| 13   | `test_files/unit/settings/display-reader-settings-tab.test.ts`          |     25 |        0 |
| 14   | `test_files/unit/components/article-header-menu.test.ts`                |     25 |        0 |
| 15   | `test_files/unit/test-dom-polyfills.ts`                                 |     24 |        0 |
| 16   | `test_files/unit/components/tags-dropdown-portal-regression.test.ts`    |     23 |        0 |
| 17   | `test_files/unit/settings/storage-settings-general-tab.test.ts`         |     23 |        0 |
| 18   | `test_files/unit/views/dashboard-header-title-batching.test.ts`         |     22 |        0 |
| 19   | `test_files/unit/modals/feed-manager-modal.test.ts`                     |     19 |        0 |
| 20   | `test_files/unit/settings/startup-filters-settings-positioning.test.ts` |     19 |        0 |
| 21   | `test_files/unit/utils/platform-utils.test.ts`                          |     18 |        0 |
| 22   | `test_files/unit/components/article-filter-menu.test.ts`                |     18 |        0 |
| 23   | `test_files/unit/settings/about-settings-tab.test.ts`                   |     18 |        0 |
| 24   | `test_files/unit/modals/feed-preview-modal.test.ts`                     |     18 |        0 |
| 25   | `test_files/unit/views/dashboard-title-filter-summary.test.ts`          |     16 |        0 |
| 26   | `test_files/unit/modals/mobile-discover-filters-modal.test.ts`          |     16 |        0 |
| 27   | `test_files/unit/settings/rules-settings-tab.test.ts`                   |     16 |        0 |
| 28   | `test_files/unit/main/settings-open-navigation.test.ts`                 |     15 |        0 |
| 29   | `test_files/unit/services/import-export-service.test.ts`                |     15 |        0 |
| 30   | `test_files/unit/services/import-export-service-metadata.test.ts`       |     14 |        6 |
| 31   | `test_files/unit/components/article-list-characterization.test.ts`      |     14 |        0 |
| 36   | `test_files/stubs/obsidian.ts`                                          |      8 |        4 |


## Cross-Impact on Audit Scorecard

Record entries here when test-lint work directly closes a scorecard warning/risk item.

- No direct scorecard warning/risk item has been marked fully closed from Pass 5-14 test-lint work yet.

## Related Docs

- `docs/plugin-scorecard.md` (audit-aligned scorecard)
- `docs/development/compliance-patterns.md` (approved implementation patterns)
- `CONTRIBUTING.MD` (compliance declarations and pre-PR checks)
