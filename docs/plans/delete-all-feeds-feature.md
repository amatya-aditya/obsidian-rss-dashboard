# Delete Feeds & Folders Feature Plan

## Overview

Add deletion functionality to the Manage Feeds modal with a unified confirmation system:

1. **"Delete All" button** - Reset to factory settings (delete all feeds, restore default folders)
2. **"Delete Folder" buttons** - Delete individual folders and all feeds within them
3. **Updated "Delete Feed" button** - Use the new unified confirmation modal

All deletion actions share a common confirmation modal that appears as an overlay on top of the Manage Feeds modal (higher z-index), allowing users to return to the modal when canceling.

## Feature Requirements

### 1. Delete All Button

- **Location**: Top of the Manage Feeds modal, near the existing "Add feed" button
- **Style**: Red background with hover stroke effect
- **Text**: "Delete All"
- **Behavior**: Deletes all feeds and restores default folders

### 2. Delete Folder Buttons

- **Location**: Next to each folder header in the feed list
- **Style**: Red background with hover stroke effect (smaller variant)
- **Text**: "Delete" or trash icon
- **Behavior**: Deletes the folder and all feeds within it

### 3. Delete Feed Button (Updated)

- **Location**: Existing location in each feed row
- **Style**: Uses existing button style (no change)
- **Behavior**: Now uses the unified confirmation modal instead of the old one

### 4. Shared Confirmation Modal (Overlay)

- **Position**: Overlay on top of Manage Feeds modal (higher z-index)
- **Cancel Behavior**: Closes confirmation modal, returns to Manage Feeds modal
- **Content**:
  - Warning that this action is non-reversible
  - Context-specific message (Delete All vs Delete Folder vs Delete Feed)
  - Recommendation to backup OPML file first
  - Link/button to export OPML before proceeding
  - "Cancel" and "Delete" buttons

### 5. Factory Reset Behavior (Delete All)

- Clear all feeds (set to empty array)
- Restore default folders:
  - Uncategorized
  - Videos
  - Podcasts
  - RSS
- Preserve other settings (refresh interval, view style, etc.)

### 6. Delete Folder Behavior

- Remove folder from folders array (and any subfolders)
- Remove all feeds assigned to that folder
- Feeds in subfolders are also deleted

### 7. Delete Feed Behavior (Existing - Updated)

- Remove single feed from feeds array
- No change to folders

---

## Implementation Details

### Files to Modify

#### 1. `src/modals/feed-manager-modal.ts`

**Location**: FeedManagerModal class, `onOpen()` method (around line 1089-1190)

**Changes**:

1. **Remove** the existing `showConfirmModal()` method (line 1284-1316)
2. Add new unified `showDeleteConfirmModal()` method that appears as overlay
3. Add "Delete All" button next to "Add feed" button in `onOpen()` method
4. Add "Delete" button next to each folder header in `renderFeeds()` method
5. Update existing delete button in `renderFeedRow()` to use new confirmation modal
6. Create `resetToFactorySettings()` method for Delete All
7. Create `deleteFolder()` method for folder deletion
8. Create `deleteFeed()` method for single feed deletion

**Code Locations**:

```typescript
// Line ~1167-1188: Add Delete All button after Add feed button
const topControls = contentEl.createDiv({
  cls: "feed-manager-top-controls",
});

// ... existing search input ...

// Existing Add feed button
const addFeedBtn = topControls.createEl("button", {
  text: "Add feed",
  cls: "rss-dashboard-primary-button feed-manager-add-button",
});

// NEW: Delete All button
const deleteAllBtn = topControls.createEl("button", {
  text: "Delete All",
  cls: "rss-dashboard-danger-button feed-manager-delete-all-button",
});
deleteAllBtn.onclick = () => {
  this.showDeleteConfirmModal({ type: "all" });
};
```

**Modified renderFeeds() to add folder delete buttons**:

