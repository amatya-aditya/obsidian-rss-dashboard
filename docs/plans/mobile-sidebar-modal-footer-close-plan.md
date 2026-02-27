# Mobile Sidebar Modal + Footer Close Controls (Plan)

## Objective

Improve the mobile sidebar modal so it avoids notch/status-bar conflicts, does not take full screen width, uses larger view-switch buttons, and moves close behavior into the footer drawer next to refresh.

## Requested UX Changes

1. Remove the top-right `X` close control in the mobile sidebar modal.
2. Add top padding for notch/status-bar clearance.
3. Make `Dashboard` and `Discover` nav buttons/text larger on mobile.
4. Set mobile sidebar modal width to `95%` (instead of `100%` on small screens).
5. Add a close-sidebar button in the footer drawer, to the right of refresh, using the same icon used in dashboard sidebar toggle (`panel-left-close`).
6. Make the bottom 4-icon toolbar full width, with only a top border, and flush to the bottom edge of the screen.

## Current Implementation Findings

- Mobile sidebar modal shell and width behavior:
  - `src/modals/mobile-navigation-modal.ts`
  - `src/styles/responsive.css` (`.modal.rss-mobile-navigation-modal`)
  - Current small-screen rule (`@media (max-width: 768px)`) forces `width: 100vw`.
- Top-right close button placement:
  - `src/styles/responsive.css` (`.modal.rss-mobile-navigation-modal .modal-close-button`, top/right absolute positioning).
- Sidebar header nav buttons (`Dashboard`, `Discover`):
  - Rendered in `src/components/sidebar.ts` (`renderHeader()`).
  - Base styling in `src/styles/layout.css` (`.rss-dashboard-nav-button`).
- Footer drawer action row (currently includes refresh only for right edge):
  - Built in `src/components/sidebar.ts` (`renderFilters()`).
  - Styled in `src/styles/sidebar.css` (`.rss-dashboard-drawer-actions`, `.rss-dashboard-drawer-refresh-button`).
- Bottom 4-icon toolbar:
  - Built in `src/components/sidebar.ts` (`renderToolbar()`).
  - Styled in `src/styles/sidebar.css` (`.rss-dashboard-sidebar-toolbar` and modal overrides).

## Important Dependency / Risk

- `src/modals/import-opml-modal.ts` currently closes open mobile navigation modals by finding `.rss-mobile-navigation-modal .modal-close-button` and calling `.click()`.
- To avoid regression, we should hide the close button visually (CSS) rather than removing its DOM element, or update that OPML path in the same change set to a modal-close method that does not rely on the visible `X`.

## Proposed Implementation Plan (No Code Yet)

1. Mobile modal shell updates (`src/styles/responsive.css`)
   - Change small-screen sidebar modal width from `100vw` to `95vw`.
   - Keep left anchoring behavior.
   - Add notch-safe top spacing via `env(safe-area-inset-top)` (applied to modal content/sidebar container).
   - Hide top-right close button for `rss-mobile-navigation-modal` only.

2. Mobile nav button sizing (`src/styles/responsive.css` or `src/styles/sidebar.css`)
   - Add mobile-modal-scoped overrides for `.rss-dashboard-nav-button`:
     - Larger font size.
     - Larger tap target (height/padding).
   - Keep this scoped to `.modal.rss-mobile-navigation-modal` to avoid desktop regressions.

3. Add footer close button (`src/components/sidebar.ts`)
   - Extend `renderFilters()` to create a new close button immediately after refresh.
   - Icon: `panel-left-close`.
   - Behavior: close the mobile modal via a new optional callback dedicated to closing the active mobile sidebar modal.
   - Keep existing desktop sidebar behavior unchanged.

4. Callback wiring for modal close (`src/components/sidebar.ts`, `src/modals/mobile-navigation-modal.ts`, `src/views/dashboard-view.ts`)
   - Add optional callback contract for mobile-sidebar close action.
   - In `MobileNavigationModal`, wire callback to `this.close()`.
   - Preserve existing callbacks and auto-close-on-selection behavior.

5. Bottom toolbar geometry (`src/styles/sidebar.css`)
   - Make modal bottom toolbar span full width (`100%`), remove horizontal margins.
   - Set border to top-only on the 4-icon toolbar.
   - Remove extra bottom gap so toolbar background reaches the bottom edge.
   - Keep mobile-only scoping to avoid desktop layout changes.

6. OPML close-path safety check (`src/modals/import-opml-modal.ts`)
   - Verify close still works after hiding `X`.
   - If needed, update modal-close logic so it does not depend on visible close UI.

## Validation Checklist

1. Open sidebar on iPhone-sized viewport (`<=768px`):
   - Modal width is ~95% of screen width.
   - No visible top-right `X`.
   - Header content starts below notch/safe area.
2. `Dashboard` and `Discover` buttons appear visually larger and easier to tap.
3. Footer drawer:
   - Refresh button remains functional.
   - New close button appears to refresh button’s right and closes modal.
   - Close icon matches dashboard sidebar close icon style (`panel-left-close`).
4. Bottom 4-icon toolbar:
   - Full width.
   - Top border only.
   - Flush with bottom edge (no visual bottom gap/border).
5. Regression checks:
   - Desktop sidebar unchanged.
   - OPML import flow still closes/reloads mobile navigation safely.

## Acceptance Criteria

- Mobile sidebar no longer overlays status/battery area with an `X` control.
- Sidebar occupies ~95% width on phone breakpoints.
- `Dashboard`/`Discover` controls are clearly larger on mobile.
- Close action is available in the footer drawer next to refresh using the dashboard close icon.
- Bottom icon toolbar is full-width, top-border-only, and flush to the screen bottom.
- No regressions in desktop sidebar or OPML import workflow.
