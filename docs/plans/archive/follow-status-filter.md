# Follow Status Filter for Discover Page

## Overview

Add a dropdown filter to the Discover page that allows users to filter feeds by follow status: **All**, **Followed**, or **Unfollowed**. This helps users quickly find new feeds to follow or manage their existing subscriptions.

## UI Design Decision

**Chosen approach: Dropdown (Native `<select>` element)**

Reasons:

- Consistent with existing sort dropdown in the same view
- Minimal space usage in the filter header
- Mutually exclusive options (user can only pick one)
- Native accessibility support
- No additional CSS required (reuse `.rss-discover-sort-dropdown` styles)

---

## Files to Modify

### 1. `src/types/discover-types.ts`

Add `followStatus` property to the `DiscoverFilters` interface.

### 2. `src/views/discover-view.ts`

Primary implementation file - add filter logic and UI.

### 3. `src/styles/discover.css`

No changes required - reuse existing dropdown styles.

---

## Implementation Details

### 1. `src/types/discover-types.ts`

**Location**: End of file, add new type and update interface

**Add follow status type:**

```typescript
export type FollowStatus = "all" | "followed" | "unfollowed";
```

**Update `DiscoverFilters` interface (line 46-51):**

```typescript
export interface DiscoverFilters {
  query: string;
  selectedTypes: string[];
  selectedPaths: CategoryPath[];
  selectedTags: string[];
  followStatus: FollowStatus;
}
```

---

### 2. `src/views/discover-view.ts`

#### 2a. Update Import Statement

**Location**: Line 2-7

```typescript
import {
  FeedMetadata,
  CategoryPath,
  DiscoverFilters,
  FollowStatus,
} from "../types/discover-types";
```

#### 2b. Initialize Default Filter Value

**Location**: Line 21-26

```typescript
private filters: DiscoverFilters = {
  query: "",
  selectedTypes: [],
  selectedPaths: [],
  selectedTags: [],
  followStatus: "all",
};
```

#### 2c. Update `filterFeeds()` Method

**Location**: Line 129-206 - Add follow status filter after tag filter

```typescript
private filterFeeds(): void {
  this.filteredFeeds = this.feeds.filter((feed) => {
    // ... existing query filter (line 131-148) ...

    // ... existing type filter (line 150-154) ...

    // ... existing path filter (line 156-191) ...

    // ... existing tag filter (line 193-200) ...

    // NEW: Follow status filter
    if (this.filters.followStatus === 'followed') {
      const isFollowed = this.plugin.settings.feeds.some(
        (f: Feed) => f.url === feed.url
      );
      if (!isFollowed) {
        return false;
      }
    } else if (this.filters.followStatus === 'unfollowed') {
      const isFollowed = this.plugin.settings.feeds.some(
        (f: Feed) => f.url === feed.url
      );
      if (isFollowed) {
        return false;
      }
    }

    return true;
  });
  this.sortFeeds();
  this.currentPage = 1;
}
```

#### 2d. Add `renderFollowStatusDropdown()` Method

**Location**: After `renderSortDropdown()` method (after line 896)

```typescript
private renderFollowStatusDropdown(container: HTMLElement): void {
  const dropdownContainer = container.createDiv({
    cls: "rss-discover-follow-status-container",
  });

  const dropdown = dropdownContainer.createEl("select");
  dropdown.addClass("rss-discover-sort-dropdown");

  const options: { value: FollowStatus; text: string }[] = [
    { value: "all", text: "All feeds" },
    { value: "followed", text: "Followed" },
    { value: "unfollowed", text: "Unfollowed" },
  ];

  options.forEach((opt) => {
    const optionEl = dropdown.createEl("option", {
      value: opt.value,
      text: opt.text,
    });
    if (opt.value === this.filters.followStatus) {
      optionEl.selected = true;
    }
  });

  dropdown.addEventListener("change", (e) => {
    this.filters.followStatus = (e.target as HTMLSelectElement).value as FollowStatus;
    this.currentPage = 1;
    this.filterFeeds();
    this.saveFilterState();
    const contentEl = this.containerEl.querySelector(
      ".rss-discover-content",
    ) as HTMLElement;
    if (contentEl) {
      this.renderContent(contentEl);
    }
  });
}
```

#### 2e. Wire Dropdown to Filter Header

**Location**: `renderContent()` method, inside `leftSection` creation (around line 782-791)

