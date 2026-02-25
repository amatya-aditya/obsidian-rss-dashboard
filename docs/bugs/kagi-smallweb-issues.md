# Kagi Smallweb View Bug Report

## Overview

Several issues have been identified in the Kagi Smallweb view implementation. This document outlines each issue, its root cause, attempted fixes, and proposed solutions.

---

## Issue 1: Text Overflow in Cards

### Description

Text inside the cards is overflowing outside the container cards on some cards but not all.

### Root Cause Analysis

1. **CSS overflow handling**: The `.rss-discover-card-summary` class lacks proper overflow constraints
2. **Card content container**: The `.rss-discover-card-content` class lacks proper constraints for text content
3. **Long URLs/titles**: Blog names and post titles can be very long without truncation
4. **Inconsistent application**: Some cards may have different content lengths that bypass the line-clamp

### Attempted Fixes

1. Added `overflow: hidden`, `text-overflow: ellipsis`, `-webkit-line-clamp: 3` to `.rss-discover-card-summary`
2. Added `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap` to `.rss-discover-card-title`

### Ongoing Issues

- Text descriptions are still overflowing on some cards but not all

### Additional Proposed Solutions

**Solution A: Add max-width constraints to card container**

```css
.rss-discover-card {
  max-width: 100%;
  overflow: hidden;
}

.rss-discover-card-content {
  overflow: hidden;
  max-width: 100%;
}
```

**Solution B: Add word-break for long URLs**

```css
.rss-discover-card-summary {
  word-break: break-word;
  overflow-wrap: break-word;
}
```

**Solution C: Add explicit width constraints to the grid**

```css
.rss-discover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.rss-discover-card {
  min-width: 0; /* Critical for text-overflow in grid items */
}
```

### Files to Modify

- `src/styles/discover.css`

---

## Issue 2: "View Blog" Button Issues

### Description

1. The "Preview" button was renamed to "View Blog" with globe icon
2. Globe icon and "View Blog" text need a space separating them
3. Currently opens in external browser regardless of settings - should respect the `useWebViewer` setting

### Root Cause Analysis

1. **Button text**: Originally set text to "Preview"
2. **No icon**: No icon was added to the button
3. **Hardcoded external open**: Used `window.open(entry.postUrl, "_blank")` which always opens in external browser
4. **Settings not checked**: The `useWebViewer` setting was not being consulted

### Attempted Fixes

1. Changed button to use `setIcon(previewBtn, "globe")` and `previewBtn.createSpan({ text: " View Blog" })`
2. Added settings check for `this.plugin.settings.useWebViewer`

### Ongoing Issues

- Globe icon and "View Blog" need a space separating them (the span text starts with a space but may not be rendering correctly)

### Additional Proposed Solutions

**Solution A: Add explicit spacing via CSS**

```css
.rss-discover-card-preview-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rss-discover-card-preview-btn svg {
  margin-right: 4px;
}
```

**Solution B: Use text node with explicit space**

```typescript
previewBtn.createSpan({ text: "\u00A0View Blog" }); // Non-breaking space
```

### Files to Modify

- `src/views/discover-view.ts` (or new file `src/views/kagi-smallweb-view.ts`)
- `src/styles/discover.css`

---

## Issue 3: "Follow" Button Issues

### Description

1. Button renamed from "+ follow blog" to "+ Follow" ✓
2. Double-click issue persists - requires two clicks to add
3. After following, button turns all green with no text visible (partially fixed)
4. **NEW**: Need to add unfollow functionality - clicking "Following" button should allow unfollowing with hover state showing "Unfollow" in red

### Root Cause Analysis

1. **Double-click issue**: The `handleSmallwebSubscribe` function may not be triggering a re-render after the feed is added, so the UI doesn't update to show the "Following" state
2. **Green button with no text**: CSS color contrast issue (partially fixed by using `color: white`)
3. **No unfollow functionality**: The Following button is disabled and has no click handler

### Attempted Fixes

1. Changed button text to "+ Follow" with plus icon
2. Removed redundant subscription check at start of `handleSmallwebSubscribe`
3. Fixed button state update to use `empty()`, `setIcon()`, `createSpan()`
4. Changed CSS to use `color: white` for proper contrast

### Ongoing Issues

- Double-click issue persists - need to add a refresh/re-render after successful follow
- No unfollow functionality on the Following button

### Additional Proposed Solutions

**Solution A: Add re-render after successful follow**

```typescript
private async handleSmallwebSubscribe(
  entry: SmallwebEntry,
  buttonEl: HTMLButtonElement,
): Promise<void> {
  try {
    await this.plugin.addFeed(entry.blogName, entry.blogUrl, "Uncategorized");
    new Notice(`Following "${entry.blogName}"`);
    this.render(); // Force re-render to update all cards
  } catch (err) {
    // Error handling...
  }
}
```

**Solution B: Add unfollow functionality with hover state**

```typescript
// In renderSmallwebCard, for already subscribed feeds:
if (isSubscribed) {
  const followingBtn = rightSection.createEl("button", {
    cls: "rss-smallweb-following-btn",
  });
  setIcon(followingBtn, "check");
  followingBtn.createSpan({ text: " Following" });

  // Add hover effect for unfollow
  followingBtn.addEventListener("mouseenter", () => {
    followingBtn.empty();
    setIcon(followingBtn, "x");
    followingBtn.createSpan({ text: " Unfollow" });
    followingBtn.addClass("rss-smallweb-unfollow-hover");
  });

  followingBtn.addEventListener("mouseleave", () => {
    followingBtn.empty();
    setIcon(followingBtn, "check");
    followingBtn.createSpan({ text: " Following" });
    followingBtn.removeClass("rss-smallweb-unfollow-hover");
  });

  followingBtn.addEventListener("click", () => {
    void this.handleSmallwebUnfollow(entry, followingBtn);
  });
}
```

