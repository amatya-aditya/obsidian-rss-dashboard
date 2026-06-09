# ArticleList Refactor Plan

<!--
SUMMARY: Split 2745-line ArticleList class into modular components (views/components/utils)
APPROACH: TDD - Write failing tests first, then implement extraction
EXPECTED RESULT: Main file reduced to ~1500 lines, better maintainability
-->

## Overview

The `src/components/article-list.ts` file has grown to over 2745 lines. This plan proposes splitting it into logical, testable modules.

**Estimated Impact:** Extract ~1250 lines into separate files while maintaining all functionality.

---

## Quick Navigation

| Section                                                                             | Description                 |
| ----------------------------------------------------------------------------------- | --------------------------- |
| [Target Structure](#target-directory-structure)                                     | Final file layout           |
| [Checklist](#checklist)                                                             | Task-by-task execution plan |
| [Phase 1: Utils Extraction](#phase-1-utils-extraction-pure-functions---lowest-risk) | Extract pure functions      |
| [Phase 2: Components](#phase-2-components-extraction-ui-components-with-callbacks)  | Extract UI components       |
| [Phase 3: Views](#phase-3-views-extraction-major-render-methods)                    | Extract render methods      |
| [Phase 4: Main Refactor](#phase-4-orchestrator-refactor)                            | Wire up imports             |
| [Phase 5: Verification](#phase-5-verification)                                      | Test and verify             |

---

## Target Directory Structure

```text
src/components/article-list/
├── article-list.ts               # Main orchestrator (imports from subdirs)
├── views/
│   ├── card-view.ts             # Card grid rendering
│   ├── list-view.ts             # List layout rendering
│   └── feed-view.ts             # Feed layout rendering
├── components/
│   ├── pagination.ts            # Page navigation controls
│   ├── article-actions.ts       # Action toolbar (read/save/star/tags)
│   ├── article-context-menu.ts  # Right-click context menu
│   └── feed-icon.ts             # Feed favicon/icon rendering
└── utils/
    ├── tag-layout-utils.ts      # Tag chip layout and truncation
    ├── article-grouping.ts      # Article grouping by feed/date/folder
    └── article-preview-utils.ts # Image extraction, text formatting (EXISTS)
```

---

## Checklist

### Phase 1: Utils Extraction (Pure Functions - Lowest Risk)

Extract utility functions that don't depend on instance state. These are the safest changes.

- [x] **1.1** Write failing tests for `article-grouping.ts` extraction
  - Test file: `test_files/unit/components/article-list/article-grouping.test.ts`
  - Functions: `groupArticles`, `getFeedFolder`
  - Source location: `article-list.ts:1368-1405`

- [x] **1.2** Write failing tests for `tag-layout-utils.ts` extraction
  - Test file: `test_files/unit/components/article-list/tag-layout-utils.test.ts`
  - Functions: `layoutCardTagRows`, `renderSingleRowCardTagChips`, `renderTagChips`, `createTagChip`, `createTagOverflowChip`
  - Source location: `article-list.ts:336-463`

- [x] **1.3** Implement `article-grouping.ts`
  - Create utils file with extracted functions
  - Update `ArticleList` to import and delegate

- [x] **1.4** Implement `tag-layout-utils.ts`
  - Create utils file with tag layout logic
  - Update `ArticleList` to import and delegate

---

### Phase 2: Components Extraction (UI Components with Callbacks)

Extract encapsulated UI components that use `ArticleListCallbacks` but don't manage list state.

- [x] **2.1** Write failing tests for `feed-icon.ts` extraction
- [x] **2.2** Write failing tests for `article-actions.ts` extraction
- [x] **2.3** Write failing tests for `article-context-menu.ts` extraction
- [x] **2.4** Write failing tests for `pagination.ts` extraction
- [x] **2.5** Implement `feed-icon.ts`
- [x] **2.6** Implement `article-actions.ts`
- [x] **2.7** Implement `article-context-menu.ts`
- [x] **2.8** Implement `pagination.ts` - page navigation controls

- [x] **2.9** Wire extracted components into `article-list.ts`
  - `renderPagination` → `pagination.ts` (done)
  - `renderFeedIcon` → `feed-icon.ts`
  - `createArticleActionButtons` → `article-actions.ts`
  - `showArticleContextMenu` → `article-context-menu.ts`

**Status:** Complete. Inline duplicates removed from `ArticleList`; all four component modules delegated via thin wrappers. Verified with targeted unit test run.

---

### Phase 3: Views Extraction (Major Render Methods)

Extract the three main view rendering methods (~520 lines total).

- [x] **3.1** Write failing tests for `card-view.ts` extraction
  - Test file: `test_files/unit/components/article-list/card-view.test.ts`
  - Function: `renderCardView` (~200 lines)
  - Source location: `article-list.ts:2252-2431`

- [x] **3.2** Write failing tests for `list-view.ts` extraction
  - Test file: `test_files/unit/components/article-list/list-view.test.ts`
  - Function: `renderListView` (~150 lines)
  - Source location: `article-list.ts:2112-2250`

- [x] **3.3** Write failing tests for `feed-view.ts` extraction
  - Test file: `test_files/unit/components/article-list/feed-view.test.ts`
  - Function: `renderFeedView` (~170 lines)
  - Source location: `article-list.ts:1953-2110`

- [x] **3.4** Implement `card-view.ts`

- [x] **3.5** Implement `list-view.ts`

- [x] **3.6** Implement `feed-view.ts`

**Status:** Complete. View render methods extracted to `views/`; `ArticleList` delegates via `getBaseViewContext()` / `getViewDeps()`. Verified with targeted unit test run.

---

### Phase 4: Orchestrator Refactor

Wire up all extracted modules to the main file.

- [x] **4.1** Refactor `article-list.ts` to use extracted modules
  - Remove extracted code
  - Add imports from new module locations
  - Update method calls to delegate

- [x] **4.2** Clean up unused imports
  - Remove now-unused imports from original file
  - Ensure proper exports for external consumers

**Status:** Complete. `ArticleList` remains the sole export from `article-list.ts`; submodules are internal. Dead delegate wrappers and unused imports removed.

---

### Phase 5: Verification

Final validation before completion.

- [x] **5.1** Run unit tests: `npm run test:unit`
  - **1412 passed** across 155 files. `article-list.test.ts` fails to load (pre-existing Vitest/Windows transform issue; also fails on `HEAD` — 31 tests in that file not executed). Covered by `article-list-characterization.test.ts`, `article-list-inplace-updates.test.ts`, and `article-list/**` module tests.

- [x] **5.2** Run type check: `npx tsc -noEmit -skipLibCheck` — clean

- [x] **5.3** Run lint: `npx eslint src/components/article-list.ts src/components/article-list/**/*.ts` — clean

- [ ] **5.4** Manual verification in Obsidian:
  - Card/List/Feed views render correctly
  - Pagination works
  - Actions (Read/Save/Star/Tags) functional
  - Context menus functional
  - Window resize updates card tag layout

---

## Dependencies & Interfaces

### ArticleListCallbacks Interface

Used by: `article-actions.ts`, `article-context-menu.ts`, `pagination.ts`, all view files

### Settings Dependencies

- `settings.viewStyle` - all views
- `settings.display.*` - card view (columns, spacing, mobile)
- `settings.articleSaving.*` - save button
- `settings.highlights.*` - views (highlightService)
- `settings.feeds.*` - feed-icon
- `settings.media.*` - feed-icon
- `settings.articleGroupBy` - grouping utils

### Shared State

- `selectedArticle` - all views (active class)
- `articles` array - in-place updates
- `highlightService` - text highlighting

---

## Estimated Lines Saved

| Module                   | Lines     | Status         |
| ------------------------ | --------- | -------------- |
| article-preview-utils.ts | ~70       | Already exists |
| tag-layout-utils.ts      | ~120      | Done           |
| article-grouping.ts      | ~40       | Done           |
| feed-icon.ts             | ~220      | Done           |
| article-actions.ts       | ~180      | Done           |
| article-context-menu.ts  | ~90       | Done           |
| pagination.ts            | ~140      | Done           |
| card-view.ts             | ~200      | Done           |
| list-view.ts             | ~150      | Done           |
| feed-view.ts             | ~170      | Done           |
| **Total**                | **~1250** |                |

Main `article-list.ts` reduced from ~2745 to **~1490 lines** (orchestrator only).

**Refactor complete** pending manual Obsidian smoke test (5.4) and optional fix for `article-list.test.ts` Vitest load failure.