```typescript
// In renderFeeds method, when creating folder headings:
for (const folderPath of allFolderPaths) {
  const feeds = feedsByFolder[folderPath];
  if (feeds.length > 0) {
    const folderDiv = feedsContainer.createDiv({
      cls: "feed-manager-folder",
    });

    // Create folder header with delete button
    const folderHeader = folderDiv.createDiv({
      cls: "feed-manager-folder-header",
    });
    new Setting(folderHeader).setName(folderPath).setHeading();

    // NEW: Add delete folder button
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

    for (const feed of feeds) {
      this.renderFeedRow(folderDiv, feed);
    }
  }
}
```

**Updated renderFeedRow() to use new confirmation modal**:

```typescript
renderFeedRow(parent: HTMLElement, feed: Feed) {
  const row = parent.createDiv({ cls: "feed-manager-row" });
  row.createDiv({ text: feed.title, cls: "feed-manager-title" });

  const editBtn = row.createEl("button", { text: "Edit" });
  editBtn.onclick = () => {
    new EditFeedModal(this.app, this.plugin, feed, () =>
      this.onOpen(),
    ).open();
  };

  const delBtn = row.createEl("button", { text: "Delete" });
  delBtn.onclick = () => {
    // UPDATED: Use new unified confirmation modal
    this.showDeleteConfirmModal({ type: "feed", feed });
  };
}
```

**New Unified Confirmation Modal Method (Overlay Style)**:

```typescript
// Add after renderFeedRow method (around line 1282)
// REPLACE the existing showConfirmModal method with this:

interface DeleteOptions {
  type: "all" | "folder" | "feed";
  folderPath?: string;
  feedCount?: number;
  feed?: Feed;
}

private showDeleteConfirmModal(options: DeleteOptions): void {
  const { type, folderPath, feedCount, feed } = options;

  // Create overlay modal that appears ON TOP of the manage feeds modal
  const overlay = document.body.createDiv({
    cls: "rss-dashboard-modal-overlay",
  });

  const modal = overlay.createDiv({
    cls: "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-confirm-modal",
  });
  const modalContent = modal.createDiv({
    cls: "rss-dashboard-modal-content",
  });

  // Context-specific header and message
  let title: string;
  let warningMessage: string;
  let confirmButtonText: string;

  switch (type) {
    case "all":
      title = "⚠️ Delete All Feeds?";
      warningMessage = "This action is irreversible. All your feeds will be permanently deleted.";
      confirmButtonText = "Delete All";
      break;
    case "folder":
      title = `⚠️ Delete Folder "${folderPath}"?`;
      warningMessage = `This action is irreversible. The folder "${folderPath}" and all ${feedCount} feed(s) within it will be permanently deleted.`;
      confirmButtonText = "Delete Folder";
      break;
    case "feed":
      title = `⚠️ Delete Feed "${feed?.title}"?`;
      warningMessage = "This action is irreversible. The feed will be permanently deleted.";
      confirmButtonText = "Delete";
      break;
  }

  new Setting(modalContent).setName(title).setHeading();

  // Warning message
  const warningDiv = modalContent.createDiv({
    cls: "delete-all-warning",
  });
  warningDiv.createEl("p", { text: warningMessage });

  // Backup recommendation (only for folder and all deletions)
  if (type === "all" || type === "folder") {
    const backupDiv = modalContent.createDiv({
      cls: "delete-all-backup-notice",
    });
    backupDiv.createEl("strong", {
      text: "Recommended: Export your feeds first",
    });
    backupDiv.createEl("p", {
      text: "Before deleting, we strongly recommend backing up your feeds by exporting to an OPML file.",
    });

    // Export OPML button
    const exportBtn = backupDiv.createEl("button", {
      text: "Export OPML",
      cls: "rss-dashboard-primary-button export-opml-btn",
    });
    exportBtn.onclick = () => {
      this.plugin.exportOpml();
    };
  }

  // Button container
  const buttonContainer = modalContent.createDiv({
    cls: "rss-dashboard-modal-buttons",
  });

  const cancelButton = buttonContainer.createEl("button", {
    text: "Cancel",
  });
  cancelButton.onclick = () => {
    // Remove overlay, returning to the manage feeds modal
    document.body.removeChild(overlay);
  };

  const confirmButton = buttonContainer.createEl("button", {
    text: confirmButtonText,
    cls: "rss-dashboard-danger-button",
  });
  confirmButton.onclick = () => {
    // Execute the appropriate deletion
    switch (type) {
      case "all":
        void this.resetToFactorySettings();
        break;
      case "folder":
        void this.deleteFolder(folderPath!);
        break;
      case "feed":
        void this.deleteFeed(feed!);
        break;
    }
    // Remove overlay
    document.body.removeChild(overlay);
  };
}
```

