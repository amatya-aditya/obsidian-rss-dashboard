# Tablet Sidebar Responsive Breakpoint Cleanup Plan

Date: 2026-03-03

## Objective

Unify responsive behavior for tablet/mobile across sidebar and modal entry points so high-resolution tablets no longer render a centered/floating sidebar experience.

The approach is to centralize viewport classification in TypeScript, align CSS breakpoints to those tiers, and remove conflicting legacy rules so runtime class toggles and CSS are consistent.

## Steps

1. Phase 1 - Baseline and breakpoint contract.
2. Define a single viewport contract for `phone`, `tablet`, `desktop` (recommended: `<=768`, `769-1200`, `>1200`) and document intended behavior per zone (sidebar inline vs modal drawer, feed manager modal mode). This is the dependency for all subsequent edits.
3. Add or extend a shared responsive helper in `src/utils` (new or existing utility) and replace ad-hoc width checks currently using `window.innerWidth <= 1200` in modal/view code paths.
4. Phase 2 - TS behavior alignment.
5. Update modal device-mode checks in `src/modals/feed-manager-modal.ts` and `src/modals/import-opml-modal.ts` to use the shared helper instead of local `isMobileWidth()` copies.
6. Update sidebar-opening logic in `src/views/dashboard-view.ts` and `src/views/discover-view.ts` to use the same helper for deciding inline sidebar vs `MobileNavigationModal` flow.
7. Validate `src/modals/mobile-navigation-modal.ts` width behavior under the new `tablet` classification so it remains left-anchored and does not inherit centered modal behavior.
8. Phase 3 - CSS breakpoint normalization.
9. In `src/styles/layout.css`, keep inline sidebar only for desktop tier and explicitly hide sidebar/resize handle for tablet and phone tiers to prevent hybrid layouts on high-res tablets.
10. In `src/styles/modals.css`, consolidate duplicate or overlapping rules for `.rss-dashboard-modal-container` and `.modal.rss-mobile-feed-manager-modal` so tablet styles are not overridden by earlier fixed-width centered rules.
11. Normalize tablet modal container rules to avoid centered floating appearance by ensuring class-specific tablet selectors (with `.modal` prefix where needed) have definitive precedence.
12. Phase 4 - Regression guardrails and docs.
13. Add brief in-file comments near shared breakpoint helper and the main responsive CSS block to document why desktop/tablet boundaries are split.
14. Update a related docs note in `docs/archive` or `docs/plans` with the final breakpoint contract and touched files for future maintenance context.

## Relevant Files

- `src/styles/layout.css`: desktop vs tablet sidebar visibility and resize-handle visibility.
- `src/styles/modals.css`: duplicate modal container rules, tablet/mobile modal selectors, specificity ordering.
- `src/modals/feed-manager-modal.ts`: replace local `isMobileWidth()` usage with shared viewport helper.
- `src/modals/import-opml-modal.ts`: align modal mode switch to shared helper.
- `src/views/dashboard-view.ts`: sidebar/modal opening decision logic around `<=1200` checks.
- `src/views/discover-view.ts`: mobile layout switching and sidebar trigger logic.
- `src/modals/mobile-navigation-modal.ts`: verify left-drawer width constraints under new tablet classification.
- `src/components/article-list.ts`: reconcile sidebar-trigger breakpoint assumptions used by header controls.
- `src/utils/`: shared viewport helper location (new or existing utility file).

## Verification

1. Run `npm run lint`.
2. Run `npm run build`.
3. Manual viewport matrix in Obsidian dev tools: `768`, `820`, `1024`, `1180`, `1200`, `1280`, `1366`, `1600`.
4. For each width, verify inline sidebar presence/absence, hamburger visibility, mobile navigation modal left anchoring, feed-manager/import modal placement, and no centered floating sidebar state.
5. Regression check on desktop (`>1200`) that sidebar resize handle still works and saved sidebar width persists.

## Decisions

- Scope: broader breakpoint cleanup, not a CSS-only hotfix.
- Include: sidebar and modal behavior consistency for dashboard/discover workflows.
- Exclude: unrelated article/card typography/layout tuning unless directly required by breakpoint contract.
- Keep `1200` as the tablet/desktop boundary for now to minimize behavior churn, while introducing a lower `phone` threshold for mobile-only bottom-sheet rules.

## Further Considerations

1. Consider moving shared breakpoints to CSS custom properties or a single constants module consumed by both TS and style docs to reduce future drift.
2. If high-resolution tablets still identify as desktop in edge cases, add a secondary heuristic (touch-capable + width band) in the shared helper behind a clearly named option.
3. Add a lightweight QA checklist doc under `docs/plans/` for responsive regression testing before releases.

## Progress Update (2026-03-03)

