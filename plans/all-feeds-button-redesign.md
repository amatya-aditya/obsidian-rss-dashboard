# All Feeds Button Redesign

## Overview

This document outlines the plan to redesign the "All items" button in the sidebar. The button will be renamed to "All Feeds", moved to the top of the Feed List section, and enhanced with feed count and unread indicator functionality.

## Current Implementation

### Location

The "All items" button is currently located in the filters section at the top of the sidebar, rendered by the [`renderFilters()`](src/components/sidebar.ts:1501) method in [`sidebar.ts`](src/components/sidebar.ts).

### Current Code

```typescript
// Line 1558 in sidebar.ts
createFilterItem("all", "list", "All items", isAllActive, row1);
```

### Current Behavior

- Displays as a filter button with a "list" icon
- When clicked, calls `onFolderClick(null)` to show all items from all feeds
- Located in the filters section alongside Search and Refresh buttons

## Proposed Changes

### 1. Rename Button

- Change the text from "All items" to "All Feeds"

### 2. Move to Feed List Section

- Remove from the filters section (`renderFilters()`)
- Add to the top of the feed folders section (`renderFeedFolders()`)
- Position above all folders and root-level feeds

### 3. Add Feed Count

- Display total number of feeds in the format: "All Feeds (#)"
- Example: "All Feeds (15)" if there are 15 feeds

### 4. Add Unread Indicator

- Show a purple indicator badge right-aligned in the button
- Display the total count of unread items across all feeds
- Style similar to existing feed unread counts but with purple color

## Visual Design

```
┌─────────────────────────────────┐
│ Dashboard │ Discover            │  <- Header
├─────────────────────────────────┤
│ 🔍 │ 🔄 │ ...                   │  <- Filters (without All items)
├─────────────────────────────────┤
│ ▼ All Feeds (15)          [42] │  <- NEW: All Feeds button
├─────────────────────────────────┤
│ ▼ Folder 1                      │
│   └─ Feed A               [5]  │
│   └─ Feed B               [3]  │
│ ▼ Folder 2                      │
│   └─ Feed C               [2]  │
│ └─ Root Feed              [1]  │
└─────────────────────────────────┘
```

## Technical Implementation

### Files to Modify

1. **[`src/components/sidebar.ts`](src/components/sidebar.ts)**
   - Remove "All items" from `renderFilters()` method
   - Add new `renderAllFeedsButton()` method
   - Call new method at the start of `renderFeedFolders()`
   - Calculate total feed count and total unread count

2. **[`src/styles/sidebar.css`](src/styles/sidebar.css)**
   - Add styles for the new "All Feeds" button
   - Add purple indicator style for unread count

### Code Changes

#### 1. Remove from `renderFilters()` (line ~1558)

Remove or comment out:

```typescript
// Row 1: All items
createFilterItem("all", "list", "All items", isAllActive, row1);
```

#### 2. Add new method `renderAllFeedsButton()`

```typescript
private renderAllFeedsButton(container: HTMLElement): void {
  const totalFeeds = this.settings.feeds.length;
  const totalUnread = this.settings.feeds.reduce(
    (sum, feed) => sum + feed.items.filter(item => !item.read).length,
    0
  );

  const isAllActive =
    this.options.currentFolder === null &&
    this.options.currentFeed === null &&
    this.options.currentTag === null;

  const allFeedsButton = container.createDiv({
    cls: "rss-dashboard-all-feeds-button" + (isAllActive ? " active" : ""),
  });

  // Toggle icon (chevron)
  const toggleIcon = allFeedsButton.createDiv({
    cls: "rss-dashboard-all-feeds-toggle",
  });
  setIcon(toggleIcon, "chevron-down");

  // Feed icon
  const feedIcon = allFeedsButton.createDiv({
    cls: "rss-dashboard-all-feeds-icon",
  });
  setIcon(feedIcon, "rss");

  // Label with count
  const labelContainer = allFeedsButton.createDiv({
    cls: "rss-dashboard-all-feeds-label-container",
  });

  labelContainer.createDiv({
    cls: "rss-dashboard-all-feeds-label",
    text: `All Feeds (${totalFeeds})`,
  });

  // Unread count badge (purple)
  if (totalUnread > 0) {
    const unreadBadge = allFeedsButton.createDiv({
      cls: "rss-dashboard-all-feeds-unread",
      text: totalUnread.toString(),
    });
  }

  // Click handler
  allFeedsButton.addEventListener("click", () => {
    this.callbacks.onFolderClick(null);
  });

  // Context menu for mark all as read
  allFeedsButton.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    this.showAllFeedsContextMenu(e);
  });
}
```