private async resetToFactorySettings(): Promise<void> {
// Import DEFAULT_SETTINGS for default folders
const { DEFAULT_SETTINGS } = await import("../types/types");

// Clear all feeds
this.plugin.settings.feeds = [];

// Reset folders to default
this.plugin.settings.folders = DEFAULT_SETTINGS.folders.map(f => ({
...f,
createdAt: Date.now(),
modifiedAt: Date.now(),
}));

// Save settings
await this.plugin.saveSettings();

// Show success notice
new Notice("All feeds deleted. Settings reset to factory defaults.");

// Re-render the modal
this.onOpen();
}

private async deleteFolder(folderPath: string): Promise<void> {
// Remove all feeds in this folder (including subfolders)
this.plugin.settings.feeds = this.plugin.settings.feeds.filter(feed => {
// Check if feed is in this folder or a subfolder
return feed.folder !== folderPath &&
!feed.folder?.startsWith(folderPath + "/");
});

// Remove the folder from the folder hierarchy
this.removeFolderFromHierarchy(folderPath);

// Save settings
await this.plugin.saveSettings();

// Show success notice
new Notice(`Folder "${folderPath}" and its feeds deleted.`);

// Re-render the modal
this.onOpen();
}

private async deleteFeed(feed: Feed): Promise<void> {
// Remove the feed from the feeds array
this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
(f) => f !== feed,
);

// Save settings
await this.plugin.saveSettings();

// Show success notice
new Notice(`Feed "${feed.title}" deleted.`);

// Re-render the modal
this.onOpen();
}

private removeFolderFromHierarchy(folderPath: string): void {
const parts = folderPath.split("/");
const folderName = parts[0];

if (parts.length === 1) {
// Top-level folder - remove directly
this.plugin.settings.folders = this.plugin.settings.folders.filter(
f => f.name !== folderName
);
} else {
// Nested folder - need to find parent and remove from subfolders
const parentPath = parts.slice(0, -1).join("/");
const targetFolderName = parts[parts.length - 1];

    const findAndRemoveFromFolder = (folders: Folder[]): boolean => {
      for (let i = 0; i < folders.length; i++) {
        const folder = folders[i];
        const currentPath = parentPath.split("/")[0] === folder.name
          ? folder.name
          : null;

        if (parentPath === folder.name ||
            (currentPath && parentPath.startsWith(folder.name + "/"))) {
          // Found the parent, remove the target from subfolders
          folder.subfolders = folder.subfolders.filter(
            sf => sf.name !== targetFolderName
          );
          return true;
        }

        // Recurse into subfolders
        if (findAndRemoveFromFolder(folder.subfolders)) {
          return true;
        }
      }
      return false;
    };

    findAndRemoveFromFolder(this.plugin.settings.folders);

}
}

````

#### 2. `src/styles/modals.css`

**Add new styles at the end of the file**:

