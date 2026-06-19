## Plan: Add Shift+Click Range Selection for Sidebar (TDD-first)

**Current Behavior & Problem**
The shift selector currently semi-works: it only works for shift+clicking and selecting folders, but does not allow mixing and matching folder+feed selections linearly.

**Proposed Solution (Traditional Filesystem Shift+Click)**
Implement traditional shift+click filesystem functionality using the visible sidebar order. 
For example, given Folders A and B with 10 feeds each:
- Left-click Folder A.
- Shift-click the 5th feed in Folder B.
- Selection must include: Folder A (and all its feeds), and the first 5 feeds of Folder B.
- Folder B itself is *not* selected because not all of its feeds are included in the range.

Tests must be written first (TDD). Do not run tests automatically in CI for this change; tests are run locally by the developer.

**Steps (TDD-first)**

1. Create unit tests first under `test_files/unit/` (see test skeleton below). These tests will drive the implementation:
   - New test file: `test_files/unit/sidebar-shift-select.test.ts`
   - Tests to include: range selection across folder->feed, feed->folder, feed->feed, folder->folder; folder expansion to descendants; anchor behavior when selection exists; shift+click with no anchor.
2. Update `src/components/sidebar.ts` only after tests are added and failing. Add `shiftKey` handling in the existing row click handlers and expose a new callback `onRangeSelect(startKey: string, endKey: string)`.
3. Update `src/views/dashboard-view.ts` to add a `lastClickAnchorKey: string | null` state, wire `onRangeSelect` to `handleSidebarRangeSelect`, and implement selection merging logic there.
4. Re-run the unit tests locally (developer runs them manually). Iterate implementation until tests pass (green).
5. Add tests verifying that Ctrl/Meta-click still toggles selection and updates `lastClickAnchorKey`.
6. Keep UI styling unchanged; existing `.multi-selected` class will style selected rows.

**Relevant Code Snippets (to include during implementation)**

- Add anchor state to `RssDashboardView` (example inline snippet):
  - `private lastClickAnchorKey: string | null = null;`

- Sidebar options callback addition (in `Sidebar` constructor options):
  - `onRangeSelect?: (startKey: string, endKey: string) => void;`

- Sidebar click handler pseudocode (inside row click listener):
  - if `e.shiftKey` {
    // compute visibleKeys: array of sidebar item keys in render order
    // find startIdx = visibleKeys.indexOf(lastClickAnchorKey || clickedKey)
    // find endIdx = visibleKeys.indexOf(clickedKey)
    // range = visibleKeys.slice(min, max + 1)
    // expand folders in range to descendants using `getAllDescendantFolders()`
    // callbacks.onRangeSelect(rangeStartKey, rangeEndKey)
    }

- `RssDashboardView.handleSidebarRangeSelect` (pseudocode):
  - function receives a linear list of `visibleKeys` in the range (startKey to endKey)
  - collect all feedKeys directly in the range
  - for any folderKeys in the range (or parents of feeds in the range):
    - check if all of its descendant feeds are included in the overall selection
    - if yes, add the folder to `selectedFolders`
    - if no, only the overlapping feeds are added to `selectedFeeds`, but the parent folder is *not* added to `selectedFolders`
  - merge into `this.selectedFolders` and `this.selectedFeeds` (dedupe)
  - set `this.lastClickAnchorKey = endKey` and refresh view via existing refresh path

**Unit Test Skeleton (Vitest)**

- File: `test_files/unit/sidebar-shift-select.test.ts`
  - Inline example lines:
    - `import { describe, it, expect, beforeEach } from 'vitest'`
    - `import { Sidebar } from '../../src/components/sidebar'`
    - `import { RssDashboardView } from '../../src/views/dashboard-view'`
    - Tests should instantiate a mock view/sidebar, simulate clicks (including `shiftKey`), and assert `selectedFolders` / `selectedFeeds` state.

**Testing policy change (manual runs)**

- Remove automatic test runs for this feature from any CI or pre-commit hooks for this branch. The developer must run tests manually during TDD cycles. Suggested commands to run locally:
  - `npm test` (runs full test suite)
  - `npm run test:unit -- test_files/unit/sidebar-shift-select.test.ts` (run the new file only)

- Add a short developer note in the PR description: "TDD-first: tests added and must be run locally; remove automatic test gating for this branch." This avoids blocking CI while iterating.

**Relevant files to modify (implementation phase)**

- `src/components/sidebar.ts` — add Shift+click handling and `onRangeSelect` callback.
- `src/views/dashboard-view.ts` — add `lastClickAnchorKey`, wire callback, implement `handleSidebarRangeSelect`.
- `src/utils/folder-paths.ts` or sidebar row registry — use to compute `visibleKeys` in render order.
- `test_files/unit/sidebar-shift-select.test.ts` — new TDD tests.

