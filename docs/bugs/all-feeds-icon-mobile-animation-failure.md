# Bug Report: all-feeds-icon does not animate the spin animation on mobile when feeds are refreshing

## Issue Summary
The `rss-dashboard-all-feeds-icon` element fails to show the spin animation when feeds are actively refreshing on mobile devices (tested at resolution < 1200px).

## Expected Behavior
When `isRefreshActive` is true (either `this.plugin.isMultiFeedRefreshActive` or `this.plugin.activeRefreshState?.size > 0`), the refresh icon should spin continuously to indicate ongoing refresh activity, matching the behavior on desktop.

## Actual Behavior
The refresh icon shows the "refresh-cw" icon but does not animate spinning on mobile devices.

## Environment
- Screen resolution: < 1200px (mobile/tablet breakpoint)
- Device: Mobile (iOS/Chrome Mobile)
- Sidebar context: `.modal.rss-mobile-navigation-modal`

## Implementation Details

### Current Code (sidebar.ts:977-990)
```typescript
const isRefreshActive =
  this.plugin.isMultiFeedRefreshActive ||
  (this.plugin.activeRefreshState?.size ?? 0) > 0;

const feedIcon = allFeedsButton.createDiv({
  cls:
    "rss-dashboard-all-feeds-icon" + (isRefreshActive ? " refreshing" : ""),
});
setIcon(feedIcon, "refresh-cw");
```

## Changes Made

### 1. `src/styles/sidebar.css`

**Added SVG styling for all-feeds-icon** (after existing rule at line ~972):
```css
.rss-dashboard-all-feeds-icon svg {
  display: block;
  width: 16px;
  height: 16px;
  overflow: visible;
  will-change: transform;
}
```

**Updated the refreshing SVG animation selector** (lines ~1027-1034):
```css
.rss-dashboard-all-feeds-icon.refreshing svg,
.rss-dashboard-inline-refresh-button.refreshing svg {
  animation: spin 1s linear infinite;
  -webkit-animation: spin 1s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform;
}
```

### 2. `src/styles/modals.css`

**Added mobile modal override** (lines ~905-912):
```css
/* Ensure all-feeds-icon spinner animation works in mobile modal context */
.modal.rss-mobile-navigation-modal .rss-dashboard-all-feeds-icon.refreshing svg {
  animation: spin 1s linear infinite;
  -webkit-animation: spin 1s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform;
}
```

## Suspected Remaining Causes

1. **CSS containment**: The `contain: layout style` property on `.clickable-icon` (line 233 in sidebar.css) may be preventing the SVG animation from being composited correctly on mobile

2. **Modal transform context**: The mobile modal uses `position: fixed` and other CSS that may create an incompatible rendering context for SVG transforms

3. **Keyframe override**: There are multiple `@keyframes spin` definitions in sidebar.css, discover.css, and add-feed-modal.css - the last one (discover.css) may be overriding properties

4. **Obsidian icon rendering**: The `setIcon` function renders SVG elements that may have specific class names or structures that conflict with the animation selector

## Next Debugging Steps

1. Inspect the actual rendered SVG element in mobile browser dev tools to verify CSS is applied
2. Check if Obsidian adds specific classes or attributes to SVG icons that affect animation
3. Try removing `contain: layout style` from parent elements to test if it affects compositing
4. Consider using JavaScript-based rotation as a fallback for mobile browsers