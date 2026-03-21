# Tags Sidebar Section — Implementation Plan

Add a toggleable tags section to the sidebar (beneath "All Feeds"), controlled by a new **tags** icon in the header toolbar. Users can select multiple tags to filter articles in the dashboard with selectable **AND / OR / NOT** filter logic. An inline "add tag" row persists at the bottom of the section.

## Current Status & Progress

- [x] **Registry & Types** — `sidebar-icon-registry.ts` and `types.ts` updated with new `tags` icon and multi-tag settings.
- [x] **Sidebar Implementation** — `sidebar.ts` updated with `tags` icon toggle case and `renderTagsSection` logic.
- [x] **Unit Testing** — Comprehensive unit tests for filtering logic (AND/OR/NOT), tag selection, and tag creation logic written in `test_files/unit/sidebar-tags-section.test.ts`.
- [/] **Dashboard View** — Multi-tag filtering and state refactoring in `dashboard-view.ts` is in progress.
- [ ] **Mobile Navigation** — Refactor `mobile-navigation-modal.ts` to support multi-tag toggle.
- [ ] **Styles** — Final border and layout styling in `sidebar.css`.
- [ ] **Full Verification** — End-to-end testing, final build, and manual verification in Obsidian.

## User Review Required

> [!IMPORTANT]
> **Multi-tag replaces single-tag** — The existing `currentTag: string | null` in [dashboard-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts) will be refactored to `selectedTags: string[]`. The `SidebarOptions.currentTag` and `SidebarCallbacks.onTagClick` signatures change accordingly. The sidebar's `onTagClick` callback will toggle a tag name in/out of the array rather than selecting a single tag. This is a **breaking change** to the internal API contract between sidebar and dashboard-view.

