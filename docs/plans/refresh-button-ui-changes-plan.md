# Plan: Refresh Button UI Changes

## Goal

- Remove the refresh button next to the unread badge in the sidebar header
- Convert the refresh icon next to "All Feeds" into its own separate button that refreshes feeds and spins when refreshing

## Current State

In `src/components/sidebar.ts`, the "All Feeds" button section (lines 301-377) contains:

1. **Line 317-321**: `feedIcon` - decorative `refresh-cw` icon (NOT clickable)
2. **Lines 337-351**: `refreshBtn` - a button with click handler that calls `handleRefresh()`, positioned next to the unread badge
3. **Lines 353-359**: Unread count badge

## Implementation Steps

### Step 1: Modify `src/components/sidebar.ts` - `renderAllFeedsButton()` method

**Remove** the refresh button (lines 337-351):

- Delete the `refreshBtn` div element creation

**Modify** the `feedIcon` (lines 317-321) to become a clickable button:

- Change `feedIcon` from a `div` to include click handler
- Add `refreshing` class when `this.isRefreshing` is true
- Add click event listener that calls `handleRefresh()`
- Add `title` and `aria-label` attributes for accessibility
- Add `stopPropagation()` to prevent triggering the All Feeds click

### Step 2: Add CSS in `src/styles/sidebar.css`

Add spin animation for the new all-feeds-icon button:

- Add `.rss-dashboard-all-feeds-icon.refreshing svg` selector with spin animation
- Similar to existing `.rss-dashboard-inline-refresh-button.refreshing svg` (line 820-822)

## Code Changes Summary

### sidebar.ts changes:

```typescript
// Before: feedIcon is decorative
const feedIcon = allFeedsButton.createDiv({
  cls: "rss-dashboard-all-feeds-icon",
});
setIcon(feedIcon, "refresh-cw");

// After: feedIcon is clickable refresh button
const feedIcon = allFeedsButton.createDiv({
  cls:
    "rss-dashboard-all-feeds-icon" + (this.isRefreshing ? " refreshing" : ""),
  attr: {
    title: "Refresh all feeds",
    "aria-label": "Refresh all feeds",
  },
});
setIcon(feedIcon, "refresh-cw");
feedIcon.addEventListener("click", (e) => {
  e.stopPropagation();
  if (this.isRefreshing) return;
  void this.handleRefresh();
});

// REMOVE this entire block (lines 337-351):
// const refreshBtn = rightContainer.createDiv({...});
```

### sidebar.css changes:

```css
.rss-dashboard-all-feeds-icon.refreshing svg {
  animation: spin 1s linear infinite;
}
```