**Solution C: CSS for unfollow hover state**

```css
.rss-smallweb-unfollow-hover {
  background: var(--background-modifier-error) !important;
  color: white !important;
  border-color: var(--background-modifier-error) !important;
  cursor: pointer !important;
}

.rss-smallweb-following-btn {
  cursor: pointer !important; /* Enable clicking */
}
```

**Solution D: Unfollow handler function**

```typescript
private async handleSmallwebUnfollow(
  entry: SmallwebEntry,
  buttonEl: HTMLButtonElement,
): Promise<void> {
  try {
    const feedIndex = this.plugin.settings.feeds.findIndex(
      (f: Feed) => f.url === entry.blogUrl,
    );
    if (feedIndex >= 0) {
      this.plugin.settings.feeds.splice(feedIndex, 1);
      await this.plugin.saveSettings();
      new Notice(`Unfollowed "${entry.blogName}"`);
      this.render(); // Force re-render
    }
  } catch (err) {
    console.error("[Kagi Smallweb] Error unfollowing:", err);
    new Notice("Failed to unfollow");
  }
}
```

### Files to Modify

- `src/views/discover-view.ts` (or new file `src/views/kagi-smallweb-view.ts`)
- `src/styles/discover.css`

---

## Issue 4: Badges Slightly Off Center

### Description

The "Smallweb" badge sits slightly below the other two badges (domain and time tags).

### Root Cause Analysis

1. **Different CSS classes**: The "Smallweb" badge uses `.rss-smallweb-badge` class while domain and time tags use `.rss-discover-card-tag` class
2. **Vertical alignment**: Different padding/line-height between badge types causes misalignment

### Attempted Fixes

1. Added `display: inline-flex`, `align-items: center`, `vertical-align: middle` to `.rss-smallweb-badge`
2. Added same properties to `.rss-discover-card-meta-top > *`

### Status

- Needs verification - may be fixed

### Files to Modify

- `src/styles/discover.css`

---

## Issue 5: Add Last Update Time with UTC/EST Display

### Description

Underneath the description in the header, add a line showing:

- "Last update: [UTC time] / [EST time]"
- This should pull from the `<updated>` metadata from the feed
- Make this area a link to `https://kagi.com/api/v1/smallweb/feed/`

### Attempted Fixes

1. Added `smallwebFeedUpdatedAt` property
2. Modified `parseSmallwebAtomFeed` to extract feed-level `<updated>` timestamp
3. Added display in header with UTC and EST times
4. Wrapped in link to API endpoint

### Status

- Implemented - needs verification

### Files Modified

- `src/views/discover-view.ts`
- `src/styles/discover.css`

---

## Issue 6: Code Should Be in Separate File

### Description

The Smallweb functionality was put into `discover-view.ts` when it should have been a separate file `kagi-smallweb-view.ts` as per the instruction document.

### Root Cause Analysis

- The instruction document specified a separate file but the implementation was added to `discover-view.ts` for simplicity

### Proposed Solution

**Create `src/views/kagi-smallweb-view.ts` with:**

1. Extract all Smallweb-related code from `discover-view.ts`:
   - `SmallwebEntry` interface
   - `SmallwebCache` interface
   - Smallweb state properties
   - All Smallweb methods (switchToSmallweb, fetchSmallwebFeed, parseSmallwebAtomFeed, etc.)
   - All Smallweb render methods (renderSmallwebLayout, renderSmallwebHeader, renderSmallwebCard, etc.)

2. Create a new view class that extends `ItemView`:

```typescript
export class KagiSmallwebView extends ItemView {
  // All smallweb-specific state and methods
}
```

3. Register the new view in `main.ts`

4. Update navigation in `discover-view.ts` to open the new view

### Files to Create/Modify

- Create: `src/views/kagi-smallweb-view.ts`
- Modify: `src/views/discover-view.ts` (remove Smallweb code)
- Modify: `main.ts` (register new view)

---

## Task List

### Phase 1: Critical Fixes

- [ ] Fix Issue 3.2: Add re-render after successful follow
- [ ] Fix Issue 3.4: Add unfollow functionality with hover state
- [ ] Fix Issue 2.2: Add space between globe icon and "View Blog" text

### Phase 2: Code Organization

- [ ] Fix Issue 6: Extract Smallweb code to separate file `kagi-smallweb-view.ts`

### Phase 3: Visual Fixes

- [ ] Fix Issue 1: Text overflow still occurring on some cards
- [ ] Verify Issue 4: Badge alignment fix

### Phase 4: Testing

- [ ] Test text overflow with various content lengths
- [ ] Test View Blog button with useWebViewer enabled/disabled
- [ ] Test Follow button single-click functionality
- [ ] Test Unfollow functionality
- [ ] Test badge alignment across different themes
- [ ] Test timestamp display and link

---

## Priority Order

1. **Critical**: Issue 3 (Follow button double-click and unfollow)
2. **High**: Issue 6 (Separate file)
3. **Medium**: Issue 2 (View Blog spacing)
4. **Medium**: Issue 1 (Text overflow)
5. **Low**: Issue 4 (Badge alignment verification)

---

## Additional Notes

- The Smallweb functionality is currently embedded in `discover-view.ts` but should be extracted to `kagi-smallweb-view.ts`
- The `useWebViewer` setting is defined in `types.ts` line 228 and defaults to `true`
- WebViewerIntegration service is available in `src/services/web-viewer-integration.ts`
- User timezone is America/New_York (EST/EDT)