> [!IMPORTANT]
> **Tag filter mode** — Three toggle buttons control how selected tags filter articles:
> - **AND** — articles must have **every** selected tag
> - **OR** — articles with **at least one** selected tag (default)
> - **NOT** — articles that have **none** of the selected tags
>
> The mode is stored as `sidebarTagFilterMode: "and" | "or" | "not"` in [RssDashboardSettings](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts#271-335) so it persists across sessions.

---

## Proposed Changes

### Icon Registry & Types

#### [MODIFY] [sidebar-icon-registry.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/utils/sidebar-icon-registry.ts)
- Add a new `tags` icon entry: `{ id: "tags", label: "Tags", lucideIcon: "tags", settingKey: "hideIconTags" }`
- Place it after the `search` icon in the array

#### [MODIFY] [types.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts)
- Add `hideIconTags: boolean` to [DisplaySettings](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts#154-205)
- Add `"tags"` to the default `iconOrder` array (after `"search"`)
- Set `hideIconTags: false` in `DEFAULT_SETTINGS.display`
- Add `sidebarTagFilterMode: "and" | "or" | "not"` to [RssDashboardSettings](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts#271-335) (default `"or"`)
- Change `SidebarOptions.currentTag: string | null` → `selectedTags: string[]`
- Change `SidebarCallbacks.onTagClick: (tag: string | null) => void` → `onTagToggle: (tag: string) => void` (toggle semantics)
- Add `SidebarCallbacks.onClearTags: () => void` for clearing all selected tags
- Add `SidebarCallbacks.onTagFilterModeChange: (mode: "and" | "or" | "not") => void`

---

### Sidebar Rendering

#### [MODIFY] [sidebar.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts)

**Header icon ([renderHeader](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts#1775-2004))**
- Add a `case "tags"` in the switch block (after `"search"`) that toggles `isTagsExpanded` and re-renders, similar to the search icon toggle. The icon highlights when the tags section is visible (`is-active` class).

**Tags section rendering (`renderTagsSection`)**
- New private method `renderTagsSection(container)` called inside [renderFeedFolders](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts#546-703), immediately after [renderAllFeedsButton](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts#704-776), gated by `this.isTagsExpanded`.
- Creates a `div.rss-dashboard-sidebar-tags-section` with the specified border styling (`solid 1px hsl(0deg 0% 80% / 25%)` on right, bottom, left; no top border).
- **Filter mode buttons** — A row of 3 toggle buttons at the top of the section: **AND**, **OR**, **NOT**. Styled as a compact button group (`.rss-dashboard-tag-filter-mode-group`). Only one can be active at a time. Clicking sets `settings.sidebarTagFilterMode` and calls `callbacks.onTagFilterModeChange(mode)`.
- Iterates `settings.availableTags` and renders each tag as a row (`div.rss-dashboard-sidebar-tag-row`) containing:
  - A color dot (`div.rss-dashboard-tag-color-dot`)
  - Tag name label
  - Active/selected state (highlighted background when tag name is in `options.selectedTags`)
- Click handler calls `callbacks.onTagToggle(tag.name)` to toggle selection.
- **Inline add-tag row** — Always rendered as the last row. Contains:
  - A color picker input (default `#3498db`)
  - A text input (`placeholder: "Add new tag..."`)
  - A plus button that creates the tag via `settings.availableTags.push(newTag)`, persists, and re-renders.
  - Reuses the same validation and add logic from [tags-dropdown-portal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/utils/tags-dropdown-portal.ts).

**Update [renderAllFeedsButton](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts#704-776) active state**
- `isAllActive` should also check `options.selectedTags.length === 0`.

**Update [SidebarOptions](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts#30-37) / [SidebarCallbacks](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/sidebar.ts#38-74) references**
- Replace `currentTag` → `selectedTags` and `onTagClick` → `onTagToggle` throughout.

---

### Settings Tab (Auto-Included)

#### [NO CHANGES NEEDED] [settings-tab.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/settings/settings-tab.ts)
- The icon visibility section in settings is **fully data-driven** from `SIDEBAR_ICONS` / `SIDEBAR_ICON_IDS`. Adding the `tags` icon to the registry automatically creates its settings row with toggle, drag handle, and up/down reorder buttons. No manual [settings-tab.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/settings/settings-tab.ts) changes are needed.

---

### Dashboard View (Multi-Tag Filtering)

#### [MODIFY] [dashboard-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts)
- Replace `private currentTag: string | null = null` with `private selectedTags: string[] = []`
- `handleTagToggle(tag: string)`: toggles the tag in `selectedTags`. If `selectedTags` becomes non-empty, clears `currentFolder` and `currentFeed`. If it becomes empty, equivalent to "all feeds" view.
- `handleClearTags()`: sets `selectedTags = []`, re-renders.
- `handleTagFilterModeChange(mode)`: sets `settings.sidebarTagFilterMode`, persists, re-renders.
- Update [getFilteredArticles()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts#679-820) to filter based on `settings.sidebarTagFilterMode`:
  - `"or"`: `item.tags?.some(t => this.selectedTags.includes(t.name))`
  - `"and"`: `this.selectedTags.every(name => item.tags?.some(t => t.name === name))`
  - `"not"`: `!item.tags?.some(t => this.selectedTags.includes(t.name))`
- Update `getCurrentTitle()` to show `"Tags (OR): tag1, tag2"` or `"Tags (AND): ..."` or `"Tags (NOT): ..."` depending on mode.
- Update [handleFolderClick](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts#1070-1111) and [handleFeedClick](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts#1112-1140) to clear `selectedTags = []` instead of `currentTag = null`.
- Update [matchesFilters](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts#1697-1829) and refresh logic that references `currentTag`.
- Pass `selectedTags`, `onTagToggle`, `onClearTags`, and `onTagFilterModeChange` to sidebar/mobile-nav instead of `currentTag`/`onTagClick`.

---

### Mobile Navigation Modal

#### [MODIFY] [mobile-navigation-modal.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/modals/mobile-navigation-modal.ts)
- Update `onTagClick` references to `onTagToggle` with multi-tag semantics.

---

### Styles

#### [MODIFY] [sidebar.css](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/styles/sidebar.css)
- Add or update `.rss-dashboard-sidebar-tags-section` with the specified border:
  ```css
  border-right: solid 1px hsl(0deg 0% 80% / 25%);
  border-bottom: solid 1px hsl(0deg 0% 80% / 25%);
  border-left: solid 1px hsl(0deg 0% 80% / 25%);
  border-top: none;
  ```
- Style `.rss-dashboard-sidebar-tag-row` for tag rows (hover, active/selected state).
- Style `.rss-dashboard-tag-filter-mode-group` — compact segmented button group for AND/OR/NOT with active highlight.
- Style the inline add-tag input row within the section.

---

## Verification Plan

### Automated Tests

Tests use **Vitest** with jsdom. Run with: `npm run test:unit`

#### [NEW] [sidebar-tags-section.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/sidebar-tags-section.test.ts)

Tests for the pure-logic aspects of the tags section:
1. **Multi-tag OR filtering** — selecting `["youtube", "important"]` with mode `"or"` returns articles with _either_ tag
2. **Multi-tag AND filtering** — selecting `["youtube", "important"]` with mode `"and"` returns only articles with _both_ tags
3. **Multi-tag NOT filtering** — selecting `["youtube"]` with mode `"not"` returns articles that do _not_ have the "youtube" tag
4. **Tag toggle** — toggling a tag that's already selected removes it; toggling one that isn't adds it
5. **Clearing tags** — clearing all tags returns to full article view
6. **Tag creation validation** — empty name is rejected; duplicate name is rejected; valid name is added
7. **Filter mode persistence** — changing mode from "or" to "and" persists correctly

#### Existing tests (regression)
Run the full test suite to ensure no regressions: `npm run test:unit`

### Build Verification
```
npm run build
```
Must complete without errors or warnings.

### Manual Verification
1. Open the Obsidian RSS Dashboard plugin
2. Verify the **tags icon** (Lucide `tags`) appears in the sidebar header
3. Click it — a tags section should appear beneath "All Feeds" with a bordered container
4. Click a tag — articles matching that tag should appear in the dashboard
5. Click a second tag — articles matching **either** tag should now appear
6. Un-click a tag — that tag's articles are removed from the filter
7. Use the inline input row to create a new tag — it should appear in the list
8. Click the tags icon again — the section should hide
9. Verify mobile sidebar also shows tags correctly