#### 3. Add context menu method

```typescript
private showAllFeedsContextMenu(event: MouseEvent): void {
  const menu = new Menu();

  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Mark all as read")
      .setIcon("check-circle")
      .onClick(() => {
        void this.markAllUnreadAsRead();
      });
  });

  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Refresh all feeds")
      .setIcon("refresh-cw")
      .onClick(() => {
        void this.callbacks.onRefreshFeeds();
      });
  });

  menu.showAtMouseEvent(event);
}
```

#### 4. Update `renderFeedFolders()` to call new method

```typescript
private renderFeedFolders(): void {
  const feedFoldersSection = this.container.createDiv({
    cls: "rss-dashboard-feed-folders-section",
  });

  // NEW: Render All Feeds button at the top
  this.renderAllFeedsButton(feedFoldersSection);

  // Rest of existing code...
  if (this.settings.folders && this.settings.folders.length > 0) {
    // ...
  }
}
```

#### 5. Add CSS styles

```css
/* All Feeds Button */
.rss-dashboard-all-feeds-button {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-left: 3px solid transparent;
  margin-bottom: 4px;
  border-radius: 4px;
}

.rss-dashboard-all-feeds-button:hover {
  background-color: var(--background-modifier-hover);
}

.rss-dashboard-all-feeds-button.active {
  background-color: var(--background-modifier-active);
  border-left-color: var(--text-accent);
}

.rss-dashboard-all-feeds-toggle {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  color: var(--text-muted);
}

.rss-dashboard-all-feeds-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  color: var(--text-muted);
}

.rss-dashboard-all-feeds-button.active .rss-dashboard-all-feeds-icon {
  color: var(--text-accent);
}

.rss-dashboard-all-feeds-label-container {
  flex-grow: 1;
  display: flex;
  align-items: center;
}

.rss-dashboard-all-feeds-label {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rss-dashboard-all-feeds-button.active .rss-dashboard-all-feeds-label {
  font-weight: 600;
  color: var(--text-accent);
}

.rss-dashboard-all-feeds-unread {
  background-color: #8e44ad; /* Purple color */
  color: white;
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: bold;
  margin-left: auto;
}

/* Dark theme adjustment */
.theme-dark .rss-dashboard-all-feeds-unread {
  background-color: #9b59b6;
}
```

## Task List

- [ ] **1. Update `renderFilters()` method in sidebar.ts**
  - Remove the "All items" filter button creation code
  - Keep the Search and Refresh buttons

- [ ] **2. Create `renderAllFeedsButton()` method in sidebar.ts**
  - Calculate total feed count
  - Calculate total unread count across all feeds
  - Create button element with proper structure
  - Add chevron icon, RSS icon, label with count, and unread badge
  - Implement click handler to show all feeds
  - Add active state styling when selected

- [ ] **3. Create `showAllFeedsContextMenu()` method in sidebar.ts**
  - Add "Mark all as read" option
  - Add "Refresh all feeds" option

- [ ] **4. Update `renderFeedFolders()` method in sidebar.ts**
  - Call `renderAllFeedsButton()` at the start of the method
  - Ensure proper positioning above folders and feeds

- [ ] **5. Add CSS styles to sidebar.css**
  - Style the All Feeds button container
  - Style the toggle icon
  - Style the feed icon
  - Style the label container
  - Style the purple unread badge
  - Add hover and active states
  - Add dark theme support

- [ ] **6. Test the implementation**
  - Verify button appears at top of feed list
  - Verify feed count is accurate
  - Verify unread count is accurate
  - Verify click behavior shows all items
  - Verify context menu works
  - Verify active state styling
  - Verify purple badge styling
  - Test on both light and dark themes

## Considerations

### State Management

- The "All Feeds" button should be active when no specific folder, feed, or tag is selected
- This is already tracked via `this.options.currentFolder`, `this.options.currentFeed`, and `this.options.currentTag`

### Performance

- Calculating total unread count iterates through all feeds and items
- This is acceptable for typical feed counts but could be optimized with caching if needed

### Accessibility

- Add `aria-label` attributes for screen readers
- Ensure keyboard navigation works properly

### Mobile Responsiveness

- Ensure the button works well on mobile devices
- Consider touch target size

## Questions for Clarification

1. Should the "All Feeds" button have a collapse/expand functionality like folders, or should it always show all feeds?
2. Should there be any animation when switching between "All Feeds" and specific folders?
3. Should the unread badge be dismissible or always visible when there are unread items?