**Verification (manual test runs only)**

1. Developer runs the new tests locally and sees them fail initially (red).
2. Implement code changes and re-run tests until green.
3. Manual UI verification:
   - Select a folder (click), then Shift+click another row — confirm all rows between are selected and folder descendants included.
   - Confirm anchor updates to most-recent click.

**Decisions / Assumptions**

- Tests are TDD-first and must be added prior to code changes.
- Developer runs tests manually; CI automatic gating for this feature is disabled until tests pass locally.
- Range scope includes both folder and feed rows in visible sidebar order.
- A folder is only marked as selected if it is explicitly the start/end or if *all* of its child feeds fall within the selected range. If a range ends halfway through a folder's feeds, those feeds are selected individually, but their parent folder is not.
- Anchor is the most-recently-clicked item.

**Further Considerations**

1. Add integration/automation later: once tests are stable and passing locally, re-enable CI runs for the new tests.
2. Consider keyboard range selection (Shift+Arrow) in a follow-up ticket.
3. For very large selections, consider batching UI updates to avoid frame drops.

**Current Broken Status & Handoff Notes (Context Window)**

As of testing the feature, it is still broken in two key ways:

1. **Folder Selection Bug (Skipping End Folders):** 
   - *Symptom:* Clicking Folder A then Shift+Clicking Folder C selects Folders A and B, but skips C.
   - *Root Cause:* If Folder C is *expanded*, its child feeds appear visually *below* the folder header in `visibleKeys`. When Shift-Clicking the Folder C header, the selection range `[startIdx, endIdx]` stops at the header itself. Because the child feeds are outside the range, `allFeedsSelected` evaluates to `false`, and Folder C is not selected.
   - *Fix Needed:* If a folder header is included in the `rangeKeys` (regardless of whether it's collapsed or expanded), we must treat *all* of its descendant feeds as implicitly included in the selection intent, unless the range specifically stops *mid-way* through its expanded children. Alternatively, if a folder is explicitly `clickedKey` or `lastClickAnchorKey`, it should force-select all its descendants.

2. **CSS Styling Bug (Feeds missing highlight):**
   - *Symptom:* Feeds selected as part of the multi-selection range do not show the purple/bold highlighted background.
   - *Root Cause:* In `src/components/sidebar.ts`, we applied the `.multi-selected` class to selected feeds, but it appears to lack the specific styles needed. The single-feed selection uses the `.active` class to get the purple text and bolding.
   - *Fix Needed:* In `renderFeed()` in `sidebar.ts`, change the multi-select condition to append the `.active` class (or ensure `.multi-selected` is applied alongside `.active`) for items in `this.options.selectedFeeds`.

## Phase 2: Refinements and Additional Features [COMPLETED]

1. **Ctrl+Click Deselection:**
   - Add the ability to Ctrl+Click (or Meta+Click on Mac) a single feed to deselect it after a range has been selected via Shift+Click.
   - This should remove the feed from `selectedFeeds` without clearing the rest of the selection.
   - If the deselected feed was part of a fully selected folder, the folder should no longer be considered fully selected (it should be removed from `selectedFolders` and the remaining feeds added individually to `selectedFeeds`).

2. **Header Feed Count Update:**
   - Update `src/views/dashboard-view.ts` to show the quantity of feeds contained within the multi-selection.
   - The header should display: `Folders: X, Y, Z (Feeds: $n)` where `$n` is the total number of feeds within the selection (including those inside selected folders).

3. **Tag Filtering in Multi-Select:**
   - Currently, tag filtering might be disabled or ignored during multi-selection.
   - Update the logic so that users can use tag filtering in the sidebar when multi-selections are in effect, maintaining the same behavior as when control+clicking single items.

## Phase 3: Selection Bug Fix and Context Menu Actions

1. **Bug Fix: Mid-Folder Selection Expansion Issue**
   - *Current Behavior:* Clicking a folder first, then Shift-clicking a few feeds within that folder incorrectly selects *all* feeds in the folder.
   - *Expected Behavior:* It should only select up to and including the clicked feed (respecting the visual range), rather than implicitly expanding to include the entire folder. The parent folder should not be marked as fully selected unless the range explicitly encompasses all of its feeds.

2. **Context Menu Actions for Multi-Selection**
   - Apply right-click context menu actions to the active multi-selection (across folders and feeds).
   - Support bulk operations on the selection such as "Mark all read", "Delete selection", etc.
