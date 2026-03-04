# Sidebar Padding Override Restoration Plan

Date: 2026-03-03

## Objective

Restore the missing override that neutralizes Obsidian's default 16px sidebar/modal padding in RSS Dashboard sidebar surfaces across all resolutions, while preserving the recently stabilized width-led sidebar mode contract:

- `<=1200`: modal drawer mode
- `>1200`: inline sidebar mode

## Scope

- Include: CSS-only override restoration for sidebar-related selectors and regenerated bundle output.
- Exclude: TypeScript viewport helper/sidebar-mode behavior changes unless CSS-only verification fails.

## Implementation Steps

1. Confirm cascade ownership for sidebar padding rules in `src/styles/sidebar.css`, `src/styles/modals.css`, and `src/styles/layout.css`.
2. Extend modal override coverage in `src/styles/modals.css` near existing `.modal-content` padding reset so nested sidebar container/sidebar selectors are also forced to `padding: 0`.
3. Reintroduce explicit global sidebar override in `src/styles/sidebar.css` so sidebar surfaces do not inherit Obsidian's default 16px behavior at any width.
4. Keep `src/styles/layout.css` responsive visibility rules unchanged to avoid regressing the recent split-brain sidebar fix.
5. Rebuild plugin CSS output (`styles.css`) from source.

## Progress Update (2026-03-03)

### Completed

1. Added nested sidebar override guards in `src/styles/modals.css` for drawer contexts:
	- `.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar-container`
	- `.modal.rss-mobile-navigation-modal .rss-dashboard-sidebar`
	- `.modal.rss-mobile-discover-filters-modal .rss-dashboard-sidebar-container`
	- `.modal.rss-mobile-discover-filters-modal .rss-dashboard-sidebar`
2. Restored global sidebar padding neutralization in `src/styles/sidebar.css`:
	- `.rss-dashboard-sidebar-container, .rss-dashboard-sidebar { padding: 0 !important; }`
3. Rebuilt generated output (`styles.css`) so source and bundle are aligned.

### Observed Regression After First Pass

- Desktop (`>1200`) is now correct.
- Tablet/mobile drawer paths (`<=1200`, including `<=768`) can still show residual 16px-style side gutters in some environments.

### Updated Root Cause Hypothesis

- Existing fixes neutralize `.modal-content` and nested sidebar elements, but Obsidian can still apply default spacing on the drawer modal shell and wrapper path.
- On mobile/tablet this can present as the old 16px gutter even when inner sidebar selectors are already zeroed.

## Next Fix Steps (Current)

1. Add explicit shell-level padding neutralization for drawer modals in `src/styles/modals.css`:
	- `.modal.rss-mobile-navigation-modal { padding: 0 !important; }`
	- `.modal.rss-mobile-discover-filters-modal { padding: 0 !important; }`
2. Add high-specificity wrapper guards for Obsidian modal wrapper paths:
	- `.modal-container.mod-dim .modal.rss-mobile-navigation-modal { padding: 0 !important; }`
	- `.modal-container.mod-dim .modal.rss-mobile-discover-filters-modal { padding: 0 !important; }`
3. Keep existing width-led responsive contract unchanged (`<=1200` drawer, `>1200` inline).
4. Rebuild and verify focused widths: `768`, `820`, `1024`, `1180`, `1200` with explicit left/right gutter checks.

## Implementation Delta (2026-03-03, Second Pass)

Completed from the current fix steps:

1. Added shell-level drawer neutralization:
	- `.modal.rss-mobile-navigation-modal { padding: 0 !important; }`
	- `.modal.rss-mobile-discover-filters-modal { padding: 0 !important; }`
2. Added wrapper-level Obsidian modal guards:
	- `.modal-container.mod-dim .modal.rss-mobile-navigation-modal { padding: 0 !important; }`
	- `.modal-container.mod-dim .modal.rss-mobile-discover-filters-modal { padding: 0 !important; }`
3. Rebuilt plugin output so `styles.css` now contains these guards in compiled form.

Open verification remains:

- Manual viewport/device validation in Obsidian runtime at `768`, `820`, `1024`, `1180`, `1200`.

## Files In Scope

- `src/styles/modals.css`
- `src/styles/sidebar.css`
- `styles.css` (generated)

## Verification

1. Run `npm run build`.
2. Validate the viewport matrix in Obsidian dev tools: `768`, `820`, `1024`, `1180`, `1200`, `1280`, `1366`, `1600`.
3. At each width, confirm only one sidebar surface is active (inline or modal, never both).
4. Confirm no centered/floating sidebar modal appears above `1200`.
5. Confirm mobile/tablet drawer paths do not show extra 16px Obsidian padding.
6. Confirm desktop sidebar resize handle behavior is unchanged.

## Notes For Future Iterations

- Keep the override comments near the CSS selectors that neutralize Obsidian defaults. If regressions reappear, check selector specificity and cascade order before changing breakpoint logic.
- Prefer selector-specific fixes in `modals.css` and `sidebar.css` over adding new runtime classes unless behavior cannot be corrected via CSS cascade.