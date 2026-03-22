# Feed Manager Modal Refactor (TDD, Multi-Phase)

## Goal

Refactor `src/modals/feed-manager-modal.ts` (currently a monolith containing `AddFeedModal`, `EditFeedModal`, and `FeedManagerModal`) into smaller, test-covered modules while:

- Preserving existing public import paths via a stable barrel (`src/modals/feed-manager-modal.ts`)
- Replacing the 6 inline SVG “supported format badges” with Lucide `setIcon()` rendering per `docs/design/design-spec.md`
- Deduping repeated “collect folder paths” logic across the codebase
- Fixing + testing nested folder deletion (`A/B/C`) so deep folder removal works correctly

## Non-Goals

- No UX redesign of modal flows beyond the icon/SVG replacement and bugfixes explicitly called out here
- No large behavior changes to feed loading/validation beyond making it shareable/testable
- No mass import-path churn for callers (sidebar/dashboard keep importing from the barrel)

## Current State (Facts)

- `src/modals/feed-manager-modal.ts` exports three classes:
  - `EditFeedModal`
  - `AddFeedModal`
  - `FeedManagerModal`
- Sidebar “Add Feed” icon path:
  - `src/components/sidebar.ts` imports `AddFeedModal` from `../modals/feed-manager-modal` and calls `new AddFeedModal(...).open()`
- The file contains 6 custom inline SVG badge icons (RSS, Apple Podcasts, YouTube) duplicated across Add/Edit modals (see `docs/plans/Icon Replacement Plan for feed-manager.md`)
- Folder path collection is duplicated in multiple places (at minimum):
  - `src/modals/feed-manager-modal.ts`
  - `src/components/folder-suggest.ts`
  - `src/components/folder-selector-popup.ts`
  - `src/components/sidebar.ts` (folder path cache builder)
- Nested folder deletion appears buggy for deep paths (e.g. `A/B/C`) due to path handling logic in the current hierarchy removal code.

---

## Target Architecture

### 1) Stable barrel module (public API)

Keep `src/modals/feed-manager-modal.ts` as the stable import surface for the app:

- Re-export:
  - `AddFeedModal`
  - `EditFeedModal`
  - `FeedManagerModal`
- No caller changes required (sidebar/dashboard keep working)

### 2) New modular folder

Create `src/modals/feed-manager/` containing:

- `add-feed-modal.ts` (exports `AddFeedModal`)
- `edit-feed-modal.ts` (exports `EditFeedModal`)
- `feed-manager-modal.ts` (exports `FeedManagerModal`)
- `supported-format-badges.ts` (DOM helper replacing inline SVGs)
- `feed-preview-loader.ts` (shared URL → resolved URL → preview data flow; no DOM)

### 3) Shared folder utilities

Create reusable folder helpers under `src/utils/`:

- `folder-paths.ts`
  - `collectFolderPaths(folders, { sort?: boolean }): string[]`
  - Supports both current needs:
    - “preserve hierarchy order” callers
    - “alphabetical sorted” callers
- `folder-tree.ts` (or similar)
  - `removeFolderByPath(folders, path): Folder[]` (deep removal)
  - (optional future) `renameFolderByPath(...)` if we decide to extract rename behavior later

---

## Multi-Phase Execution Plan (TDD First)

### Phase 0 — Baseline + Guardrails

**Objective:** lock in refactor safety nets before moving code.

Tasks

- Add unit test: sidebar still opens AddFeedModal via barrel export (mock + spy).
- Add unit test: `src/modals/feed-manager-modal.ts` exports `AddFeedModal`, `EditFeedModal`, `FeedManagerModal` (smoke export check).

Tests (new)

- `test_files/unit/sidebar-addfeed-opens-modal.test.ts`
  - `vi.mock("../../src/modals/feed-manager-modal", ...)`
  - Import `Sidebar`, create minimal instance, call `(sidebar as any).showAddFeedModal()`
  - Assert mocked `AddFeedModal.open()` called exactly once
- `test_files/unit/feed-manager-modal-barrel-exports.test.ts`
  - Import real `../../src/modals/feed-manager-modal`
  - Assert exports are defined / constructible

Exit Criteria

- `npm run test:unit` passes with the new tests.

---

### Phase 1 — Folder Paths Dedupe (Pure Utility + Tests)

**Objective:** remove duplicate folder-path traversal logic in a controlled, tested way.

Tasks

- Implement `src/utils/folder-paths.ts` with `collectFolderPaths(...)`.
- Replace folder-path collectors in:
  - `src/components/folder-suggest.ts`
  - `src/components/folder-selector-popup.ts`
  - `src/components/sidebar.ts` (cache builder)
  - (later phases) feed manager modal modules

Tests (new)

- `test_files/unit/folder-paths.test.ts`
  - nested folder tree → correct `A`, `A/B`, `A/B/C` output
  - `sort: true` returns locale-sorted results
  - `sort: false` preserves traversal order
  - empty inputs return empty list

Exit Criteria

- `npm run test:unit` passes
- No behavior regressions in callers (manual spot-check: folder suggest still lists folders; selector popup lists/sorts as before)

---

### Phase 2 — Supported Format Badges (Replace Inline SVGs) + Tests

**Objective:** eliminate inline SVG creation in Add/Edit modals and standardize icon rendering.

