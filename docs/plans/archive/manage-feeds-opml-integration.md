# Manage Feeds Modal - OPML Import/Export Integration

## Overview

This plan outlines the integration of Import and Export OPML buttons from the sidebar footer into the Manage Feeds modal, placing them on the same row as the Delete All button.

## Current State Analysis

### Feed Manager Modal Structure

Location: [`src/modals/feed-manager-modal.ts`](src/modals/feed-manager-modal.ts:1148-1199)

The current `FeedManagerModal.onOpen()` method creates a top controls section with:

- Search input container
- Add feed button
- Delete all button

```typescript
// Current structure (lines 1148-1199)
const topControls = contentEl.createDiv({ cls: "feed-manager-top-controls" });

// Search input
const searchContainer = topControls.createDiv({ cls: "feed-manager-search-container" });
const searchInput = searchContainer.createEl("input", { ... });

// Add feed button
const addFeedBtn = topControls.createEl("button", { text: "Add feed", cls: "rss-dashboard-primary-button feed-manager-add-button" });

// Delete All button
const deleteAllBtn = topControls.createEl("button", { text: "Delete all", cls: "rss-dashboard-danger-button feed-manager-delete-all-button" });
```

### Sidebar OPML Buttons

Location: [`src/components/sidebar.ts`](src/components/sidebar.ts:1636-1656)

The sidebar has Import/Export OPML buttons in the toolbar:

- Import button uses `upload` icon
- Export button uses `download` icon
- Both call plugin methods: `this.plugin.importOpml()` and `this.plugin.exportOpml()`

### Current CSS Styles

Location: [`src/styles/modals.css`](src/styles/modals.css:814-828)

Mobile styles for `.feed-manager-top-controls`:

```css
@media (max-width: 768px) {
  .feed-manager-top-controls {
    flex-direction: column;
    gap: 12px;
  }
  /* ... other mobile styles */
}
}
```

## Proposed Changes

### 1. TypeScript Changes - feed-manager-modal.ts

Add Import and Export OPML buttons to the top controls section:

```typescript
// New structure
const topControls = contentEl.createDiv({ cls: "feed-manager-top-controls" });

// Search input (unchanged)
const searchContainer = topControls.createDiv({ cls: "feed-manager-search-container" });
const searchInput = searchContainer.createEl("input", { ... });

// Button row container (new)
const buttonRow = topControls.createDiv({ cls: "feed-manager-button-row" });

// Add feed button (moved to button row)
const addFeedBtn = buttonRow.createEl("button", { text: "Add feed", cls: "rss-dashboard-primary-button feed-manager-add-button" });

// Import OPML button (new)
const importOpmlBtn = buttonRow.createEl("button", {
  text: "Import",
  cls: "feed-manager-opml-button feed-manager-import-button"
});
setIcon(importOpmlBtn, "upload");
importOpmlBtn.onclick = () => this.plugin.importOpml();

// Export OPML button (new)
const exportOpmlBtn = buttonRow.createEl("button", {
  text: "Export",
  cls: "feed-manager-opml-button feed-manager-export-button"
});
setIcon(exportOpmlBtn, "download");
exportOpmlBtn.onclick = () => this.plugin.exportOpml();

// Delete All button (moved to button row)
const deleteAllBtn = buttonRow.createEl("button", { text: "Delete all", cls: "rss-dashboard-danger-button feed-manager-delete-all-button" });
```

### 2. CSS Changes - modals.css

Add styles for the new button layout:

```css
/* Feed Manager Button Row */
.feed-manager-button-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* OPML Button Styles */
.feed-manager-opml-button {
  background: var(--interactive-normal);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.feed-manager-opml-button:hover {
  background: var(--interactive-hover);
  border-color: var(--interactive-accent);
}

.feed-manager-opml-button svg {
  width: 14px;
  height: 14px;
}

/* Compact button sizing for the row */
.feed-manager-button-row .rss-dashboard-primary-button,
.feed-manager-button-row .rss-dashboard-danger-button {
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
}
```

### 3. Responsive/Mobile CSS Changes

Add mobile-specific styles to float buttons below the input:

```css
/* Mobile styles (<= 768px) */
@media (max-width: 768px) {
  .feed-manager-top-controls {
    flex-direction: column;
    gap: 12px;
  }

  .feed-manager-search-container {
    width: 100%;
  }

  .feed-manager-search-input {
    width: 100%;
    min-height: 44px;
  }

  .feed-manager-button-row {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .feed-manager-button-row button {
    flex: 1 1 auto;
    min-height: 44px;
    min-width: 80px;
    font-size: 14px;
    padding: 10px 12px;
  }

  /* Ensure Delete All button gets appropriate styling */
  .feed-manager-button-row .feed-manager-delete-all-button {
    flex: 1 1 100%;
  }
}

/* Very small screens (<= 400px) */
@media (max-width: 400px) {
  .feed-manager-button-row {
    flex-direction: column;
  }

  .feed-manager-button-row button {
    width: 100%;
  }
}
```

## Visual Layout

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Manage feeds                                           ✕   │
├─────────────────────────────────────────────────────────────┤
│  [Search feeds...                    ] [Add feed] [Import] [Export] [Delete all] │
├─────────────────────────────────────────────────────────────┤
│  Feeds list...                                              │
└─────────────────────────────────────────────────────────────┘
```

### Mobile Layout (<= 768px)

```
┌───────────────────────────────┐
│  Manage feeds             ✕   │
├───────────────────────────────┤
│  [Search feeds...           ] │
│  ┌──────┐ ┌────────┐         │
│  │Add   │ │Import  │         │
│  │feed  │ │        │         │
│  └──────┘ └────────┘         │
│  ┌────────┐ ┌────────┐       │
│  │Export  │ │Delete  │       │
│  │        │ │all     │       │
│  └────────┘ └────────┘       │
├───────────────────────────────┤
│  Feeds list...                │
└───────────────────────────────┘
```

## Implementation Steps

1. **Modify feed-manager-modal.ts**
   - Import `setIcon` from obsidian
   - Add button row container after search input
   - Add Import OPML button with upload icon
   - Add Export OPML button with download icon
   - Wire up click handlers to `this.plugin.importOpml()` and `this.plugin.exportOpml()`

2. **Update modals.css**
   - Add `.feed-manager-button-row` styles
   - Add `.feed-manager-opml-button` styles
   - Add compact button sizing for the button row
   - Add mobile responsive styles

3. **Test the implementation**
   - Verify buttons appear correctly on desktop
   - Verify buttons wrap properly on tablet
   - Verify buttons stack properly on mobile
   - Verify Import/Export functionality works

## Files to Modify

| File                               | Changes                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `src/modals/feed-manager-modal.ts` | Add Import/Export OPML buttons to top controls                  |
| `src/styles/modals.css`            | Add button row and OPML button styles, mobile responsive styles |

## Dependencies

- `setIcon` function from Obsidian API
- `importOpml()` and `exportOpml()` methods on the plugin (already exist)
