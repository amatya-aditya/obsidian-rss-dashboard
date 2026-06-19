## Plan: Multi-Folder Ctrl+Click Selection in Sidebar

**TL;DR:** Add multi-folder selection to sidebar via Ctrl+Click. Users can aggregate articles from multiple folders simultaneously. Single-click preserves single-folder behavior. Clear multi-selection on "All Feeds" click, feed selection, or tag toggle. Keyboard (Enter) will toggle multi-selection in existing multi-select mode.

---

/plan # Multi-Folder Ctrl+Click Selection in Sidebar

Ctrl+clicking a folder in the sidebar will toggle it in/out of a `selectedFolders` set. The dashboard article list then shows articles from **all** folders in the selection. A plain click always resets to single-folder mode (existing behaviour). All changes follow a strict Red → Green → Refactor TDD cycle per the [testing guide](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/docs/development/test_coverage/testing-guide.md).

---

## Open Questions

> [!IMPORTANT]
> **Should Ctrl+Click also clear the "All Feeds" state?**
> Current plan: yes — initiating multi-select exits the All-Feeds view, just like a regular folder click.

> [!NOTE]
> **Should multi-selection persist across re-renders / navigation?**
> Current plan: multi-selection is cleared whenever the user clicks "All Feeds", clicks a single feed, or toggles tags. It is preserved across sidebar re-renders (same behaviour as `currentFolder`).

---

## Proposed Changes

### Phase 0 — TDD: Write failing tests first (RED)

#### [MODIFY] [sidebar-core.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/components/sidebar-core.test.ts)

Add a new `describe("multi-folder ctrl+click selection")` block **before** implementation exists. Tests will fail (RED). Cases:

| #   | Test name                                                                    | What it asserts                                                                                  |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | ctrl+click a folder calls `onFolderMultiSelect` with the clicked folder path | `onFolderMultiSelect` invoked with `["Folder 1"]`                                                |
| 2   | ctrl+click a second folder appends it to the set                             | `onFolderMultiSelect` called with `["Folder 1", "Folder 2"]` after rendering with first selected |
| 3   | ctrl+click an already-selected folder removes it                             | `onFolderMultiSelect` called with `[]` when `selectedFolders` already contains the folder        |
| 4   | plain click clears any existing multi-selection via `onFolderClick`          | `onFolderMultiSelect` NOT called; `onFolderClick` called with the folder path                    |
| 5   | multi-selected folders render with `multi-selected` CSS class                | folder header has `multi-selected` class when `options.selectedFolders` includes its path        |
| 6   | non-multi-selected folders do not render `multi-selected` class              | control check                                                                                    |

#### [NEW] `test_files/unit/views/dashboard-multi-folder.test.ts`

New file: unit-level tests for the dashboard article-filtering logic with multiple folders. RED cases:

| #   | Test name                                                                       | What it asserts                                 |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| 7   | `handleFolderMultiSelect(["A","B"])` sets `selectedFolders` and triggers render | state is updated                                |
| 8   | article pool includes items from all selected folders                           | articles from folder A and folder B both appear |
| 9   | article pool excludes items from folders not in selection                       | articles from folder C absent                   |
| 10  | ctrl+clicking All-Feeds button clears `selectedFolders`                         | `selectedFolders` is `[]`                       |

---

### Phase 1 — Types & Interfaces (GREEN step 1)

#### [MODIFY] [sidebar.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts)

**`SidebarOptions`** — add one field:

```diff
 export interface SidebarOptions {
   currentFolder: string | null;
   currentFeed: Feed | null;
   selectedTags: string[];
   tagsCollapsed: boolean;
   collapsedFolders: string[];
+  selectedFolders: string[];   // paths of ctrl+click–selected folders (multi-select)
 }
```

**`SidebarCallbacks`** — add one optional callback (optional so existing callers compile without change):

```diff
 export interface SidebarCallbacks {
   onFolderClick: (folder: string | null) => void;
+  onFolderMultiSelect?: (folders: string[]) => void;
   ...
 }
```

---

### Phase 2 — Sidebar rendering (GREEN step 2)

#### [MODIFY] [sidebar.ts](file:///c:/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts)

**`renderFolder()`** — modify the `"click"` listener on `folderHeader` (~L1034):

```diff
 folderHeader.addEventListener("click", (e) => {
   if (e.button === 0) {
+    // Ctrl+click (or Meta+click on macOS): toggle this folder in multi-selection
+    if (e.ctrlKey || e.metaKey) {
+      if (this.callbacks.onFolderMultiSelect) {
+        const current = [...(this.options.selectedFolders ?? [])];
+        const idx = current.indexOf(fullPath);
+        if (idx === -1) {
+          current.push(fullPath);
+        } else {
+          current.splice(idx, 1);
+        }
+        this.callbacks.onFolderMultiSelect(current);
+      }
+      return;
+    }
     if (
       e.target === toggleButton ||
       toggleButton.contains(e.target as Node)
     ) {
       ...collapse logic unchanged...
     } else {
       this.callbacks.onFolderClick(fullPath);
     }
   }
 });
```