Tasks

- Implement `src/modals/feed-manager/supported-format-badges.ts`:
  - `renderSupportedFormatBadges(containerEl)` returns:
    - badge elements + `setActiveBadge(type)` + `clearActiveBadge()`
  - Use `setIcon()` with:
    - `rss`
    - `headphones`
    - `youtube`
  - Preserve existing `.format-badge` class structure and `.active` toggling behavior.

Tests (new)

- `test_files/unit/supported-format-badges.test.ts` (jsdom)
  - installs Obsidian DOM polyfills
  - renders the 3 badges
  - asserts each icon is set via `dataset.icon` (obsidian stub behavior)
  - asserts `setActiveBadge("podcast")` toggles `.active` correctly

Exit Criteria

- `npm run test:unit` passes

---

### Phase 3 — Feed Preview Loader Extraction + Tests

**Objective:** unify duplicated “Load” button logic between Add/Edit modals into a testable helper.

Tasks

- Implement `src/modals/feed-manager/feed-preview-loader.ts` exporting something like:
  - `resolveAndLoadPreview(inputUrl, opts)` returning:
    - `finalUrl`
    - `detectedType: "rss" | "podcast" | "youtube"`
    - `feedTitle`
    - `latestEntryLabel`
    - `hasEntries`
    - `isXConversion`
- Keep DOM/class toggling inside the modal classes; the loader must be logic-only.

Tests (new)

- `test_files/unit/feed-preview-loader.test.ts`
  - mock `MediaService.getYouTubeRssFeed`, `MediaService.isXUrl`, `MediaService.getNitterRssFeed`
  - mock `detectPodcastPlatform`, `resolvePodcastPlatformUrl`
  - mock `loadFeedForPreview`
  - scenarios:
    1. plain RSS URL
    2. X/Twitter URL → nitter conversion path
    3. YouTube page URL → RSS resolved then loaded
    4. podcast platform URL → resolved then loaded
    5. Pocket Casts resolution errors when CORS proxy disabled (expected error message)

Exit Criteria

- `npm run test:unit` passes

---

### Phase 4 — Split `AddFeedModal` into its own file (First modal extraction)

**Objective:** extract the most complex modal first, with minimal behavior change.

Tasks

- Create `src/modals/feed-manager/add-feed-modal.ts` and move `AddFeedModal` implementation there.
- Update internal imports in the moved file as needed.
- Replace inline SVG badge creation inside `AddFeedModal` with `renderSupportedFormatBadges`.
- Replace duplicated loader logic with `resolveAndLoadPreview`.
- Update `src/modals/feed-manager-modal.ts` to re-export `AddFeedModal` from the new file.
- Ensure existing callers remain unchanged and continue importing from the barrel.

Tests

- Re-run all existing unit tests.
- Ensure sidebar regression test still passes.

Exit Criteria

- `npm run test:unit` passes

---

### Phase 5 — Split `EditFeedModal` + `FeedManagerModal`

**Objective:** complete the decomposition of the original monolith file.

Tasks

- Extract `EditFeedModal` → `src/modals/feed-manager/edit-feed-modal.ts`
  - use shared badges + preview loader
- Extract `FeedManagerModal` → `src/modals/feed-manager/feed-manager-modal.ts`
- Keep `src/modals/feed-manager-modal.ts` as a thin barrel re-exporting all three.

Tests

- Add focused tests for any new extracted utilities introduced in this phase (avoid brittle modal DOM tests unless we invest in a richer `Setting` stub).
- Re-run `npm run test:unit`.

Exit Criteria

- `npm run test:unit` passes

---

### Phase 6 — Fix Nested Folder Deletion (Bugfix) + Tests

**Objective:** ensure deleting `A/B/C` actually removes that folder from the hierarchy.

Tasks

- Implement `src/utils/folder-tree.ts` with `removeFolderByPath(folders, path)` (deep recursive removal).
- Update `FeedManagerModal` to use this utility instead of inlined/buggy logic.

Tests (new)

- `test_files/unit/folder-tree-remove.test.ts`
  - removing deep leaf `A/B/C` removes only that folder
  - removing a mid node `A/B` removes `B` and its subtree
  - siblings remain intact
  - removing non-existent path returns original structure unchanged

Exit Criteria

- `npm run test:unit` passes

---

### Phase 7 — Final Verification (Required)

**Objective:** validate the repo state end-to-end.

Required Commands

- `npm run test:unit`
- `npm run build` ✅ REQUIRED (per request)

Manual Smoke Checklist (fast)

- Sidebar: click “Add Feed” icon → Add Feed modal opens
- “Load” in Add/Edit:
  - RSS URL loads and sets badge active
  - YouTube page URL resolves and loads
  - X URL converts to Nitter and loads
- Feed Manager:
  - deleting nested folder removes it from hierarchy
  - add/edit/delete feed still works as before

---

## Notes / Risks

- Some existing tests mock `../../src/modals/feed-manager-modal`; ensure the barrel retains named exports so mocks remain valid.
- Avoid snapshot tests for DOM-heavy modals (brittle). Prefer unit tests on extracted logic/DOM helpers.
- Keep diffs focused: avoid “drive-by” formatting changes in large moved blocks unless necessary.
