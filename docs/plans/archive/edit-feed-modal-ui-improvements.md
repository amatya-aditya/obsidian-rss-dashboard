# Edit Feed Modal UI/UX Improvements Plan

## Overview

This plan outlines improvements to the Edit Feed modal window to match the styling and UX improvements implemented in the Add Feed modal. The goal is to provide a consistent user experience across both modals.

## Current State Analysis

### Edit Feed Modal (in [`EditFeedModal`](src/modals/feed-manager-modal.ts:43))

The current Edit Feed modal has the following structure:

1. **Header**: "Edit feed" (plain text, no emoji)
2. **Feed URL**: Text input with standard "Load" button (no purple styling, no placeholder)
3. **Title**: Text input
4. **Latest entry posted**: Display field (different label than Add Feed)
5. **Status**: Display field (no color coding)
6. **Folder**: Text input with autocomplete
7. **Per feed control options**: Heading
8. **Advanced Options**:
   - Auto delete articles duration
   - Max items limit
   - Scan interval
   - Article template
9. **Save/Cancel buttons**

### Add Feed Modal (Already Improved)

The Add Feed modal has been enhanced with:

- Emoji-enhanced labels
- Purple Load button with loading spinner
- Color-coded status indicators
- Supported formats badges with active state detection
- Modal subtitle
- Input placeholder text
- Loaded state styling for URL input

## Key Differences to Address

| Feature            | Add Feed Modal              | Edit Feed Modal       | Action Needed                    |
| ------------------ | --------------------------- | --------------------- | -------------------------------- |
| Header             | "➕ Add Feed" with subtitle | "Edit feed" plain     | Add emoji and subtitle           |
| Load Button        | Purple with loading spinner | Standard blue         | Apply purple styling             |
| Status Display     | Color-coded with emojis     | Plain text            | Add color classes                |
| Supported Formats  | Badges with active glow     | Not present           | Add format badges                |
| URL Input          | Placeholder + loaded state  | No placeholder        | Add placeholder and loaded state |
| Latest Entry Label | "📅 Latest Entry"           | "Latest entry posted" | Update label with emoji          |
| Advanced Options   | Removed (simplified)        | Present               | Keep for Edit modal              |

## Proposed Changes

### 1. Add Emojis to Modal Elements

| Element                  | Current                    | Proposed              |
| ------------------------ | -------------------------- | --------------------- |
| Modal Header             | "Edit feed"                | "✏️ Edit Feed"        |
| Feed URL Label           | "Feed URL"                 | "🔗 Feed URL"         |
| Title Label              | "Title"                    | "📝 Title"            |
| Latest Entry Label       | "Latest entry posted"      | "📅 Latest Entry"     |
| Status Label             | "Status"                   | "📊 Status"           |
| Folder Label             | "Folder"                   | "📁 Folder"           |
| Per Feed Options Heading | "Per feed control options" | "⚙️ Per Feed Options" |

### 2. Add Modal Subtitle

Add a subtitle under the header similar to Add Feed modal:

```html
<div class="add-feed-subtitle">Modify feed settings and configuration</div>
```

### 3. Purple Load Button with Loading State

**Current**: Standard button using default Obsidian styling

**Proposed**: Apply the same `.rss-dashboard-load-button` class used in Add Feed modal:

```typescript
btn.buttonEl.addClass("rss-dashboard-load-button");
```

Add loading state management:

```typescript
// Set loading state
loadBtn.addClass("loading");
loadBtn.disabled = true;

// After load completes
loadBtn.removeClass("loading");
loadBtn.disabled = false;
```

### 4. Color-Coded Status Text

Update status display logic to match Add Feed modal:

```typescript
// On loading
status = "⏳ Loading...";
if (refs.statusDiv) {
  refs.statusDiv.textContent = status;
  refs.statusDiv.removeClass("status-ok");
  refs.statusDiv.removeClass("status-error");
  refs.statusDiv.addClass("status-loading");
}

// On success
status = "OK";
if (refs.statusDiv) {
  refs.statusDiv.textContent = "✅ OK";
  refs.statusDiv.removeClass("status-loading");
  refs.statusDiv.addClass("status-ok");
}

// On error
if (refs.statusDiv) {
  refs.statusDiv.textContent = `❌ ${errorMsg}`;
  refs.statusDiv.removeClass("status-loading");
  refs.statusDiv.addClass("status-error");
}
```

### 5. Supported Formats Badges

