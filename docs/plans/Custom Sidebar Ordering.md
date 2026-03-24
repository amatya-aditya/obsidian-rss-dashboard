## Custom Sidebar Ordering (Drag & Drop) + “Custom” Sort Mode — Phased Plan

### Summary

Add drag-and-drop custom ordering for sidebar **feeds** and **folders** (including **nesting moves**). Any manual reorder auto-switches the relevant sort to a new **Custom** mode. Implement via TDD: write failing unit tests first, then implement, then ensure `npm run build` passes.

## Custom Sidebar Ordering (Drag & Drop) + “Custom” Sort Mode

### Summary

Implement manual (drag-and-drop) ordering for **folders (including nesting)** and **feeds** in the sidebar. Any successful manual reorder automatically switches the relevant sort mode to a new **“Custom”** option so the order persists. Do this with a TDD-first approach and finish by ensuring `npm run build` passes.

### Implementation Changes

- **Sorting/refactor (Phase 1: extract + make testable)**
  - Create an importable controller class used by `Sidebar` (e.g. `SidebarOrderingController`) that owns:
    - Reading/writing sidebar sort state in `RssDashboardSettings`
    - Applying folder/feed ordering for render (including `Custom`)
    - Mutations for manual reorder (folders + feeds) and “switch to Custom”
  - Convert existing sidebar sort logic into controller methods (keep `Sidebar` responsible for DOM + calling `plugin.saveSettings()` + `render()`).

- **Types / sort mode**
  - Extend sort “by” unions to include `"custom"`:
    - `src/types/types.ts`: `folderSortOrder.by` includes `"custom"`; `folderFeedSortOrders[*].by` includes `"custom"`.
    - `src/utils/sidebar-sort-utils.ts`: `FeedSortBy` includes `"custom"`, and `applyFeedSortOrder(..., { by: "custom" })` returns the input order (no sorting).
  - Folder ordering: add a pure helper (moved out of `Sidebar.applySortOrder`) that supports `"custom"`:
    - `"custom"` preserves existing sibling order, but still renders **pinned folders before unpinned** (stable partition), recursively.

- **Drag-and-drop behaviors (Phase 2: wire into `Sidebar`)**
  - **Feeds**
    - Keep existing “drag feed onto folder header/list to move” behavior.
    - Add “drag feed onto another feed to reorder”:
      - Determine insert `before|after` using cursor Y vs target feed midpoint.
      - If dropping onto a feed in a different folder, also move the feed to that folder and insert relative to the target.
    - After any manual feed reorder/move-insert, set `settings.folderFeedSortOrders[folderPath].by = "custom"` (use `""` for root feeds), then `saveSettings()` and `render()`.

  - **Folders (reorder + nesting moves)**
    - Make folder headers draggable and set `dataTransfer` with `folder-path`.
    - On dragover of another folder header, decide action by pointer position:
      - Top 25%: reorder **before**
      - Bottom 25%: reorder **after**
      - Middle 50%: **nest** (make dragged folder a subfolder of the target)
    - Validate and block illegal moves:
      - Cannot move a folder into itself or its descendants
      - Cannot create duplicate sibling names under the destination parent (show `Notice` and cancel)
    - When a folder’s parent changes (nest/un-nest), update references by prefix-remap:
      - `feed.folder` for feeds in the moved subtree
      - `settings.collapsedFolders` entries in the moved subtree
      - `settings.folderFeedSortOrders` keys in the moved subtree
    - After any successful manual folder move/reorder, set `settings.folderSortOrder.by = "custom"`, then `saveSettings()` and `render()`.
    - Allow un-nesting to top-level by dropping a folder onto the sidebar root empty area (append to end of top-level list).

- **UI: “Custom” sort row**
  - Add a `Custom` item to the sidebar sort menu (toolbar sort icon) that:
    - Sets `settings.folderSortOrder = { by: "custom", ascending: true }`
    - Sets existing `settings.folderFeedSortOrders[*]` entries to `{ by: "custom", ascending: true }` and ensures root key `""` is present as `"custom"`
    - Does **not** change current array order; it only stops auto-sorting on render
  - Optionally (but implement in this plan): add `Custom` to per-folder feed sort menu (`showFeedSortMenu`) to set that folder’s feed ordering mode to `"custom"`.

- **Styling**
  - Update `src/styles/sidebar.css` to add clear drag affordances:
    - Folder header states: `drag-over-before`, `drag-over-after`, `drag-over-nest`
    - Feed row state for reorder target (e.g. top/bottom border indicator)

### Test Plan (TDD-first; tests written before implementation)

- Add/extend unit tests under `test_files/unit/`:
  - `applyFeedSortOrder` with `{ by: "custom" }` preserves order.
  - Folder ordering helper:
    - `"custom"` preserves sibling order while keeping pinned folders first (stable).
  - Feed reorder helper (pure):
    - Reorders within same folder (before/after) by URL identifiers.
    - Cross-folder drop inserts relative to target and updates `feed.folder`.
    - Sets `folderFeedSortOrders[folderPath].by` to `"custom"` after manual reorder.
  - Folder move helper (pure):
    - Reorder before/after among siblings.
    - Nest move updates folder tree and remaps `feed.folder`, `collapsedFolders`, and `folderFeedSortOrders` keys for the moved subtree.
    - Reject moving into descendant; reject duplicate sibling name at destination.
    - Sets `folderSortOrder.by` to `"custom"` after successful move.