```typescript
private renderContent(container: HTMLElement): void {
  container.empty();

  // ... controls container setup ...

  // ... mobile header ...

  const filterHeader = controlsContainer.createDiv({
    cls: "rss-discover-filter-header",
  });

  const leftSection = filterHeader.createDiv({
    cls: "rss-discover-filter-header-left",
  });

  const resultsCount = leftSection.createDiv({
    cls: "rss-discover-results-count",
  });
  resultsCount.textContent = `${this.filteredFeeds.length} feeds found`;

  // NEW: Add follow status dropdown here
  this.renderFollowStatusDropdown(leftSection);

  this.renderSelectedFilters(leftSection);

  // ... rest of method ...
}
```

#### 2f. Update `hasActiveFilters()` Method

**Location**: Line 1143-1150

```typescript
private hasActiveFilters(): boolean {
  return (
    this.filters.query !== "" ||
    this.filters.selectedTypes.length > 0 ||
    this.filters.selectedPaths.length > 0 ||
    this.filters.selectedTags.length > 0 ||
    this.filters.followStatus !== "all"
  );
}
```

#### 2g. Update Clear Filters Button

**Location**: Inside `renderContent()` where clear button is defined (around line 800-816)

```typescript
clearBtn.addEventListener("click", () => {
  this.filters = {
    query: "",
    selectedTypes: [],
    selectedPaths: [],
    selectedTags: [],
    followStatus: "all",
  };
  this.currentPage = 1;
  this.filterFeeds();
  this.saveFilterState();
  void this.render();
});
```

---

## Task Checklist

### Phase 1: Type Definitions

- [ ] Add `FollowStatus` type to `src/types/discover-types.ts`
- [ ] Add `followStatus: FollowStatus` property to `DiscoverFilters` interface

### Phase 2: Discover View - Filter Logic

- [ ] Import `FollowStatus` type in `src/views/discover-view.ts`
- [ ] Add `followStatus: "all"` to default filters initialization
- [ ] Add follow status filtering logic to `filterFeeds()` method
- [ ] Update `hasActiveFilters()` to include `followStatus !== "all"`

### Phase 3: Discover View - UI

- [ ] Create `renderFollowStatusDropdown()` method
- [ ] Call the method in `renderContent()` within `leftSection`
- [ ] Update clear filters button to reset `followStatus` to `"all"`

### Phase 4: Testing

- [ ] Test "All feeds" shows all feeds
- [ ] Test "Followed" only shows feeds that exist in settings.feeds
- [ ] Test "Unfollowed" only shows feeds not in settings.feeds
- [ ] Test filter state persists on page reload (localStorage)
- [ ] Test "Clear filters" resets follow status to "All"
- [ ] Test filter works in combination with other filters (type, tags, etc.)
- [ ] Verify counts update correctly when filtering

---

## Visual Mockup

### Filter Header with Dropdown

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 42 feeds found │ [All feeds ▾] │ 🔍 "tech" │ 📁 Tech │ #popular   × │ │
│ │                                    [Clear filters]  │ Sort: A-Z ▾ │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Notes

### Follow Status Detection

A feed is considered "followed" if its URL exists in `this.plugin.settings.feeds`:

```typescript
const isFollowed = this.plugin.settings.feeds.some(
  (f: Feed) => f.url === feed.url,
);
```

### Filter State Persistence

The filter state is saved to localStorage via `this.app.saveLocalStorage()` and restored in `loadData()`. The new `followStatus` property will be automatically included since the entire `filters` object is saved.

### Import Type for Feed

The `Feed` type is imported from `../types/types`:

```typescript
import { RssDashboardSettings, Feed } from "../types/types";
```

This is already imported in `discover-view.ts` at line 7.

---

## Risk Assessment

### Low Risk

- Simple dropdown filter with clear logic
- Reuses existing dropdown styles
- Follows established patterns in the codebase
- Filter state persistence is automatic

### Considerations

- Performance: Filtering by URL comparison is O(n\*m) where n = discover feeds, m = user feeds. This is acceptable given typical feed counts.
- Edge case: If a feed URL changes in the user's settings, it won't match. This is expected behavior.

---

## Dependencies

- Existing `DiscoverFilters` interface in `src/types/discover-types.ts`
- Existing `Feed` type in `src/types/types.ts`
- Existing `this.plugin.settings.feeds` array
- Existing dropdown styles in `src/styles/discover.css` (`.rss-discover-sort-dropdown`)
- Existing localStorage save/restore mechanism