Add the same format badges from Add Feed modal to indicate feed type detection:

```html
<div class="supported-formats">
  <span class="format-badge rss">[RSS icon] RSS</span>
  <span class="format-badge podcast">[Podcast icon] Apple Podcasts</span>
  <span class="format-badge youtube">[YouTube icon] YouTube</span>
</div>
```

Include the active state glow effect when feed type is detected during Load.

### 6. URL Input Enhancements

Add placeholder and loaded state:

```typescript
urlInput.placeholder = "https://example.com/feed.xml";
urlInput.addClass("feed-url-input");

// On successful load
urlInput.addClass("loaded");
```

### 7. Keep Advanced Options Section

Unlike the Add Feed modal where advanced options were removed for simplification, the Edit Feed modal should **retain** the advanced options section. This is because:

1. Users editing an existing feed may need to configure these settings
2. The Edit modal is the primary interface for adjusting per-feed settings
3. Removing them would require users to delete and re-add feeds to change settings

However, consider adding a collapsible toggle for the advanced section to reduce initial visual complexity.

### 8. Optional: Collapsible Advanced Options

Consider making the advanced options collapsible by default:

```typescript
// Create toggle header
const advancedToggle = contentEl.createDiv({ cls: "advanced-options-toggle" });
advancedToggle.textContent = "⚙️ Advanced Options ▶";

// Create collapsible container
const advancedContainer = contentEl.createDiv({
  cls: "advanced-options-container hidden",
});

// Toggle click handler
advancedToggle.onclick = () => {
  advancedContainer.toggleClass("hidden");
  const isOpen = !advancedContainer.hasClass("hidden");
  advancedToggle.textContent = isOpen
    ? "⚙️ Advanced Options ▼"
    : "⚙️ Advanced Options ▶";
};
```

```css
.advanced-options-toggle {
  cursor: pointer;
  padding: 0.5rem 0;
  color: var(--text-muted);
  font-size: 0.9em;
  user-select: none;
}

.advanced-options-toggle:hover {
  color: var(--text-normal);
}

.advanced-options-container.hidden {
  display: none;
}
```

## Implementation Checklist

- [ ] Add emoji to modal header "✏️ Edit Feed"
- [ ] Add modal subtitle "Modify feed settings and configuration"
- [ ] Add emoji to Feed URL label "🔗 Feed URL"
- [ ] Add emoji to Title label "📝 Title"
- [ ] Update Latest Entry label to "📅 Latest Entry"
- [ ] Add emoji to Status label "📊 Status"
- [ ] Add emoji to Folder label "📁 Folder"
- [ ] Update Per Feed Options heading with emoji "⚙️ Per Feed Options"
- [ ] Apply `.rss-dashboard-load-button` class to Load button
- [ ] Add loading state management to Load button
- [ ] Add loading spinner support during feed fetch
- [ ] Add color-coded status classes (status-ok, status-error, status-loading)
- [ ] Update status display logic with emojis
- [ ] Add placeholder text to URL input
- [ ] Add `.feed-url-input` class to URL input
- [ ] Add loaded state styling on successful fetch
- [ ] Add supported formats badges below URL input
- [ ] Add active badge detection logic during Load
- [ ] Test on both desktop and mobile views
- [ ] Test dark mode compatibility

## Files to Modify

### 1. [`src/modals/feed-manager-modal.ts`](src/modals/feed-manager-modal.ts)

**EditFeedModal class (lines 43-467)**:

- Update header setting name (line 65)
- Add subtitle div after header
- Update Feed URL setting name (line 80)
- Add placeholder to URL input
- Add `.feed-url-input` class to URL input
- Apply `.rss-dashboard-load-button` class to Load button
- Add loading state management in Load click handler
- Add supported formats badges creation
- Add badge active state logic
- Update status display with color classes and emojis
- Update Title setting name (line 168)
- Update Latest entry setting name (line 183)
- Update Status setting name (line 191)
- Update Folder setting name (line 197)
- Update Per feed control options heading (line 207)
- Add loaded state to URL input on success

### 2. [`src/styles/modals.css`](src/styles/modals.css)

The existing CSS from Add Feed improvements should already support most styling needs:

- `.add-feed-subtitle` - already defined (line 452-457)
- `.rss-dashboard-load-button` - already defined (line 460-509)
- `.add-feed-status.status-*` - already defined (line 512-525)
- `.feed-url-input.loaded` - already defined (line 528-531)
- `.supported-formats` and `.format-badge` - already defined (line 534-604)

