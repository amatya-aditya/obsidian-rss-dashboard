# Card Grid Spacing + Display Controls Plan

## Objective

Add a configurable card-grid spacing setting that appears in both:

1. The dashboard hamburger menu (next to Cards/row controls in card view)
2. The formal Settings -> Display tab

Also add `Cards per row` to the Display tab so both controls are available in the formal settings area.

## Scope

Included:

- Card-view grid spacing between cards only
- Shared persisted settings used by both hamburger controls and Display tab controls
- Immediate re-render when controls change

Excluded:

- Internal card padding/content spacing changes
- Per-breakpoint spacing values

## Defaults and Ranges

- `cardSpacing` default: `15` (matches current visual default)
- `cardSpacing` range: `0..40` px
- `cardColumnsPerRow` range: `0..6`
- `cardColumnsPerRow = 0`: Auto

## Current Issues (March 2026)

1. List-view layout regression (overlap/collision)

- In list mode, title/date/source/actions can overlap.
- Cause: state classes controlling list-grid row allocation were removed from `renderListView` in `src/components/article-list.ts`.
- Impact: list cards are hard to read and actions appear visually stacked.

2. Hamburger spacing control UX mismatch

- The hamburger menu currently exposes card spacing as a number input.
- Requested behavior is a true slider control, consistent with settings UX.
- Impact: poorer discoverability and rougher adjustment flow on desktop/mobile.

3. Card spacing appears non-functional

- Changing spacing (for example to `1`) shows no visible card-gap change.
- Cause: responsive media-query `gap` values in `src/styles/card-view.css` override the runtime spacing variable at many breakpoints.
- Impact: feature appears broken even though value persistence is working.

## Proposed Fix Plan

1. Stabilize list-view layout (highest priority)

- Restore list-grid state class assignment in `src/components/article-list.ts`:
- Re-add `rss-dashboard-list-has-source` when source row is present.
- Re-add `rss-dashboard-list-has-actions` when inline toolbar/actions row is present.
- Restore feed/source title tooltip attribute removed during refactor.

2. Convert hamburger card spacing input to slider

- Replace the dropdown `type="number"` control with slider UI (`type="range"`, `0..40`, step `1`) in `src/components/article-list.ts`.
- Keep shared persistence path (`settings.display.cardSpacing` + `persistSettings()` + `render()`).
- Keep clamp/fallback normalization through `getCardSpacing()`.

3. Make runtime spacing effective at all breakpoints

- Update every `.rss-dashboard-card-view` media-query `gap` rule in `src/styles/card-view.css` to use variable-backed fallback:
- `gap: var(--rss-dashboard-card-gap, <existing-breakpoint-default>px)`.
- Preserve current responsive defaults as fallback values while allowing runtime override.

4. Keep settings parity and consistency

- Ensure hamburger slider and Display tab controls both write/read the same setting fields:
- `display.cardSpacing`
- `display.cardColumnsPerRow`

5. Rebuild compiled styles and validate

- Run `npm run build` so `styles.css` reflects updated responsive gap logic.
- Confirm lint/typecheck/build pass.

## Validation Checklist

1. List mode visual check

- Verify no overlap among title/date/source/actions in desktop and mobile list variants.

2. Hamburger control check

- Verify card spacing control is a slider (not numeric-only input).
- Verify slider updates value smoothly and re-renders immediately.

3. Card spacing efficacy check

- In card view, set spacing to `1`, `15`, and `40`.
- Confirm visible gap changes at multiple viewport widths (large, medium, small).

4. Parity and persistence check

- Change spacing in Display tab, then open hamburger and confirm same value.
- Reload plugin/dashboard and confirm values persist.

5. Regression guard

- Confirm cards-per-row behavior still works (auto and fixed values).
- Confirm no regressions in sidebar spacing settings.

## Files

- `src/types/types.ts`
- `src/components/article-list.ts`
- `src/settings/settings-tab.ts`
- `src/styles/card-view.css`
- `src/styles/controls.css` (slider styling as needed)
- `styles.css` (compiled output from build)

## Notes for Future Maintenance

- Keep both control surfaces (hamburger and Display tab) wired to the same `display` fields to avoid drift.
- Prefer using helper normalization methods (`getCardColumnsPerRow()`, `getCardSpacing()`) at render time to enforce bounds consistently.
- If future UX adds presets, store preset values in the same numeric setting to remain backward compatible.
- Avoid removing list-view state classes without updating corresponding grid-template CSS contracts.
