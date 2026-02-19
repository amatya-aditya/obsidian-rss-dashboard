# Discover Feed Add Button Redesign

## Overview

Change the "Add feed" button behavior in the Discover view to provide two options:

1. **Quick Add** - Adds feed to "Uncategorized" folder (creates folder if needed)
2. **Add to...** - Opens a modal to select a specific folder

## Implementation Plan

### 1. Modify `renderFeedCard()` in discover-view.ts

**Current behavior:**

- Single "Add feed" button that uses smart folder matching

**New behavior:**

- "Quick Add" button - adds to "Uncategorized" folder
- "Add to..." button - opens folder selection modal

### 2. Create `AddToFolderModal` class

A lightweight modal that:

- Shows a folder dropdown using `FolderSuggest` component
- Has "Add" and "Cancel" buttons
- Optionally allows creating a new folder

### 3. Update `addFeed()` method

Split into two methods:

- `quickAddFeed()` - Adds to "Uncategorized", creates folder if needed
- `addToFolder()` - Opens modal, then adds to selected folder

### 4. Add folder creation logic

Create helper method `ensureFolderExists()` that:

- Checks if folder exists
- Creates it if not
- Uses `plugin.addFolder()` method

## Code Changes

### File: src/views/discover-view.ts

#### Changes to `renderFeedCard()`:

```typescript
// Replace single "Add feed" button with two buttons:
const quickAddBtn = rightSection.createEl("button", {
	text: "Quick Add",
	cls: "rss-discover-card-add-btn",
});
quickAddBtn.addEventListener("click", () => {
	void (async () => {
		await this.quickAddFeed(feed);
		quickAddBtn.setText("Added");
		quickAddBtn.disabled = true;
	})();
});

const addToBtn = rightSection.createEl("button", {
	text: "Add to...",
	cls: "rss-discover-card-add-btn rss-discover-card-add-to-btn",
});
addToBtn.addEventListener("click", () => {
	new AddToFolderModal(this.app, this.plugin, feed, () => {
		addToBtn.setText("Added");
		addToBtn.disabled = true;
		quickAddBtn.disabled = true;
	}).open();
});
```

#### New `quickAddFeed()` method:

```typescript
private async quickAddFeed(feed: FeedMetadata): Promise<void> {
    try {
        const folder = "Uncategorized";
        await this.ensureFolderExists(folder);
        await this.plugin.addFeed(feed.title, feed.url, folder);
        new Notice(`Feed "${feed.title}" added to Uncategorized`);
    } catch (error) {
        new Notice(`Failed to add feed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
```

#### New `ensureFolderExists()` method:

```typescript
private async ensureFolderExists(folderName: string): Promise<void> {
    const folderExists = this.plugin.settings.folders.some(
        f => f.name.toLowerCase() === folderName.toLowerCase()
    );
    if (!folderExists) {
        await this.plugin.addFolder(folderName);
    }
}
```

### File: src/modals/add-to-folder-modal.ts (NEW)

Create a new modal class for folder selection:

- Extends Obsidian's Modal class
- Uses FolderSuggest for folder dropdown
- Simple UI with folder input and Add/Cancel buttons
- Optionally allows typing a new folder name to create it

## UI Layout

```
┌─────────────────────────────────────────┐
│  Add "Feed Title" to folder             │
├─────────────────────────────────────────┤
│                                         │
│  Folder: [Type or select folder...   ] │
│          ▼ Dropdown with suggestions    │
│                                         │
├─────────────────────────────────────────┤
│         [Cancel]  [Add to folder]       │
└─────────────────────────────────────────┘
```

## Styling Considerations

- Two buttons should be styled consistently
- "Quick Add" could be primary style (more prominent)
- "Add to..." could be secondary style
- Both buttons should fit in the card footer without overflow