```css
/* ============================================
   Delete Button Styles (Shared)
   ============================================ */

/* Modal overlay - appears on top of manage feeds modal */
.rss-dashboard-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
}

/* Danger button - Red background with hover stroke */
.rss-dashboard-danger-button {
  background: #dc2626 !important;
  color: #fff !important;
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 0.4rem 1.2rem;
  margin: 0 0.4rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rss-dashboard-danger-button:hover {
  background: #b91c1c !important;
  border-color: #dc2626;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.3);
}

.rss-dashboard-danger-button:active {
  background: #991b1b !important;
}

/* Feed manager delete all button specific */
.feed-manager-delete-all-button {
  margin-left: 0.5rem;
}

/* Folder header with delete button */
.feed-manager-folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.feed-manager-folder-header .setting-item {
  flex: 1;
  margin: 0;
}

/* Delete folder button - smaller variant */
.feed-manager-delete-folder-button {
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  margin-right: 0;
}

/* Confirmation modal warning styles */
.delete-all-warning {
  padding: 1rem;
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.delete-all-warning p {
  margin: 0;
  color: var(--text-normal);
}

/* Backup notice styles */
.delete-all-backup-notice {
  padding: 1rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.delete-all-backup-notice strong {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-normal);
}

.delete-all-backup-notice p {
  margin: 0 0 0.75rem 0;
  color: var(--text-muted);
}

.delete-all-backup-notice .export-opml-btn {
  margin: 0;
}

/* Mobile responsive styles for delete buttons */
@media (max-width: 768px) {
  .feed-manager-delete-all-button {
    width: 100%;
    min-height: 44px;
    margin-left: 0;
    margin-top: 8px;
  }

  .feed-manager-delete-folder-button {
    min-height: 36px;
    padding: 8px 12px;
    font-size: 14px;
  }

  .feed-manager-folder-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .rss-dashboard-danger-button {
    min-height: 44px;
    padding: 12px 20px;
    font-size: 16px;
  }

  .delete-all-warning,
  .delete-all-backup-notice {
    padding: 0.75rem;
  }
}
````

#### 3. `main.ts`

**No changes required** - The `exportOpml()` method already exists at line 789 and is public, so it can be called from the FeedManagerModal via `this.plugin.exportOpml()`.

---

## Task Checklist

### Phase 1: Remove Old Confirmation Modal

- [ ] Remove the existing `showConfirmModal()` method (line 1284-1316 in feed-manager-modal.ts)

### Phase 2: Shared Confirmation Modal (Overlay)

- [ ] Create unified `showDeleteConfirmModal()` method with context-aware messaging
- [ ] Add `DeleteOptions` interface for type-safe options (all/folder/feed)
- [ ] Create overlay element that appears on top of manage feeds modal
- [ ] Add warning message about irreversible action
- [ ] Add backup recommendation section with OPML export link (for all/folder only)
- [ ] Add "Cancel" button that removes overlay and returns to manage feeds modal
- [ ] Add context-aware "Delete" button

### Phase 3: Delete All Button

- [ ] Add "Delete All" button to `FeedManagerModal.onOpen()` method
- [ ] Wire button to `showDeleteConfirmModal({ type: "all" })`
- [ ] Create `resetToFactorySettings()` method

### Phase 4: Delete Folder Buttons

- [ ] Modify `renderFeeds()` to add folder header container
- [ ] Add "Delete" button next to each folder header
- [ ] Wire button to `showDeleteConfirmModal({ type: "folder", folderPath, feedCount })`
- [ ] Create `deleteFolder()` method
- [ ] Create `removeFolderFromHierarchy()` helper method

### Phase 5: Update Delete Feed Button

- [ ] Update `renderFeedRow()` to use new confirmation modal
- [ ] Create `deleteFeed()` method

### Phase 6: Styling

- [ ] Add modal overlay styles to `modals.css`
- [ ] Add danger button styles to `modals.css`
- [ ] Add folder header layout styles
- [ ] Add confirmation modal warning styles
- [ ] Add backup notice styles
- [ ] Add mobile responsive styles

### Phase 7: Testing

- [ ] Test Delete All button appears correctly
- [ ] Test Delete Folder buttons appear next to each folder
- [ ] Test Delete Feed button uses new confirmation modal
- [ ] Test confirmation modal shows correct context (All vs Folder vs Feed)
- [ ] Test Export OPML button works from confirmation modal
- [ ] Test Cancel button closes overlay and returns to manage feeds modal
- [ ] Test Delete All resets to factory settings
- [ ] Test Delete Folder removes folder and its feeds
- [ ] Test Delete Feed removes single feed
- [ ] Test on mobile/tablet views
- [ ] Test hover effects on buttons

---

## Visual Mockup

### Manage Feeds Modal with Delete Buttons

```
┌─────────────────────────────────────────────────────────────┐
│  Manage Feeds                                           ✕   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐  ┌──────────┐ ┌────────┐ │
│  │ 🔍 Search feeds...           │  │ Add feed │ │Delete  │ │
│  └──────────────────────────────┘  └──────────┘ │  All   │ │
│                                    └──────────┘ └────────┘ │
│                                                              │
│  ▼ Uncategorized                               [Delete]     │
│    ─────────────────────────────────────────────────────    │
│    Feed Title 1                          [Edit] [Delete]    │
│    ─────────────────────────────────────────────────────    │
│                                                              │
│  ▼ Videos                                      [Delete]     │
│    ─────────────────────────────────────────────────────    │
│    YouTube Channel                        [Edit] [Delete]   │
│    ─────────────────────────────────────────────────────    │
│                                                              │
│  ▼ Podcasts                                    [Delete]     │
│    ─────────────────────────────────────────────────────    │
│    Podcast Show                           [Edit] [Delete]   │
│    ─────────────────────────────────────────────────────    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Delete All Confirmation Modal

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Delete All Feeds?                                  ✕    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠ This action is irreversible. All your feeds will  │   │
│  │   be permanently deleted.                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📦 Recommended: Export your feeds first              │   │
│  │                                                      │   │
│  │ Before deleting, we strongly recommend backing up    │   │
│  │ your feeds by exporting to an OPML file.             │   │
│  │                                                      │   │
│  │ [Export OPML]                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                              [Cancel]  [Delete All]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Delete Folder Confirmation Modal

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Delete Folder "Videos"?                            ✕    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠ This action is irreversible. The folder "Videos"  │   │
│  │   and all 5 feed(s) within it will be permanently   │   │
│  │   deleted.                                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📦 Recommended: Export your feeds first              │   │
│  │                                                      │   │
│  │ Before deleting, we strongly recommend backing up    │   │
│  │ your feeds by exporting to an OPML file.             │   │
│  │                                                      │   │
│  │ [Export OPML]                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                            [Cancel]  [Delete Folder]         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Delete Feed Confirmation Modal

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Delete Feed "TechCrunch"?                          ✕    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠ This action is irreversible. The feed will be     │   │
│  │   permanently deleted.                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                                    [Cancel]  [Delete]        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Note**: The Delete Feed confirmation modal does not show the OPML backup recommendation since it's only deleting a single feed.

---

## Technical Notes

### Import Statement Required

The `resetToFactorySettings()` method needs to import `DEFAULT_SETTINGS`:

```typescript
import { DEFAULT_SETTINGS } from "../types/types";
```

Or use dynamic import as shown in the implementation above.

### Modal Cleanup

The confirmation modal uses the same cleanup pattern as the existing `showConfirmModal()` method (line 1284-1316), which removes existing modals before showing the confirmation.

### Settings Preservation

The factory reset only clears:

- `feeds` array
- `folders` array (reset to defaults)

All other settings are preserved:

- `refreshInterval`
- `maxItems`
- `viewStyle`
- `media` settings
- `articleSaving` settings
- `display` settings
- `highlights` settings
- etc.

---

## Risk Assessment

### Low Risk

- Button styling is isolated to new CSS classes
- Confirmation modal follows existing patterns
- Factory reset only affects feeds and folders

### Mitigations

- Clear warning messages
- OPML export recommendation
- Non-reversible action clearly communicated
- Cancel option prominently displayed

---

## Dependencies

- Existing `exportOpml()` method in `main.ts`
- `DEFAULT_SETTINGS` constant in `src/types/types.ts`
- Obsidian's `Notice` API for success message
- Existing modal CSS infrastructure