**Optional additions** if collapsible advanced options are implemented:

- `.advanced-options-toggle` styles
- `.advanced-options-container` styles

## Visual Mockup

```
┌─────────────────────────────────────────────────────┐
│  ✏️ Edit Feed                                       │
│  Modify feed settings and configuration             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🔗 Feed URL                                        │
│  ┌─────────────────────────────────────┐ [Load]    │
│  │ https://example.com/feed.xml        │  (purple) │
│  └─────────────────────────────────────┘           │
│  [RSS icon] RSS  [Podcast icon] Apple Podcasts     │
│  [YouTube icon] YouTube                            │
│                                                     │
│  📝 Title                                           │
│  ┌─────────────────────────────────────┐           │
│  │ My Awesome Feed                     │           │
│  └─────────────────────────────────────┘           │
│                                                     │
│  📅 Latest Entry           📊 Status               │
│     2 days ago                ✅ OK (green)        │
│                                                     │
│  📁 Folder                                          │
│  ┌─────────────────────────────────────┐           │
│  │ Tech News                           │           │
│  └─────────────────────────────────────┘           │
│                                                     │
│  ⚙️ Per Feed Options                                │
│  ────────────────────────────────────────          │
│  Auto delete articles duration: [Dropdown]         │
│  Max items limit: [Dropdown]                       │
│  Scan interval: [Dropdown]                         │
│  Article template: [Dropdown]                      │
│                                                     │
│                          [Cancel] [Save]           │
└─────────────────────────────────────────────────────┘
```

## Code Changes Detail

### EditFeedModal Header Section

**Before** (line 65):

```typescript
new Setting(contentEl).setName("Edit feed").setHeading();
```

**After**:

```typescript
new Setting(contentEl).setName("✏️ Edit Feed").setHeading();

// Add subtitle
const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
subtitle.textContent = "Modify feed settings and configuration";
```

### EditFeedModal URL Input Section

**Before** (lines 79-166):

```typescript
new Setting(contentEl)
  .setName("Feed URL")
  .addText((text) => {
    text.setValue(url).onChange((v) => (url = v));
    urlInput = text.inputEl;
    // ... existing code
  })
  .addButton((btn) => {
    btn.setButtonText("Load").onClick(() => {
      // ... existing code without loading state
    });
  });
```

**After**:

```typescript
const urlSetting = new Setting(contentEl)
  .setName("🔗 Feed URL")
  .addText((text) => {
    text.setValue(url).onChange((v) => (url = v));
    urlInput = text.inputEl;
    urlInput.autocomplete = "off";
    urlInput.spellcheck = false;
    urlInput.placeholder = "https://example.com/feed.xml";
    urlInput.addClass("feed-url-input");
    // ... existing event listeners
  })
  .addButton((btn) => {
    btn.setButtonText("Load");
    btn.buttonEl.addClass("rss-dashboard-load-button");
    loadBtn = btn.buttonEl;
    btn.onClick(() => {
      void (async () => {
        // Set loading state
        loadBtn.addClass("loading");
        loadBtn.disabled = true;
        clearBadgeActiveStates();

        // ... existing load logic with status updates

        // Update status with color classes
        // On success:
        if (refs.statusDiv) {
          refs.statusDiv.textContent = "✅ OK";
          refs.statusDiv.removeClass("status-loading");
          refs.statusDiv.addClass("status-ok");
        }
        if (urlInput) {
          urlInput.addClass("loaded");
        }
        setActiveBadge(detectedType);

        // On error:
        if (refs.statusDiv) {
          refs.statusDiv.textContent = `❌ ${errorMsg}`;
          refs.statusDiv.removeClass("status-loading");
          refs.statusDiv.addClass("status-error");
        }
      })();
    });
  });

// Add supported formats badges (same as AddFeedModal)
// ... badge creation code
```

## Notes

- All changes should maintain backward compatibility with existing functionality
- Mobile responsiveness should be preserved (existing CSS handles this)
- Dark mode compatibility should be tested
- The advanced options section is retained since it's essential for editing existing feeds
- Consider adding collapsible advanced options as an optional enhancement
- The format badge detection logic should mirror the Add Feed modal implementation

## Related Documents

- [Add Feed Modal UI Improvements](./add-feed-modal-ui-improvements.md) - Reference for styling patterns