- Completed: Added shared responsive helpers in `src/utils/platform-utils.ts` and migrated key modal/view call sites away from duplicated local `isMobileWidth()` helpers.
- Completed: Updated dashboard/discover sidebar toggle and resize gating to use shared viewport helpers.
- Completed: Added responsive overrides and updated generated bundle output (`styles.css`) via build.
- Completed: Plan export and documentation handoff in `docs/plans/`.
- Observed regression: Above `1200px`, sidebar can become dislodged from the left edge on some environments.
- Observed regression: Discover can show duplicate sidebar behavior (left sidebar plus centered modal-style panel) under certain tablet/desktop-touch conditions.
- Root cause identified: Touch-tablet pathway (`isTouchTabletViewport` + `.rss-touch-tablet-layout`) is too broad and can force mixed inline+modal behavior on wide viewports.

## Next Actions

1. Remove touch-tablet layout forcing path from TS and CSS:

- Remove `applyResponsiveContainerClasses` usage/method from `src/views/dashboard-view.ts`.
- Remove `applyResponsiveContainerClasses` usage/method from `src/views/discover-view.ts`.
- Remove `.rss-touch-tablet-layout` CSS overrides from `src/styles/layout.css` and `src/styles/discover.css`.

2. **[CRITICAL — missing from original plan]** Simplify `isTabletViewport()` in `src/utils/platform-utils.ts` to width-only:

- Remove the `|| isTouchTabletViewport(width)` OR branch from `isTabletViewport()`.
- Remove the `isTouchTabletViewport()` export and `TOUCH_TABLET_MAX_WIDTH` constant (dead code once step 1 is complete).
- Remove `hasTouchInput()` export (only ever called by `isTouchTabletViewport`).
- Without this step, `shouldUseMobileSidebarLayout()` still returns `true` for the 1200–1366px touch range while no CSS rule hides the inline sidebar anymore — reproducing the exact split-brain duplicate-sidebar regression the plan aims to fix.

3. Narrow header compact-mode logic to width-only checks:

- Update `src/components/article-list.ts` ResizeObserver condition to `width <= TABLET_LAYOUT_MAX_WIDTH`.
- Update `src/views/discover-view.ts` ResizeObserver condition to `width <= TABLET_LAYOUT_MAX_WIDTH`.

4. Keep modal mobile classes guarded by stable runtime checks:

- Ensure `src/modals/feed-manager-modal.ts` and `src/modals/import-opml-modal.ts` use `Platform.isMobile || shouldUseMobileSidebarLayout()` where mobile class application is required.

5. Rebuild and verify:

- Run `npm run build` to regenerate `styles.css` from source updates.
- Re-run viewport matrix (`768`, `820`, `1024`, `1180`, `1200`, `1280`, `1366`, `1600`) and validate single-sidebar behavior in dashboard and discover.

## Current Status

- Phase 1: Complete.
- Phase 2: In progress (helper migration complete; regression cleanup pending).
- Phase 3: In progress (CSS normalization partially complete; touch-tablet rollback pending).
- Phase 4: In progress (documentation updated; final post-fix verification pending).

## Proposal Update (2026-03-03)

- New root cause refinement: Discover duplication above `1200px` can occur even with width-only viewport helpers when the content pane (not viewport) becomes `<=1200` due to inline sidebar width.
- Mechanism: `renderContent()` applies `.is-narrow` from `ResizeObserver` content width and surfaces mobile header controls; clicking that control opens `MobileDiscoverFiltersModal`, which uses centered modal defaults outside mobile media rules, producing the floating duplicate panel.
- Scope adjustment: keep `.is-narrow` for compact control density only, but gate mobile sidebar entry points strictly by viewport tier (`Platform.isMobile || shouldUseMobileSidebarLayout(window.innerWidth)`).

### Proposed Fix

1. Add a Discover helper for mobile sidebar mode and reuse it for both rendering and click-path guardrails.
2. In `src/views/discover-view.ts`, render `renderMobileHeader()` only when the viewport tier is phone/tablet.
3. In `src/views/discover-view.ts`, make `openMobileSidebar()` a no-op when viewport tier is desktop (`>1200`).
4. Keep existing `.is-narrow` behavior for compact dropdown controls so narrow desktop panes still get compact toolbar layout without modal sidebar behavior.
5. Rebuild and verify matrix to confirm no duplicate sidebar appears on `1280`/`1366` desktop widths.

### Verification Delta

- Desktop widths (`1280`, `1366`, `1600`): Discover no longer exposes mobile sidebar modal path; only inline left sidebar remains.
- Tablet/phone widths (`<=1200`): Discover mobile sidebar modal remains available and functional.

## Regression Update (2026-03-03, Late)

### What Was Fixed Since The Previous Update

- Discover duplicate sidebar/modal regression was addressed by tightening runtime guardrails in `src/views/discover-view.ts`:
	- Discover modal entry now uses viewport-aware gating and prevents duplicate modal instances.
	- Discover modal lifecycle now closes stale modal state on desktop mode transitions.