**`renderFolder()`** — apply `multi-selected` CSS class to `folderHeader` when the folder is in `selectedFolders`:

```diff
 const folderHeader = folderEl.createDiv({
   cls:
     "rss-dashboard-feed-folder-header" +
     (isCollapsed ? " collapsed" : "") +
-    (shouldHighlight ? " active" : ""),
+    (shouldHighlight ? " active" : "") +
+    ((this.options.selectedFolders ?? []).includes(fullPath) ? " multi-selected" : ""),
   ...
 });
```

**`isActive` / `shouldHighlight`** — when `selectedFolders` has entries, `isActive` for a single folder should still reflect the `currentFolder` path (they coexist). No change needed to existing `isActive` logic.

---

### Phase 3 — CSS (GREEN step 3)

#### [MODIFY] [sidebar.css](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/styles/sidebar.css)

Add after the `.rss-dashboard-feed-folder-header.active` block (~L720):

```css
/* Multi-folder ctrl+click selection indicator */
.rss-dashboard-feed-folder-header.multi-selected {
  background-color: color-mix(
    in srgb,
    var(--interactive-accent) 14%,
    var(--background-primary)
  );
  border-left-color: var(--interactive-accent);
}

.rss-dashboard-feed-folder-header.multi-selected
  .rss-dashboard-feed-folder-name {
  color: var(--text-accent);
}
```

---

### Phase 4 — Dashboard-view wiring (GREEN step 4)

#### [MODIFY] [dashboard-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts)

**Add state field** (~L64, next to `currentFolder`):

```diff
 public currentFolder: string | null = null;
+public selectedFolders: string[] = [];   // multi-folder selection (ctrl+click)
```

**Reset on init** (~L153):

```diff
 this.currentFolder = null;
+this.selectedFolders = [];
```

**`handleFolderMultiSelect`** — new private method (add after `handleFolderClick`):

```typescript
private handleFolderMultiSelect(folders: string[]): void {
  this.inlineArticle = null;
  this.selectedFolders = folders;
  // When entering multi-select, clear single-folder and feed selection
  this.currentFeed = null;
  this.currentFolder = folders.length === 1 ? folders[0] : null;
  this.selectedTags = [];
  void this.render();
}
```

**`handleFolderClick`** — clear `selectedFolders` on any plain folder click:

```diff
 private handleFolderClick(folder: string | null): void {
   this.inlineArticle = null;
+  this.selectedFolders = [];
   ...existing logic unchanged...
 }
```

**Article pool building** — extend the `else if (this.currentFolder)` branch (~L1520) to also handle `selectedFolders`:

```diff
+} else if (this.selectedFolders.length > 0) {
+  // Multi-folder mode: union of all descendant folders for each selected path
+  const allFolders = new Set<string>();
+  for (const path of this.selectedFolders) {
+    for (const f of this.getAllDescendantFolders(path)) {
+      allFolders.add(f);
+    }
+  }
+  for (const feed of this.settings.feeds) {
+    if (feed.folder && allFolders.has(feed.folder)) {
+      articles = articles.concat(
+        feed.items.map((item) => ({
+          ...item,
+          feedTitle: feed.title,
+          feedUrl: feed.url,
+        })),
+      );
+    }
+  }
 } else if (this.currentFolder) {
   ...existing logic unchanged...
 }
```

**Sidebar options binding** — pass `selectedFolders` in both the constructor call (~L748) and the per-render assignment (~L823):

```diff
 {
   currentFolder: this.currentFolder,
   currentFeed: this.currentFeed,
   selectedTags: this.selectedTags,
   tagsCollapsed: this.tagsCollapsed,
   collapsedFolders: this.collapsedFolders,
+  selectedFolders: this.selectedFolders,
 }
```

**Sidebar callbacks** — wire up new callback in both the constructor call and the mobile sidebar modal (~L755 and L2146):

```diff
 onFolderClick: this.handleFolderClick.bind(this),
+onFolderMultiSelect: this.handleFolderMultiSelect.bind(this),
```

**`handleFeedClick`** — clear `selectedFolders`:

```diff
 private handleFeedClick(feed: Feed): void {
+  this.selectedFolders = [];
   ...existing logic...
 }
```

**`handleTagToggle`** — clear `selectedFolders`:

```diff
 private handleTagToggle(tag: string): void {
+  this.selectedFolders = [];
   ...existing logic...
 }
```

---

### Phase 5 — Refactor

