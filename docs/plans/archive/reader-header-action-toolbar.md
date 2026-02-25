# Reader View Header Action Toolbar Refactor

## Objective

Move the 4-icon action toolbar from the dashboard view article list into the reader view header, consolidating with existing actions to create a unified 5-icon toolbar aligned to the right.

## Current State

### Dashboard View Action Toolbar (article-list.ts)

Located in both list view and card view rendering, contains 4 icons:

1. **Save button** (`rss-dashboard-save-toggle`) - Saves article to notes
2. **Read toggle** (`rss-dashboard-read-toggle`) - Marks article as read/unread
3. **Star toggle** (`rss-dashboard-star-toggle`) - Stars/unstars article
4. **Tags dropdown** (`rss-dashboard-tags-toggle`) - Opens tag management dropdown

### Reader View Header (reader-view.ts lines 122-177)

Current structure:

```
rss-reader-header
├── rss-reader-back-button (arrow-left icon)
├── rss-reader-title (article title)
└── rss-reader-actions
    ├── rss-reader-saved-label ("Saved" text) [TO BE REMOVED]
    ├── rss-reader-action-button (save icon)
    └── rss-reader-action-button (globe-2 icon - open in browser)
```

## Target State

### New Reader View Header Structure

```
rss-reader-header
├── rss-reader-back-button (arrow-left icon) [LEFT ALIGNED]
├── rss-reader-title (article title)
└── rss-reader-actions [RIGHT ALIGNED]
    ├── rss-reader-action-button (save icon)
    ├── rss-reader-action-button (check-circle/circle - read toggle)
    ├── rss-reader-action-button (star/star-off - star toggle)
    ├── rss-reader-action-button (tag icon - tags dropdown)
    └── rss-reader-action-button (globe-2 icon - open in browser)
```

## Implementation Steps

### 1. Modify reader-view.ts

#### 1.1 Remove the "Saved" label

Remove lines 151-154:

```typescript
actions.createDiv({
  cls: "rss-reader-saved-label",
  text: "Saved",
});
```

#### 1.2 Add Read Toggle Button

Add after the save button click handler:

```typescript
const readToggle = actions.createDiv({
  cls: "rss-reader-action-button rss-reader-read-toggle",
  attr: { title: "Mark as read/unread" },
});
setIcon(readToggle, this.currentItem?.read ? "check-circle" : "circle");
readToggle.addEventListener("click", () => {
  if (this.currentItem) {
    this.toggleReadStatus();
  }
});
```

#### 1.3 Add Star Toggle Button

```typescript
const starToggle = actions.createDiv({
  cls: "rss-reader-action-button rss-reader-star-toggle",
  attr: { title: "Star/unstar article" },
});
setIcon(starToggle, this.currentItem?.starred ? "star" : "star-off");
starToggle.addEventListener("click", () => {
  if (this.currentItem) {
    this.toggleStarStatus();
  }
});
```

#### 1.4 Add Tags Dropdown Button

```typescript
const tagsButton = actions.createDiv({
  cls: "rss-reader-action-button rss-reader-tags-button",
  attr: { title: "Manage tags" },
});
setIcon(tagsButton, "tag");
tagsButton.addEventListener("click", (e) => {
  if (this.currentItem) {
    this.showTagsDropdown(e, this.currentItem);
  }
});
```

#### 1.5 Add Helper Methods

Add methods to handle the new actions:

- `toggleReadStatus()` - Toggle read/unread status
- `toggleStarStatus()` - Toggle starred status
- `showTagsDropdown()` - Show tag management dropdown (reuse logic from article-list.ts)
- `updateReadToggleIcon()` - Update icon based on read state
- `updateStarToggleIcon()` - Update icon based on starred state

#### 1.6 Update displayItem Method

Update the method to refresh the toggle icons when displaying a new item.

### 2. Update reader.css

#### 2.1 Modify Header Layout

```css
.rss-reader-header {
  display: flex;
  align-items: center;
  padding: 5px;
  margin-bottom: 10px;
  background-color: var(--background-secondary);
  border-radius: 5px;
  justify-content: space-between; /* Added for proper alignment */
}

.rss-reader-back-button {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  margin-right: 10px;
  color: var(--text-muted);
  /* Remove flex-grow from title, keep back button left */
}

.rss-reader-title {
  flex-grow: 1;
  font-weight: bold;
  font-size: 16px;
  color: var(--text-normal);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 10px; /* Add spacing before actions */
}

.rss-reader-actions {
  display: flex;
  gap: 5px; /* Reduced gap for 5 icons */
  justify-content: flex-end; /* Right align actions */
}
```

#### 2.2 Add Toggle State Styles

```css
.rss-reader-read-toggle.read {
  color: var(--text-success);
}

.rss-reader-star-toggle.starred {
  color: var(--text-warning);
}
```

#### 2.3 Remove Saved Label Styles

Remove or comment out the saved label styles since they're no longer needed.

### 3. Callbacks and State Management

The reader view needs access to the article update callbacks. Currently it receives:

- `onArticleSave` callback

Need to add:

- `onArticleUpdate` callback for read/star status changes
- `onTagChange` callback for tag management

### 4. Files to Modify

1. **src/views/reader-view.ts**
   - Remove saved label
   - Add read toggle, star toggle, tags dropdown
   - Add helper methods for toggle actions
   - Update constructor to accept additional callbacks
   - Update displayItem to refresh toggle states

2. **src/styles/reader.css**
   - Update header layout for proper alignment
   - Add toggle state styles
   - Remove saved label styles

3. **src/main.ts** (if needed)
   - Update ReaderView instantiation to pass new callbacks

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [←]  Article Title Here...              [💾][✓][★][🏷][🌐] │
└─────────────────────────────────────────────────────────────────┘
  ↑                                           ↑
  Left aligned                          Right aligned
  Back button                           5 action icons:
                                        Save, Read, Star, Tags, Browser
```

## Dependencies

- Obsidian's `setIcon` function for dynamic icon updates
- `Menu` API for tags dropdown
- Access to `settings.availableTags` for tag management

## Testing Checklist

- [ ] Back button remains left-aligned
- [ ] All 5 action icons are right-aligned
- [ ] Save button works correctly
- [ ] Read toggle updates icon and persists state
- [ ] Star toggle updates icon and persists state
- [ ] Tags dropdown opens and allows tag management
- [ ] Open in browser works correctly
- [ ] Icons update correctly when navigating between articles
- [ ] Responsive layout works on mobile