- Discover modal docking behavior was corrected in `src/styles/modals.css`:
	- `.modal.rss-mobile-discover-filters-modal` now follows the same left-docked drawer geometry as `.modal.rss-mobile-navigation-modal` for `<=1200`.
	- Discover is no longer styled as a centered/bottom-sheet modal in the tablet drawer path.

### Current Unwanted Behavior (Newly Reintroduced)

- Dashboard regressed again: above `1200px`, the inline left sidebar is visible while a second sidebar appears as a centered modal.
- Symptom profile matches split-brain sidebar mode:
	- Inline desktop sidebar remains mounted/visible.
	- Mobile navigation modal path is still being opened in some environments.
	- Because drawer CSS is scoped to `@media (max-width: 1200px)`, any modal opened above `1200px` falls back to centered modal positioning.

### Most Relevant Current Evidence

- `src/views/dashboard-view.ts:1278` and `src/views/dashboard-view.ts:1729` still use:
	- `Platform.isMobile || shouldUseMobileSidebarLayout()`
- `src/views/dashboard-view.ts:1238` opens a new `MobileNavigationModal` without desktop-transition cleanup.
- `src/styles/layout.css` hides inline sidebar only at `<=1200`, so above `1200` desktop inline sidebar remains visible.
- `src/styles/modals.css` applies drawer geometry only at `<=1200`; above `1200` a modal can render centered if opened.

### Updated Root-Cause Hypothesis

1. Dashboard still has mixed device+width gating (`Platform.isMobile || ...`) while discover was moved to width-led mode.
2. On specific platform/device combinations, dashboard can enter mobile modal path even when viewport is desktop (`>1200`).
3. No breakpoint-transition modal cleanup exists in dashboard, so once modal state is entered it can persist until manual close.

## New Proposition: Dashboard Split-Brain Elimination

### Goal

Guarantee a single sidebar mode at all times for dashboard:
- `<=1200`: modal drawer mode only
- `>1200`: inline sidebar only

### Proposed Fix Steps

1. Add a dashboard-local `shouldUseMobileSidebarMode(viewportWidth?: number)` helper in `src/views/dashboard-view.ts` that uses width-only tiering (`shouldUseMobileSidebarLayout(viewportWidth)`) for sidebar mode.
2. Replace dashboard sidebar-mode checks to use that helper consistently:
	- `handleToggleSidebar()`
	- `setupSidebarResize()`
	- any other sidebar modal entry points in dashboard view.
3. Add dashboard modal instance tracking (same pattern used in discover):
	- keep a single `MobileNavigationModal` instance
	- prevent duplicate opens
	- clear reference on modal close.
4. Add viewport breakpoint transition handling in dashboard:
	- register `window` resize listener
	- when crossing to desktop mode (`>1200`), force-close mobile sidebar modal
	- rerender/refresh sidebar controls as needed.
5. Optional defensive CSS guard (safety net):
	- add a desktop-only rule (`@media (min-width: 1201px)`) to suppress mobile sidebar modal classes if they are opened accidentally.

### Files In Scope For The New Fix

- `src/views/dashboard-view.ts`
- `src/styles/modals.css` (optional defensive guard)
- `styles.css` (generated output after build)

### Verification Matrix (Reset)

1. Run `npm run lint`.
2. Run `npm run build`.
3. Validate dashboard + discover at: `768`, `820`, `1024`, `1180`, `1200`, `1280`, `1366`, `1600`.
4. For each width:
	- exactly one sidebar surface is visible (inline OR modal, never both)
	- no centered sidebar modal at desktop widths
	- drawer behavior remains left-docked on tablet/phone tiers.

## Final Resolution (2026-03-03)

### Implemented Fixes

1. Discover split-brain and docking fixes were finalized:
	- `src/views/discover-view.ts` now uses width-led sidebar mode gating, modal instance tracking, and desktop-transition modal cleanup.
	- `src/styles/modals.css` now docks `.modal.rss-mobile-discover-filters-modal` to the left drawer path for `<=1200` instead of center/bottom-sheet placement.
2. Dashboard split-brain regression was resolved:
	- `src/views/dashboard-view.ts` now includes width-led sidebar mode helper usage for sidebar decisions.
	- Added single `MobileNavigationModal` instance tracking to prevent duplicate modal overlays.
	- Added viewport breakpoint transition handling to close mobile sidebar modal when crossing into desktop mode (`>1200`) and rerender.
	- Added render-time stale-modal cleanup to guarantee only one sidebar mode is visible.

### Final Behavior Contract

- `<=1200`: sidebar opens as left-docked modal drawer.
- `>1200`: sidebar is inline only; no mobile sidebar modal remains visible.
- At all widths: never show both inline sidebar and modal sidebar simultaneously.

### Status

- Phase 1: Complete.
- Phase 2: Complete.
- Phase 3: Complete.
- Phase 4: Complete.
- Regression state: Resolved in source; final validation tracked by lint/build/unit-test checks and viewport matrix.