- Run validation:
  - `npm run test:unit`
  - `npm run build`

### Assumptions / Defaults

- Manual ordering is desktop-first; touch/mobile drag is not guaranteed and degrades gracefully (no crashes).
- “Custom” means “preserve stored array order”; it does not create a separate ordering store.
- Pinned folders always render above unpinned folders, even in Custom mode; ordering inside each group is manual.
- Folder drop-zone thresholds are fixed at 25%/50%/25% (before/nest/after).

### Phase 0 — Baseline + scaffolding

- Confirm current unit test harness patterns (Vitest + JSDOM) and add a new test file stub for ordering.
- Decide/test target APIs as **pure functions** first (no DOM dependency).

### Phase 1 — Sort mode foundation (pure, test-first)

1. **Types**
   - Update `src/types/types.ts`:
     - `folderSortOrder.by`: add `"custom"`
     - `folderFeedSortOrders[*].by`: add `"custom"`
   - Update `src/utils/sidebar-sort-utils.ts`:
     - `FeedSortBy`: add `"custom"`
2. **Feed sorting behavior**
   - Update `applyFeedSortOrder()` to treat `by: "custom"` as “return stable input order” (no sorting).
3. **Folder sorting helper extraction**
   - Extract folder sorting from `Sidebar.applySortOrder` into a new pure util (e.g. `src/utils/sidebar-folder-sort-utils.ts`) that supports:
     - `by: "name" | "created" | "modified" | "custom"`
     - pinned-first stable partition for all modes; for `"custom"` preserve sibling order then recurse
4. **Unit tests (written first)**
   - `test_files/unit/sidebar-sort-custom.test.ts`:
     - feeds: `"custom"` preserves order
     - folders: `"custom"` preserves sibling order + pinned first

### Phase 2 — Ordering model/controller (pure, test-first)

1. **Introduce an importable ordering controller/model**
   - Add a class (e.g. `src/components/sidebar/sidebar-ordering-controller.ts` or `src/services/sidebar-ordering-controller.ts`) responsible for:
     - Reading/writing ordering-related settings
     - Applying current sort mode (including `"custom"`) to produce render order
     - Pure reorder operations (delegating to pure helpers)
2. **Pure helper functions (no DOM)**
   - Feed reorder helper:
     - `reorderFeedWithinFolder(settings, folderPath, draggedUrl, targetUrl, placement)`
     - `moveFeedAndInsert(settings, fromFolder, toFolder, draggedUrl, targetUrl, placement)`
     - Ensures `folderFeedSortOrders[folderPath].by = "custom"` (auto-switch)
   - Folder move helper:
     - `moveFolder(settings, draggedPath, targetPath, placement: before|after|nest|rootAppend)`
     - Validations: no descendant moves; no duplicate sibling name at destination
     - Remaps subtree paths in:
       - `feeds[].folder`
       - `collapsedFolders`
       - `folderFeedSortOrders` keys
     - Ensures `folderSortOrder.by = "custom"` (auto-switch)
3. **Unit tests (written first)**
   - `test_files/unit/sidebar-ordering-feeds.test.ts`:
     - reorder same folder before/after
     - cross-folder move+insert
     - auto-switch to `"custom"`
   - `test_files/unit/sidebar-ordering-folders.test.ts`:
     - reorder siblings
     - nest move + remap settings keys/feeds/collapsedFolders
     - reject illegal moves + reject duplicates
     - auto-switch to `"custom"`

### Phase 3 — Sidebar integration (DOM wiring)

1. **Wire feed drag/drop for reordering**
   - Keep existing drag-to-move-into-folder behavior.
   - Add drop targets on feed rows to support before/after insertion:
     - determine placement via cursor Y vs target midpoint
     - call controller helpers, then `saveSettings()` + `render()`
2. **Wire folder drag/drop for reorder + nesting**
   - Make folder headers draggable; set `dataTransfer` `folder-path`.
   - Add folder header drop handling:
     - top 25% = before, bottom 25% = after, middle 50% = nest
     - call controller, then `saveSettings()` + `render()`
   - Add root drop handling to un-nest/append to top-level.
3. **Add “Custom” to sort menus**
   - Sidebar toolbar sort menu: include a `Custom` row that sets global folder sort to custom and (optionally) all folder feed sorts to custom without changing arrays.
   - Per-folder feed sort menu: include `Custom` to set that folder’s feed sort mode to custom.

### Phase 4 — Styling + UX polish

- Update `src/styles/sidebar.css`:
  - Add visual indicators for folder drop modes: `drag-over-before`, `drag-over-after`, `drag-over-nest`
  - Add feed reorder indicator (top/bottom border highlight)
- Add minimal Notices on invalid folder moves (duplicate / illegal nesting).

### Phase 5 — Verification (must be green)

- Run `npm run test:unit` until green.
- Run `npm run build` and fix only issues caused by these changes.

### Assumptions / Defaults (locked)

- Folder DnD supports **reorder + nesting moves**.
- Pinned folders remain above unpinned even in Custom mode (stable within groups).
- Any successful manual reorder auto-switches to Custom.
- “Custom” persists via existing array order; no separate ordering store is introduced.
