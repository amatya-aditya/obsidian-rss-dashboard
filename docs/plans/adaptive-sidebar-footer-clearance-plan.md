# Adaptive Sidebar Footer Clearance Plan

Date: 2026-03-04
Status: Superseded on 2026-03-04 by top-toolbar simplification

## Superseded Note (2026-03-04)

This adaptive footer-clearance approach was intentionally retired in favor of a deterministic layout:

1. Header/nav + main buttons
2. Sidebar toolbar
3. Search dock (when expanded)
4. Feed/folder list beginning with "All Feeds"

The sidebar toolbar is now top-positioned in all dashboard sidebar surfaces, and footer/device inset compensation logic is no longer used for toolbar placement.

## Completed Work (2026-03-04)

1. Tuned shared footer token ownership in `src/styles/sidebar.css`:
   - Moved shared footer inset tokens onto `.rss-dashboard-sidebar` so sibling surfaces can consume the same contract.
   - Kept one formula in `.rss-dashboard-sidebar-toolbar` using `visual + max(safe, system, fallback)`.
2. Reduced phone visual gutter (conservative first pass):
   - Updated phone tier visual pad from `8px` to `6px` in `@media (max-width: 768px)`.
3. Improved Android tablet bottom clearance logic in `src/components/sidebar.ts`:
   - Replaced strict `safe==0 && measured==0` gating with a minimum-clearance target approach.
   - Added Android tablet touch check via `Platform.isAndroidApp` and enforced a minimum tablet clearance of `20px` when detected inset is smaller.
4. Removed hardcoded mobile nav footer bottom offset in `src/styles/modals.css`:
   - Replaced `calc(2px + env(safe-area-inset-bottom, 0px))` with shared footer inset contract variables.
5. Aligned tags mobile sheet in `src/styles/dropdown-portal.css`:
   - Replaced independent `max(8px, safe-area)` and `8px + safe-area` bottom logic with the shared contract variables (with safe defaults).
6. Build verification completed:
   - Ran `npm run build` after implementation.
   - Fixed lint feedback by using Obsidian `Platform` API for Android detection.
   - Build now passes.

## Objective

Fix footer-toolbar bottom spacing so it behaves correctly across viewport tiers:

- Phone (`<=768`): remove excess empty gutter below toolbar icons.
- Tablet (`769-1200`, especially Android tablets): increase clearance so icons do not sit too close to native bottom navigation controls.

Keep one shared inset contract, avoid per-component magic numbers, and preserve desktop behavior.

## Current Behavior (As Implemented)

1. Sidebar toolbar already uses a shared inset contract in `src/styles/sidebar.css`:
   - Tokens: `--rss-footer-visual-pad`, `--rss-footer-safe-bottom`, `--rss-footer-system-bottom`, `--rss-footer-platform-fallback-bottom`
   - Formula: `padding-bottom = visual + max(safe, measured, fallback)`
2. Runtime inset sync already exists in `src/components/sidebar.ts`:
   - `--rss-footer-system-bottom` comes from `visualViewport` delta.
   - Android tablet touch path now enforces a minimum fallback clearance target of `20px` when detected inset is smaller.
3. Tier defaults currently set visual pad to:
   - Phone: `6px`
   - Tablet: `10px`
4. Divergent bottom spacing still exists in modal/sheet CSS:
   - Mobile nav drawer now uses shared footer inset contract variables in `src/styles/modals.css`.
   - Tags mobile sheet now uses shared footer inset contract variables in `src/styles/dropdown-portal.css`.
   - Feed manager surfaces still use independent `8px/12px + safe-area` patterns and may require a follow-up normalization pass.

## Issues We Are Facing

1. Mobile feels too roomy in some states because multiple bottom spacing systems stack visually instead of sharing one contract.
2. Tablet (Android) can still be too tight near native nav UI on some devices if reported insets remain inconsistent across modal/sheet surfaces.
3. Hardcoded bottom offsets in modal/sheet files drift from sidebar contract values and reintroduce regressions after each tweak.
4. A pure resolution-height approach cannot reliably prevent overlap by itself because equal viewport heights can still have different native bottom UI footprints.

## Scope

- Include: sidebar footer-toolbar clearance logic, mobile/tablet tier tuning, Android tablet fallback behavior, and bottom-docked modal/sheet alignment.
- Exclude: toolbar icon redesign, global responsive breakpoint redesign, and unrelated desktop layout refactors.

## Proposed Solution

