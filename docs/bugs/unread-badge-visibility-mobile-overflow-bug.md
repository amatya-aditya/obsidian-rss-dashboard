# Bug: Unread Badge Visibility Controls Overflow at Small Mobile Widths

## Status: OPEN

## Summary

In Settings > Display, the "Unread badge visibility" controls render incorrectly on small mobile widths (observed below ~600px). The checkbox controls expand into wide purple bars and text labels overflow/clamp off the right edge, causing the row to look broken and partially off-screen.

## Environment

- Plugin branch/version: current local development branch (post unread badge alignment refactor)
- Platform: Obsidian desktop, responsive/mobile viewport simulation
- Affected breakpoints:
  - <= 768px: controls switch to vertical stack
  - <= 600px: severe visual breakage (full-width bar-like controls + clipped labels)

## Expected Behavior

- At desktop/tablet: compact, left-aligned inline checkbox row
- At mobile: vertically stacked options with consistent width and full visible labels
- Checkbox visuals should remain standard checkboxes, not toggle-like bars

## Actual Behavior

- Below ~600px, each option appears as a wide filled bar
- Labels ("All feeds", "Folders", "Feeds") are partially clipped/overflowing to the right
- The section appears to extend beyond the visible settings card area

## Repro Steps

1. Open plugin Settings > Display
2. Locate "Unread badge visibility"
3. Resize viewport below 768px (stacked mode)
4. Continue down to ~600px or less
5. Observe controls become oversized bars and labels overflow right edge

## Recent Context / Regression Notes

- Control group was moved into the Obsidian setting control column (`setting-item-control`) to fix dead-space/indentation issues.
- Mobile CSS then enforced full-width stacked rows (`align-items: stretch`, option `width: 100%`) for uniformity.
- Current behavior suggests Obsidian/theme control styles for checkboxes in `setting-item-control` are overriding custom checkbox intent at smaller breakpoints.

## Likely Root Cause

Style conflicts with Obsidian/themed checkbox/toggle rules inside `.setting-item-control` at narrow widths:

- Our custom inputs are plain `input[type="checkbox"]` rendered inside a container Obsidian expects for toggles/controls.
- Mobile rules that force full-width option rows increase exposure to those inherited styles.
- Result: checkboxes get transformed/styled like full-width toggle bars and labels overflow.

## Candidate Solutions

### Solution A (Recommended): Move custom checkbox group out of `setting-item-control`

Render the unread visibility group as a dedicated full-width sub-row under `.setting-item-info` (within the setting item), not inside Obsidian control slot.

- Pros:
  - Avoids Obsidian control-slot checkbox/toggle style collisions
  - Preserves compact custom checkbox visuals
  - Most stable across themes and narrow breakpoints
- Cons:
  - Requires carefully managing row layout so no dead-space returns

### Solution B: Keep `setting-item-control` but hard-reset checkbox appearance

Apply strongly scoped reset CSS on unread visibility checkbox inputs:

- `appearance: checkbox` / `-webkit-appearance: checkbox`
- Explicit width/height, background, border, shadow reset
- Clamp overflow and allow label wrapping/truncation safeguards
- Pros:
  - Minimal structure changes
- Cons:
  - Theme-fragile; may require ongoing maintenance across Obsidian/theme updates

### Solution C: Convert to native Obsidian control rows (3 separate settings)

Replace custom grouped checkboxes with three native `Setting` toggle rows:

- Show unread badge: All feeds
- Show unread badge: Folders
- Show unread badge: Feeds
- Pros:
  - Uses supported Obsidian UI patterns; highly robust
- Cons:
  - More vertical space; loses compact grouped UX

## Recommendation

Implement Solution A as primary fix:

1. Keep desktop/tablet compact inline row
2. Keep mobile stacked row with consistent widths
3. Remove dependency on `setting-item-control` for these custom checkboxes
4. Add narrow-screen safeguards (`max-width: 100%`, `overflow-wrap`/`min-width: 0` for labels)

## Verification Checklist

1. Desktop/tablet: inline row is compact and left-aligned
2. 768px down to 600px: stacked layout remains clean and aligned
3. <= 600px: no bar-like controls, no label clipping, no horizontal overflow
4. Test with at least one alternate Obsidian theme if available
5. Build passes: `npm run build`

## Files Involved

- `src/settings/settings-tab.ts`
- `src/styles/settings.css`

## Screenshot Reference

User-provided screenshot (current conversation) showing <=600px overflow and bar-like controls.
