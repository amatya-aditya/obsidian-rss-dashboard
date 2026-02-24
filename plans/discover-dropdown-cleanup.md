# Discover Page Dropdown Cleanup Plan

## Overview

The Discover page has redundant filtering mechanisms between the sidebar tabs and the top dropdown menus. This plan outlines the cleanup to simplify the UI.

## Current State

### Sidebar Tabs (Keep)

Located in [`discover-view.ts`](src/views/discover-view.ts:322-382):

- **Types** - Checkbox list of feed types with counts
- **Categories** - Hierarchical tree: Domain → Subdomain → Area → Topic
- **Tags** - Checkbox list of tags with counts

### Top Dropdown Menus (Remove)

Located in [`createTopFilterControls()`](src/views/discover-view.ts:887-935):
| Dropdown | Redundant With |
|----------|----------------|
| Domain | Categories tab (top level) |
| Sub domain | Categories tab (second level) |
| Area | Categories tab (third level) |
| Topic | Categories tab (fourth level) |
| Type | Types tab |
| Tag | Tags tab |

## Implementation Steps

### Step 1: Modify `createTopFilterControls()` in `src/views/discover-view.ts`

**Current code (lines 887-935):**

```typescript
private createTopFilterControls(container: HTMLElement): void {
  const topFilters = container.createDiv({
    cls: "rss-discover-top-filters",
  });

  this.renderFilterDropdown(topFilters, "Domain", "domain", "folder", this.getAllDomains());
  this.renderFilterDropdown(topFilters, "Sub domain", "subdomain", "folder-open", this.getAllSubdomains());
  this.renderFilterDropdown(topFilters, "Area", "area", "folder-tree", this.getAllAreas());
  this.renderFilterDropdown(topFilters, "Topic", "topic", "file-text", this.getAllTopics());
  this.renderFilterDropdown(topFilters, "Type", "type", "tag", this.getAllTypes());
  this.renderFilterDropdown(topFilters, "Tag", "tag", "hash", this.getAllTags());
  this.renderSortDropdown(topFilters);
}
```

**New code:**

```typescript
private createTopFilterControls(container: HTMLElement): void {
  const topFilters = container.createDiv({
    cls: "rss-discover-top-filters",
  });

  // Only keep the sort dropdown - filtering is handled by sidebar
  this.renderSortDropdown(topFilters);
}
```

### Step 2: Update Mobile Header in `src/views/discover-view.ts`

**Current behavior:** Hamburger menu shows the redundant dropdowns.

**New behavior:** Hamburger button opens `MobileDiscoverFiltersModal` directly.

**Modify `renderMobileHeader()` method (lines 414-453):**

The current hamburger menu creates a dropdown with `createTopFilterControls()`. Instead:

1. Remove the dropdown menu creation
2. Make the hamburger button directly call `this.openMobileSidebar()`

**Current code:**

```typescript
private renderMobileHeader(container: HTMLElement): {
  hamburgerMenu: HTMLElement;
  hamburgerButton: HTMLElement;
} {
  const header = container.createDiv({
    cls: "rss-discover-mobile-header",
  });

  const leftSection = header.createDiv({
    cls: "rss-discover-header-left",
  });

  const sidebarToggleButton = leftSection.createDiv({
    cls: "rss-dashboard-sidebar-toggle",
    attr: { title: "Toggle filters" },
  });
  setIcon(sidebarToggleButton, "panel-left");
  sidebarToggleButton.addEventListener("click", () => {
    this.openMobileSidebar();
  });

  leftSection.createDiv({
    cls: "rss-discover-header-title",
    text: "RSS Discover",
  });

  const rightSection = header.createDiv({
    cls: "rss-discover-header-right",
  });

  const hamburgerMenu = rightSection.createDiv({
    cls: "rss-discover-hamburger-menu",
  });
  const hamburgerButton = hamburgerMenu.createEl("button", {
    cls: "rss-discover-hamburger-button",
  });
  setIcon(hamburgerButton, "menu");

  return { hamburgerMenu, hamburgerButton };
}
```

