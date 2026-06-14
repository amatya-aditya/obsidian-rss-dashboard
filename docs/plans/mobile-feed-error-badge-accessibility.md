# Mobile Accessibility Solution for Feed Error Badge - BUG REPORT

## Status: PARTIALLY IMPLEMENTED - BUG IN LONG-PRESS HANDLING

## Problem
The feed error badge (added in commit ead12855) displays error reasons via `title` attribute on hover, which is inaccessible on mobile/tablet devices with touch interfaces.

## Current Implementation
- Click handler on error badge opens modal with error details (WORKS)
- `showErrorDetailModal` private method added (WORKS)
- Mobile touch target CSS styles added (WORKS)
- Modal styling for error message display added (WORKS)

## Bug Report: Long-Press Does Not Open Modal

### Environment
- Platform: PC (Windows)
- Resolution: Dynamic window at sub-1200px width (simulating tablet)
- Device simulation: window.matchMedia("(hover: none) and (pointer: coarse)") query

### Expected Behavior
On touch devices/mobile, a long-press (500ms hold) on the error badge should open the error detail modal.

### Actual Behavior
The long-press does NOT trigger the modal. Testing locally shows:
1. Click (mouse) on error badge: WORKS - modal opens
2. Click/tap (touch simulation via browser dev tools): Need to verify
3. Long-press (500ms hold): DOES NOT WORK - no modal appears

### Implementation Details
Current code at `src/components/sidebar.ts:1540-1557`:
```typescript
if (!this.settings.display.hideFeedFetchErrorBadges && feed.lastFetchError) {
  const errorBadge = feedNameContainer.createDiv({
    cls: "rss-dashboard-feed-error-badge",
    attr: {
      title: feed.lastFetchError,
      "aria-label": `Feed error: ${feed.lastFetchError}`,
    },
  });
  setIcon(errorBadge, "alert-circle");

  // Click shows error details in modal (works on both desktop and mobile)
  errorBadge.addEventListener("click", (e) => {
    e.stopPropagation();
    this.showErrorDetailModal(feed.lastFetchError!, feed.title);
  });
}
```

Note: The current implementation ONLY has a click handler. The `attachLongPressContextMenu` pattern was removed during debugging. The click handler should work on mobile, but the long-press behavior was not re-implemented.

### Related Pattern Analysis
The codebase has an `attachLongPressContextMenu` method at `src/components/sidebar.ts:1669-1713` that:
1. On `pointerdown` (non-mouse): sets a 500ms timer
2. After 500ms: calls `onLongPress` callback
3. On `pointerup`/`pointercancel`/`pointermove`: clears the timer
4. On `click`: if longPressTriggered, prevents default and stops propagation

### Root Cause Hypothesis
The long-press functionality was removed during debugging but never properly restored. The click handler alone does NOT provide long-press support - it fires immediately on touch devices.

### Required Fix
Either:
1. Restore the `attachLongPressContextMenu` pattern for the error badge, OR
2. Implement a custom long-press handler that:
   - Detects touch-pointer events
   - Starts a 500ms timer on pointerdown
   - Shows modal after timer completes
   - Suppresses immediate click on touch devices to allow long-press detection

### Test File
`test_files/unit/components/sidebar-feed-error-badge.test.ts` - 8 tests pass (does NOT test long-press behavior)