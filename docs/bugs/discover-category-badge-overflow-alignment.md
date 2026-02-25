# Bug Report: Discover Category Badge Overflow + Misalignment

## Summary

In the Discover sidebar category tree, count badges (`.rss-discover-category-count`) are not staying in a stable right-aligned column.

- Some nested badges overflow/clipped into the right divider area.
- Some nested badges drift left toward the center as depth increases.

This issue existed before the resizable sidebar work, but became more visible after adding the resize handle.

## Affected Area

- `src/views/discover-view.ts` (category tree rendering)
- `src/styles/discover.css` (category row/layout/children styles)

## Current Reproduction

1. Open Discover view.
2. Go to `Categories`.
3. Expand multiple levels (example: Domain -> Subdomain -> Area -> Topic).
4. Observe badge placement at deeper levels.

## Expected Behavior

- All count badges should line up in a consistent right column.
- No badge should overflow or clip into the sidebar divider/resize area.
- Depth should affect only the left-side tree content (chevron/checkbox/label), not badge column alignment.

## Actual Behavior

- Deep nodes push badge positioning inconsistently.
- Badge alignment changes per depth.
- In some nested paths badges still clip near the right boundary.

## Attempted Fixes (Already Tried)

### Attempt 1: Width/box-model hardening on row + label truncation

Updated `src/styles/discover.css`:

- `.rss-discover-category-row`: `width: 100%`, `box-sizing: border-box`, `min-width: 0`
- `.rss-discover-category-row label`: truncation and `min-width: 0`
- `.rss-discover-category-count`: `margin-left: auto`, `flex-shrink: 0`

Result:
- Helped some cases.
- Did not fully eliminate overflow at deeper nesting.

### Attempt 2: Depth-based badge right offset

Updated `.rss-discover-category-count`:

- `margin-right: calc((var(--depth) * 20px) + 6px);`

Result:
- Fixed overflow in several cases.
- Introduced a new bug: badges staircase left per depth and no longer align in one column.

### Attempt 3: Revert depth-based offset + fixed right gutter on row

Updated `.rss-discover-category-row`:

- `padding: 4px 12px 4px 0;` (constant right gutter)
- Removed depth-based `margin-right` from badge.

Result:
- Removed staircase effect.
- Overflow/clipping still reproducible in nested branches.
- Alignment still inconsistent in some trees.

## Why These Attempts Keep Failing

Current layout uses compensating offsets on the same flex row where depth indentation is also applied. This couples badge placement to tree indentation behavior.

In short: we are "counteracting" depth with spacing tweaks instead of isolating the badge into a dedicated right column.

## Recommended Next Fix (Preferred)

### 1) Split row into two layout zones (structural fix)

In `discover-view.ts`, render each category row as:

- Left zone: chevron + checkbox + label (depth-indented)
- Right zone: badge (fixed column)

Proposed markup shape:

```html
<div class="rss-discover-category-row">
  <div class="rss-discover-category-main">...</div>
  <div class="rss-discover-category-count">N</div>
</div>
```

### 2) Use grid for row alignment

In `discover.css`:

- `.rss-discover-category-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; }`
- `.rss-discover-category-main { padding-left: calc(var(--depth) * 16px); min-width: 0; }`
- `.rss-discover-category-count { justify-self: end; margin-right: 8px; }`

This guarantees a stable badge column regardless of depth.

### 3) Keep indentation source singular

Avoid cumulative visual drift from both:

- `row` depth indentation and
- children container `margin-left` + `padding-left`

Recommendation: keep one primary indentation mechanism for layout, and keep the tree guide line purely visual (border/pseudo-element) so it does not consume layout width.

### 4) Add a right safety gutter to sidebar content

Small constant spacing near the right boundary reduces collision risk with divider/resize affordance.

## Validation Plan (After Fix)

1. Test expanded trees at depth 0-4.
2. Test narrow and wide sidebar widths with resizer.
3. Verify all badges stay in one vertical column.
4. Verify no clipping near right divider.
5. Verify mobile/tablet modal layout unaffected.

## Status

- Issue remains unresolved.
- Next step should be a structural row-layout change, not additional offset tweaking.
