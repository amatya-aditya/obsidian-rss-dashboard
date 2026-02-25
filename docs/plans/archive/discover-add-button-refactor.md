# Discover View Add Button Refactor Plan

## Overview

This plan outlines the changes needed to refactor the "Add to..." button functionality in the Discover view to use the `FolderSelectorPopup` dropdown menu instead of the current modal popup. Additionally, the "Quick add" button will be removed entirely.

## Current Implementation

### Discover View ([`src/views/discover-view.ts`](src/views/discover-view.ts))

Currently, the discover view has **two buttons** for adding feeds (lines 1137-1162):

1. **Quick add button** - Adds feed to "Uncategorized" folder directly
2. **Add to... button** - Opens `AddToFolderModal` for folder selection

```typescript
// Current implementation in discover-view.ts (lines 1137-1162)
if (isAdded) {
  const removeBtn = rightSection.createEl("button", {
    text: "Remove",
    cls: "rss-discover-card-remove-btn",
  });
  removeBtn.addEventListener("click", () => {
    void (async () => {
      await this.removeFeed(feed.url);
      this.render();
    })();
  });
} else {
  // Quick add button - adds to Uncategorized folder
  const quickAddBtn = rightSection.createEl("button", {
    text: "Quick add",
    cls: "rss-discover-card-add-btn",
  });
  quickAddBtn.addEventListener("click", () => {
    void (async () => {
      await this.quickAddFeed(feed);
      this.render();
    })();
  });

  // Add to... button - opens folder selection modal
  const addToBtn = rightSection.createEl("button", {
    text: "Add to...",
    cls: "rss-discover-card-add-btn rss-discover-card-add-to-btn",
  });
  addToBtn.addEventListener("click", () => {
    new AddToFolderModal(this.app, this.plugin, feed, () => {
      this.render();
    }).open();
  });
}
```

### Kagi Smallweb View ([`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts))

The Smallweb view uses a **single "+Follow" button** with dropdown menu (lines 546-572):

```typescript
// Reference implementation in kagi-smallweb-view.ts (lines 546-572)
const followBtn = rightSection.createEl("button", {
  cls: "rss-discover-card-add-btn",
});
setIcon(followBtn, "plus");
followBtn.createSpan({ text: " Follow" });

// Get default folder from settings
const defaultFolder =
  this.plugin.settings.media.defaultSmallwebFolder || "Smallweb";

// Single click: Show folder selector popup
followBtn.addEventListener("click", () => {
  new FolderSelectorPopup(this.plugin, {
    anchorEl: followBtn,
    defaultFolder: defaultFolder,
    onSelect: (folderName) => {
      void this.handleSmallwebSubscribeToFolder(entry, folderName);
    },
  });
});

// Double click: Add to default folder directly
followBtn.addEventListener("dblclick", () => {
  void this.handleSmallwebSubscribeToFolder(entry, defaultFolder);
});
```

## Target Implementation

### Changes to Discover View

Replace the two-button system with a single "Add to..." button that uses `FolderSelectorPopup`:

```typescript
// New implementation for discover-view.ts
if (isAdded) {
  const removeBtn = rightSection.createEl("button", {
    text: "Remove",
    cls: "rss-discover-card-remove-btn",
  });
  removeBtn.addEventListener("click", () => {
    void (async () => {
      await this.removeFeed(feed.url);
      this.render();
    })();
  });
} else {
  // Add to... button - shows folder selector popup
  const addToBtn = rightSection.createEl("button", {
    text: "Add to...",
    cls: "rss-discover-card-add-btn rss-discover-card-add-to-btn",
  });

  // Get default folder from settings (or use "Uncategorized" as fallback)
  const defaultFolder = "Uncategorized";

  // Single click: Show folder selector popup
  addToBtn.addEventListener("click", () => {
    new FolderSelectorPopup(this.plugin, {
      anchorEl: addToBtn,
      defaultFolder: defaultFolder,
      onSelect: (folderName) => {
        void this.addFeedToFolder(feed, folderName);
      },
    });
  });
}
```

## Files to Modify

### 1. [`src/views/discover-view.ts`](src/views/discover-view.ts)

| Line Range | Change                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| 1-11       | Add import for `FolderSelectorPopup`, remove import for `AddToFolderModal` |
| 1137-1162  | Replace button logic with new implementation                               |
| 1169-1190  | Refactor `quickAddFeed` method to `addFeedToFolder` (or create new method) |

### 2. [`src/modals/add-to-folder-modal.ts`](src/modals/add-to-folder-modal.ts) (Optional)

This file may become unused after the refactor. Consider:

- Deleting the file entirely
- Keeping it for potential future use
- Checking if it's used elsewhere

## Detailed Task List

### Phase 1: Import Changes

- [ ] **Task 1.1**: Add import for `FolderSelectorPopup` in [`discover-view.ts`](src/views/discover-view.ts:1)

  ```typescript
  import { FolderSelectorPopup } from "../components/folder-selector-popup";
  ```

- [ ] **Task 1.2**: Remove import for `AddToFolderModal` in [`discover-view.ts`](src/views/discover-view.ts:10)
  ```typescript
  // Remove this line:
  // import { AddToFolderModal } from "../modals/add-to-folder-modal";
  ```

