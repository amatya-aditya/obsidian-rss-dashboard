# Folder Header Redesign Plan

## Overview

Redesign the folder headers in the Manage Feeds modal to improve the UI/UX by:

1. Removing the underline from folder headers
2. Moving the delete folder button to the left of the header
3. Changing the delete button to a red X icon with a hover tooltip
4. Adding a horizontal divider between the header and the first feed row

## Current Implementation

### TypeScript Code (src/modals/feed-manager-modal.ts, lines 1284-1301)

```typescript
// Create folder header with delete button
const folderHeader = folderDiv.createDiv({
  cls: "feed-manager-folder-header",
});
new Setting(folderHeader).setName(folderPath).setHeading();

// Add delete folder button
const deleteFolderBtn = folderHeader.createEl("button", {
  text: "Delete",
  cls: "rss-dashboard-danger-button feed-manager-delete-folder-button",
});
deleteFolderBtn.onclick = () => {
  this.showDeleteConfirmModal({
    type: "folder",
    folderPath,
    feedCount: feeds.length,
  });
};
```

### CSS Styles (src/styles/modals.css, lines 1015-1061)

```css
.feed-manager-folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  margin-top: 1rem;
  border-bottom: 2px solid var(--background-modifier-border);
}

.feed-manager-delete-folder-button {
  background: transparent !important;
  color: #dc2626 !important;
  border: 1px solid #dc2626 !important;
  border-radius: 4px;
  padding: 0.25rem 0.6rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
```

## Proposed Changes

### 1. TypeScript Changes (src/modals/feed-manager-modal.ts)

#### Update folder header structure for regular folders (lines 1284-1301):

```typescript
// Create folder header with delete button on left
const folderHeader = folderDiv.createDiv({
  cls: "feed-manager-folder-header",
});

// Add delete folder button (X icon) on the left
const deleteFolderBtn = folderHeader.createEl("button", {
  cls: "feed-manager-delete-folder-button",
});
setIcon(deleteFolderBtn, "x");
deleteFolderBtn.setAttribute("aria-label", "Delete folder");
deleteFolderBtn.onclick = () => {
  this.showDeleteConfirmModal({
    type: "folder",
    folderPath,
    feedCount: feeds.length,
  });
};

// Add folder name
const folderName = folderHeader.createDiv({
  cls: "feed-manager-folder-name",
});
folderName.setText(folderPath);

// Add horizontal divider below header
folderDiv.createDiv({ cls: "feed-manager-folder-divider" });
```

#### Update folder header structure for Uncategorized (lines 1314-1331):

Same pattern as above, but with "Uncategorized" as the folder name.

### 2. CSS Changes (src/styles/modals.css)

#### Update folder header styles:

```css
/* Remove border-bottom from header */
.feed-manager-folder-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  margin-top: 1rem;
  /* Removed: border-bottom: 2px solid var(--background-modifier-border); */
}

/* New divider below header */
.feed-manager-folder-divider {
  height: 1px;
  background: var(--background-modifier-border);
  margin-bottom: 0.5rem;
}

/* Red X button styling */
.feed-manager-delete-folder-button {
  background: transparent !important;
  color: #dc2626 !important;
  border: none !important;
  border-radius: 4px;
  padding: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.feed-manager-delete-folder-button:hover {
  background: rgba(220, 38, 38, 0.1) !important;
}

.feed-manager-delete-folder-button svg {
  width: 16px;
  height: 16px;
}
```

## Visual Comparison

### Before:

```
┌─────────────────────────────────────────────────┐
│ Folder Name                              Delete │  ← Underlined
├─────────────────────────────────────────────────┤
│ Feed 1                           Edit | Delete │
│ Feed 2                           Edit | Delete │
└─────────────────────────────────────────────────┘
```

### After:

```
┌─────────────────────────────────────────────────┐
│ ✕ Folder Name                                   │  ← No underline
│────────────────────────────────────────────────│  ← Divider
│ Feed 1                           Edit | Delete │
│ Feed 2                           Edit | Delete │
└─────────────────────────────────────────────────┘
```

## Implementation Steps

1. **Update TypeScript code** in [`src/modals/feed-manager-modal.ts`](src/modals/feed-manager-modal.ts):
   - Modify the folder header rendering for regular folders (around line 1284)
   - Modify the folder header rendering for Uncategorized (around line 1314)
   - Import `setIcon` from obsidian (already imported)
   - Use `setIcon()` to add X icon to delete button
   - Add `aria-label` attribute for tooltip

2. **Update CSS styles** in [`src/styles/modals.css`](src/styles/modals.css):
   - Remove `border-bottom` from `.feed-manager-folder-header`
   - Add `.feed-manager-folder-divider` styles
   - Update `.feed-manager-delete-folder-button` for icon button
   - Update mobile responsive styles as needed

3. **Test the changes**:
   - Build the plugin with `npm run build`
   - Verify the folder header displays correctly
   - Verify the X icon appears and is clickable
   - Verify the tooltip shows "Delete folder" on hover
   - Verify the divider appears between header and feed rows
   - Test on mobile/tablet views

## Files to Modify

1. [`src/modals/feed-manager-modal.ts`](src/modals/feed-manager-modal.ts) - Update folder header rendering
2. [`src/styles/modals.css`](src/styles/modals.css) - Update folder header styles