**New code:**

```typescript
private renderMobileHeader(container: HTMLElement): void {
  const header = container.createDiv({
    cls: "rss-discover-mobile-header",
  });

  const leftSection = header.createDiv({
    cls: "rss-discover-header-left",
  });

  const sidebarToggleButton = leftSection.createDiv({
    cls: "rss-dashboard-sidebar-toggle",
    attr: { title: "Toggle filters" },
  });
  setIcon(sidebarToggleButton, "panel-left");
  sidebarToggleButton.addEventListener("click", () => {
    this.openMobileSidebar();
  });

  leftSection.createDiv({
    cls: "rss-discover-header-title",
    text: "RSS Discover",
  });

  const rightSection = header.createDiv({
    cls: "rss-discover-header-right",
  });

  // Sort dropdown directly in header for mobile
  const sortContainer = rightSection.createDiv({
    cls: "rss-discover-sort-container rss-discover-mobile-sort",
  });
  this.renderSortDropdown(sortContainer);
}
```

### Step 3: Update `renderContent()` Method

**Modify lines 767-885** to remove the hamburger menu dropdown logic:

Remove:

- The hamburger menu dropdown creation
- The click handler for toggling dropdown
- The document click handler for closing dropdown

### Step 4: Clean Up CSS in `src/styles/discover.css`

Remove or simplify these CSS rules that are no longer needed:

1. **Lines 370-479**: `.rss-discover-top-filters` and related dropdown styles
   - Keep only what's needed for the sort dropdown
   - Remove `.rss-discover-filter-container`, `.rss-discover-filter-input`, `.rss-discover-filter-dropdown` styles

2. **Lines 756-835**: Hamburger menu dropdown styles
   - Remove `.rss-discover-hamburger-menu .rss-discover-dropdown-menu` styles

### Step 5: Remove Unused Helper Methods

These methods in [`discover-view.ts`](src/views/discover-view.ts) may no longer be needed:

- [`renderFilterDropdown()`](src/views/discover-view.ts:978-1045)
- [`populateFilterDropdown()`](src/views/discover-view.ts:1047-1098)
- [`isOptionSelected()`](src/views/discover-view.ts:1100-1127)
- [`getOptionCount()`](src/views/discover-view.ts:1129-1146)
- [`handleFilterSelection()`](src/views/discover-view.ts:1148-1229)
- [`getAllDomains()`](src/views/discover-view.ts:1231-1237)
- [`getAllSubdomains()`](src/views/discover-view.ts:1239-1245)
- [`getAllAreas()`](src/views/discover-view.ts:1247-1253)
- [`getAllTopics()`](src/views/discover-view.ts:1255-1261)
- [`getAllTypes()`](src/views/discover-view.ts:1263-1265)
- [`getAllTags()`](src/views/discover-view.ts:1267-1268)

**Note:** Some of these may still be used by the sidebar rendering. Verify before removing.

## Files to Modify

| File                         | Changes                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `src/views/discover-view.ts` | Remove redundant dropdown methods, update mobile header |
| `src/styles/discover.css`    | Remove unused dropdown styles                           |

## Testing Checklist

- [ ] Desktop: Sidebar tabs still work correctly
- [ ] Desktop: Sort dropdown functions properly
- [ ] Desktop: Results count and Clear filters button visible
- [ ] Mobile: Hamburger button opens MobileDiscoverFiltersModal
- [ ] Mobile: Sort dropdown accessible
- [ ] No console errors
- [ ] Build succeeds with `npm run build`

## Benefits

1. **Simplified UI** - One clear filtering mechanism via sidebar
2. **Less code** - Remove ~300+ lines of redundant code
3. **Better UX** - No confusion between two filtering systems
4. **Consistent mobile experience** - Same modal-based filtering as dashboard