1. Keep one collision formula everywhere:
   - `finalBottomInset = visualPad + max(safeAreaInset, measuredViewportInset, platformFallback)`
2. Use a hybrid strategy (recommended):
   - Use real inset channels (`safe/measured/fallback`) for overlap protection.
   - Optionally use viewport height only to tune visual feel via `clamp(...)` (not as primary collision protection).
3. Conservative first-pass tuning:
   - Reduce phone visual pad slightly from current value to remove extra perceived gutter.
   - Increase tablet effective clearance primarily through fallback/system channels while keeping phone visual spacing compact.
4. Update tablet fallback gating in `src/components/sidebar.ts`:
   - Do not require an exact `0/0` condition only.
   - Allow fallback when measured/safe values are present but still too small on touch tablets.
5. Normalize modal and sheet bottom spacing to shared tokens:
   - Replace independent `2px`, `8px`, `12px` bottom formulas in `src/styles/modals.css`.
   - Align `src/styles/dropdown-portal.css` bottom anchoring with the same contract.
6. Preserve desktop (`>1200`) behavior unchanged.

## Implementation Steps

1. Baseline computed values for sidebar footer tokens on phone and tablet in dev tools.
2. Add or tune tier-specific visual pad tokens in `src/styles/sidebar.css` without changing formula structure.
3. Adjust tablet fallback logic and value in `src/components/sidebar.ts` using conservative thresholds.
4. Replace nav modal/footer hardcoded bottom offsets in `src/styles/modals.css` with shared variables.
5. Replace tags sheet hardcoded bottom logic in `src/styles/dropdown-portal.css` with shared variables.
6. Document final token roles and thresholds in this plan after implementation.

## Files In Scope

- `src/styles/sidebar.css`
- `src/components/sidebar.ts`
- `src/styles/modals.css`
- `src/styles/dropdown-portal.css`
- `src/utils/platform-utils.ts` (reference tier constants if needed)
- `docs/plans/adaptive-sidebar-footer-clearance-plan.md`

## Verification

1. Run `npm run build`.
2. Validate viewport tiers: `<=768`, `769-1200`, `>1200`.
3. Device checks:
   - iPhone portrait/landscape
   - Android phone
   - Android tablet with gesture nav
   - Android tablet with 3-button nav
4. Confirm phone toolbar has less empty space below icons than current behavior.
5. Confirm tablet toolbar has visibly more clearance from native bottom UI than current behavior.
6. Focus sidebar search input and verify keyboard transitions do not produce overlap/jumps.
7. Confirm desktop behavior unchanged.

## Manual Visual Inspection Steps

1. Open dashboard on phone width (`<=768`) and open the mobile sidebar navigation modal.
2. Inspect footer toolbar icon row and verify there is visibly less empty space between icon bottoms and screen bottom than before.
3. On the same phone viewport, rotate to landscape and confirm footer toolbar remains stable and does not overlap system UI.
4. Open Android tablet width (`769-1200`) and open the same mobile sidebar navigation modal.
5. Verify footer toolbar sits higher than native Android bottom controls (gesture bar or 3-button nav), with clear separation.
6. On Android tablet, open/close keyboard from sidebar search and verify footer inset updates without jumping/overlap.
7. Open tags mobile sheet and verify its bottom spacing matches the footer contract behavior (no obvious drift relative to sidebar footer).
8. Open feed manager modal and verify bottom action region no longer feels out-of-sync with sidebar/footer spacing on phone and tablet.
9. Resize to desktop (`>1200`) and confirm no visual regressions in sidebar/footer placement.

## Manual Test Log Template

1. Device/Viewport:
   - Result:
   - Notes:
2. Phone portrait footer spacing:
   - Result:
   - Notes:
3. Phone landscape footer spacing:
   - Result:
   - Notes:
4. Android tablet footer clearance:
   - Result:
   - Notes:
5. Android tablet keyboard transition:
   - Result:
   - Notes:
6. Tags sheet alignment:
   - Result:
   - Notes:
7. Feed manager bottom region alignment:
   - Result:
   - Notes:
8. Desktop regression check:
   - Result:
   - Notes:

## Notes For Future Iterations

- Avoid pure height-based footer sizing as the only mechanism; use height as visual tuning only.
- Keep all bottom-edge surfaces mapped to shared footer inset tokens to avoid drift.
- If regressions appear, inspect computed token values first (`visual/safe/measured/fallback`) before changing breakpoints.