### Phase 2: Button Implementation Changes

- [ ] **Task 2.1**: Remove the "Quick add" button code block (lines 1139-1149)

- [ ] **Task 2.2**: Modify the "Add to..." button to use `FolderSelectorPopup`:
  - Remove the modal instantiation
  - Add `FolderSelectorPopup` instantiation with proper options
  - Define default folder (use "Uncategorized" or a setting)

- [ ] **Task 2.3**: Ensure proper `this` context binding in the callback

### Phase 3: Method Refactoring

- [ ] **Task 3.1**: Create new method `addFeedToFolder(feed: FeedMetadata, folderName: string)`:

  ```typescript
  private async addFeedToFolder(feed: FeedMetadata, folderName: string): Promise<void> {
    try {
      // Ensure folder exists
      const folderExists = this.plugin.settings.folders.some(
        (f) => f.name.toLowerCase() === folderName.toLowerCase(),
      );

      if (!folderExists) {
        await this.plugin.ensureFolderExists(folderName);
      }

      // Add the feed
      await this.plugin.addFeed(feed.title, feed.url, folderName);
      new Notice(`Feed "${feed.title}" added to "${folderName}"`);

      // Refresh the view
      this.render();
    } catch (error) {
      new Notice(
        `Failed to add feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  ```

- [ ] **Task 3.2**: Remove or refactor the `quickAddFeed` method (lines 1169-1190) if no longer needed

### Phase 4: Cleanup

- [ ] **Task 4.1**: Check if `AddToFolderModal` is used elsewhere in the codebase
- [ ] **Task 4.2**: If unused, delete [`src/modals/add-to-folder-modal.ts`](src/modals/add-to-folder-modal.ts)
- [ ] **Task 4.3**: Run linting to ensure no unused imports remain

### Phase 5: Testing

- [ ] **Task 5.1**: Test single-click on "Add to..." button shows folder selector popup
- [ ] **Task 5.2**: Test selecting an existing folder from the popup
- [ ] **Task 5.3**: Test creating a new folder via the popup
- [ ] **Task 5.4**: Test keyboard navigation in the popup (arrow keys, enter, escape)
- [ ] **Task 5.5**: Test that the feed appears in the correct folder after adding
- [ ] **Task 5.6**: Test the "Remove" button still works correctly
- [ ] **Task 5.7**: Test on mobile devices for proper popup positioning

## Code Comparison

### Before (Current Implementation)

```typescript
// In renderFeedCard method - two buttons for unfollowed feeds
} else {
  // Quick add button - adds to Uncategorized folder
  const quickAddBtn = rightSection.createEl("button", {
    text: "Quick add",
    cls: "rss-discover-card-add-btn",
  });
  quickAddBtn.addEventListener("click", () => {
    void (async () => {
      await this.quickAddFeed(feed);
      this.render();
    })();
  });

  // Add to... button - opens folder selection modal
  const addToBtn = rightSection.createEl("button", {
    text: "Add to...",
    cls: "rss-discover-card-add-btn rss-discover-card-add-to-btn",
  });
  addToBtn.addEventListener("click", () => {
    new AddToFolderModal(this.app, this.plugin, feed, () => {
      this.render();
    }).open();
  });
}
```

### After (New Implementation)

```typescript
// In renderFeedCard method - single button with dropdown
} else {
  // Add to... button - shows folder selector popup
  const addToBtn = rightSection.createEl("button", {
    text: "Add to...",
    cls: "rss-discover-card-add-btn rss-discover-card-add-to-btn",
  });

  const defaultFolder = "Uncategorized";

  addToBtn.addEventListener("click", () => {
    new FolderSelectorPopup(this.plugin, {
      anchorEl: addToBtn,
      defaultFolder: defaultFolder,
      onSelect: (folderName) => {
        void this.addFeedToFolder(feed, folderName);
      },
    });
  });
}
```

## Benefits of This Change

1. **Consistency**: Both Discover view and Kagi Smallweb view will use the same folder selection pattern
2. **Simplified UI**: Single button instead of two reduces visual clutter
3. **Better UX**: Dropdown popup is faster than modal (no extra click to confirm)
4. **Keyboard Support**: `FolderSelectorPopup` has full keyboard navigation
5. **Create Folders**: Users can create new folders directly from the popup

## Potential Considerations

1. **Default Folder**: Consider adding a setting for default discover folder (similar to `defaultSmallwebFolder`)
2. **Double-click**: Optionally add double-click behavior to add to default folder quickly (like Smallweb view)
3. **Mobile**: Test popup positioning on mobile devices
4. **Accessibility**: Ensure keyboard navigation works properly

## Related Files

- [`src/components/folder-selector-popup.ts`](src/components/folder-selector-popup.ts) - The popup component to use
- [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts) - Reference implementation
- [`src/views/discover-view.ts`](src/views/discover-view.ts) - File to modify
- [`src/modals/add-to-folder-modal.ts`](src/modals/add-to-folder-modal.ts) - File to potentially delete
