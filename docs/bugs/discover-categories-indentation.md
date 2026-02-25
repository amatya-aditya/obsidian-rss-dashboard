# Bug Report: Discover Categories Indentation Issue

## Issue Description

When expanding categories in the Discover page sidebar, child elements appear to the right of the parent instead of being indented below it. The UI should look more like a tree-branch structure where children are indented below their parent where there is only subtle indentation to show the hierarchy.

## Current Behavior

- Categories are sorted alphabetically ✅
- Categories are collapsed by default ✅
- When clicking to expand, children appear Indented and to the RIGHT of the parent

## Root Cause Analysis

### How Dashboard Sidebar Works (src/components/sidebar.ts)

The dashboard uses a nested rendering approach where children are rendered directly INTO the parent container:

```typescript
// Line 453-457: Creates folder element
const folderEl = container.createDiv({
  cls: "rss-dashboard-feed-folder",
});
const depthClass = `rss-dashboard-folder-depth-${Math.min(depth, 5)}`;
folderEl.addClass(depthClass);

// Line 663-665: Recursively renders subfolders INTO the parent element
sortedSubfolders.forEach((subfolder: Folder) => {
  this.renderFolder(subfolder, fullPath, depth + 1, folderEl);
});
```

Key points:

1. Each folder element has a depth class (e.g., `rss-dashboard-folder-depth-0`, `rss-dashboard-folder-depth-1`)
2. Subfolders are rendered directly into the parent folder element (`folderEl`)
3. CSS handles indentation via margin-left

### How Discover Categories Currently Works (src/views/discover-view.ts)

My implementation creates a SEPARATE children container:

```typescript
// Line 624-628: Creates separate children container
childrenContainer = node.createDiv({
  cls: "rss-discover-category-children rss-collapsed",
});

// Children are rendered into this separate container
sortedEntries.forEach(([childName, childChildren]) => {
  this.renderCategoryNode(
    childrenContainer!,
    childName,
    childChildren,
    depth + 1,
  );
});
```

The problem: The children container is a separate div that appears AFTER the parent in the DOM, but CSS isn't properly positioning it.

## CSS Comparison

### Dashboard CSS (podcast-themes.css)

```css
.rss-dashboard-folder-depth-0 {
  margin-left: 0px;
}
.rss-dashboard-folder-depth-1 {
  margin-left: 18px;
}
.rss-dashboard-folder-depth-2 {
  margin-left: 36px;
}
/* etc. */
```

### Discover CSS (discover.css)

```css
.rss-discover-category-node {
  display: flex;
  /* ... */
}

.rss-discover-category-row {
  padding-left: calc(var(--depth) * 16px);
  /* This only affects the row content, not children position */
}

.rss-discover-category-children {
  padding-left: 16px; /* I added this but it's not enough */
}
```

## Potential Solutions

### Option 1: Match Dashboard Approach (Recommended)

Revert to rendering children directly into the parent container (like the original code), but add depth-based indentation:

1. Remove the separate `.rss-discover-category-children` container
2. Render children directly into the parent `node` element
3. Add CSS depth classes similar to dashboard:
   ```css
   .rss-discover-category-node {
     /* existing */
   }
   .rss-discover-category-node-depth-0 {
     margin-left: 0;
   }
   .rss-discover-category-node-depth-1 {
     margin-left: 16px;
   }
   .rss-discover-category-node-depth-2 {
     margin-left: 32px;
   }
   /* etc. */
   ```

### Option 2: Fix Current Approach with Better CSS

Keep the separate children container but fix the positioning:

1. Make children container use flex column and full width
2. Ensure it appears BELOW the parent row, not beside it
3. Apply proper indentation

```css
.rss-discover-category-children {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-left: 16px; /* or use depth-based variable */
}
```

### Option 3: Use CSS Grid

Use grid layout to properly position children below parents:

```css
.rss-discover-category-item {
  display: grid;
  grid-template-columns: 1fr;
}

.rss-discover-category-children {
  grid-column: 1 / -1;
  padding-left: 16px;
}
```

## Recommended Fix

The best approach is **Option 1** - matching how the dashboard works:

1. Remove the separate `childrenContainer` approach
2. Render children directly into the parent node
3. Use depth-based margin-left classes (already exist in podcast-themes.css at lines 1945-1950)

This maintains consistency with the dashboard and uses existing CSS classes.

## Files Involved

- `src/views/discover-view.ts` - Main discover view (modified)
- `src/components/discover-sidebar.ts` - Sidebar component (modified as backup)
- `src/styles/discover.css` - Discover styles
- `src/styles/podcast-themes.css` - Contains depth-based classes used by dashboard

## Status

- Alphabetical sorting: ✅ Implemented
- Collapsed by default: ✅ Implemented
- Indentation: ❌ Needs fix