- Extract the multi-folder article pool logic into a private helper `getArticlesForSelectedFolders()` to keep `buildArticlePool()` readable.
- Ensure `TestSidebar` type in `sidebar-core.test.ts` exposes the new `options.selectedFolders` field (no production change needed).

---

## Known Issue (observed after initial fix)

Symptoms:

- Multi-selection works only when selecting folders in top-down DOM order (e.g. A → B → C).
- Selecting in reverse order (B → A) or selecting non-contiguous combinations (A → C) does not produce the expected `selectedFolders` set.

Notes:

- The click handler currently builds `current` from `this.options.selectedFolders` and toggles the clicked folder via array index operations. The behaviour suggests an order- or mutation-related race when the sidebar state is mirrored between the dashboard and the sidebar instance.

---

## Suggested Next Solution (to implement and test)

1. Tests: Add unit tests that reproduce the failing cases (reverse-order and non-contiguous selections) to `sidebar-core.test.ts` and `views/dashboard-multi-folder.test.ts`.

2. Use a Set-based toggle in the sidebar click handler:

- Replace the array-index toggle with a `Set` to avoid order-sensitive edge cases:
  - `const currentSet = new Set(this.options.selectedFolders ?? []);`
  - Toggle membership: `currentSet.has(fullPath) ? currentSet.delete(fullPath) : currentSet.add(fullPath)`
  - Call the callback with `Array.from(currentSet)` (preserves insertion order but is robust to toggles).

3. Ensure immutability / defensive copies:

- Always operate on a shallow copy or a new Set derived from `this.options.selectedFolders` to avoid in-place mutation that other code may observe.

4. Dashboard handler: confirm `handleFolderMultiSelect` preserves order and does not normalize or sort `folders` (it should accept the array as-is).

5. Add logging in development build (or a temporary test hook) to assert `options.selectedFolders` content immediately after each click to detect where ordering changes.

6. Run the new tests and iterate until the reverse-order and non-contiguous selections pass.

Rationale: using a Set for membership toggles avoids subtle index/ordering bugs and makes toggling idempotent and order-robust; the tests will prevent regressions.

---

## Current State (tag interaction regression)

Observed behaviour:

- Multi-folder selection (Ctrl+click A, B, C) now works robustly in the sidebar.
- However, clicking any tag in the sidebar's tag list clears the `selectedFolders` multi-selection and reverts to single-folder or all-feeds behavior.

Why this is a problem:

- Users expect tags to act as an additional filter applied to the current folder-selection (including multi-folder selections). Clearing `selectedFolders` on tag toggle breaks the combined filtering workflow (e.g., A+B + tag=X).

Root cause hypothesis:

- The dashboard view currently clears `selectedFolders` when handling tag toggles (intent was to reset multi-folder selection for some flows). This unconditional clear prevents tag+multi-folder combined filtering.

---

## Suggested Fix (preserve multi-folder selection when toggling tags)

Goal: allow users to combine multi-folder selection with tag filters. Ctrl+click multiple folders to select a set, then use tag checkboxes to filter articles within that set without losing the `selectedFolders` selection.

Implementation steps:

1. Tests

- Add unit tests to assert that `handleFolderMultiSelect(["A","B"])` followed by tag toggles keeps `selectedFolders` unchanged and updates `selectedTags` as expected.
- Add UI-level tests for the sidebar to ensure the `multi-selected` class remains applied after tag clicks.

2. Dashboard handler changes

- Remove or gate the existing `this.selectedFolders = []` line(s) in `handleTagToggle()` and `handleClearTags()` in `src/views/dashboard-view.ts`.
- Instead, only clear `selectedFolders` when the user performs an explicit action that should cancel multi-select (e.g., clicking a single folder, clicking "All Feeds", or selecting a single feed). Keep tag toggles independent.

3. Mobile modal considerations

- Ensure `MobileNavigationModal`'s wrapped callbacks do not mirror tag clicks in a way that clears `options.selectedFolders`.
- When the modal mirrors tag toggles into `this.options.selectedTags`, do not reset `options.selectedFolders`.

4. Sidebar render and state

- Confirm the sidebar's `render()` uses both `options.selectedFolders` and `options.selectedTags` to decide `multi-selected` classes and article pool filtering.
- Update any logic that treats selectedTags as a mutual-exclusion trigger for selectedFolders.

5. Backwards compatibility and UX

- Preserve the current behavior where single-folder clicks clear multi-select.
- Consider adding a brief helper tooltip in the UI (or docs) describing that tag filters apply on top of folder multi-selection.

6. Run tests and iterate

- Run unit tests and manual UI checks. Iterate until the tests cover the new combined workflows.

Rationale: Tags are orthogonal to folder selection; making them combinable is more flexible and matches user expectation for filtering UIs.
