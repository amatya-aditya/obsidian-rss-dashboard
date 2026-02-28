# Mobile Sidebar Modal + Footer Close Controls (Plan)

## Objective

Improve the mobile sidebar modal so it avoids notch/status-bar conflicts, does not take full screen width, uses larger view-switch buttons, and moves close behavior into the footer drawer next to refresh.

---

## Implementation Todo List

### Phase 1: Core Changes (Required)

- [ ] **1. Update mobile modal width** (`src/styles/responsive.css`)
  - Change `@media (max-width: 768px)` rule to use `95vw` instead of `100vw`
  - Add `border-radius: 0 !important` override for small screens
  - Keep left edge anchored

- [ ] **2. Hide top-right close button** (`src/styles/responsive.css`)
  - Add CSS rule to hide `.modal.rss-mobile-navigation-modal .modal-close-button`
  - Use `display: none` or `visibility: hidden` (not removal from DOM)

- [ ] **3. Add notch safe-area padding** (`src/styles/responsive.css`)
  - Add `padding-top: env(safe-area-inset-top)` to sidebar header in mobile modal
  - Add `padding-bottom: env(safe-area-inset-bottom)` to bottom toolbar

- [ ] **4. Enlarge nav buttons on mobile** (`src/styles/responsive.css`)
  - Add mobile-specific overrides for `.rss-dashboard-nav-button`
  - Increase font size and tap target height

- [ ] **5. Add close button to footer drawer** (`src/components/sidebar.ts`)
  - Extend `renderFilters()` method
  - Add close button with `panel-left-close` icon after refresh button
  - Wire to new optional callback

- [ ] **6. Add mobile close callback** (`src/components/sidebar.ts`, `src/modals/mobile-navigation-modal.ts`)
  - Add `onCloseMobileSidebar?: () => void` to `SidebarCallbacks` interface
  - Wire callback in `MobileNavigationModal.onOpen()` to call `this.close()`

- [ ] **7. Update bottom toolbar geometry** (`src/styles/sidebar.css`)
  - Make toolbar full width (100%)
  - Remove horizontal margins
  - Use top border only
  - Remove bottom gap

- [ ] **8. OPML regression test** (`src/modals/import-opml-modal.ts`)
  - Verify modal close still works after hiding X button
  - Update close logic if needed

---

### Phase 2: Enhanced Mobile Experience (Recommended)

- [ ] **9. Touch target optimization** (`src/styles/responsive.css`)
  - Add 44px minimum height to `.rss-dashboard-feed` on mobile
  - Add 44px minimum height to `.rss-dashboard-feed-folder-header` on mobile

- [ ] **10. Scroll momentum** (`src/styles/responsive.css`)
  - Add `-webkit-overflow-scrolling: touch` to scroll containers

- [ ] **11. Landscape mode handling** (`src/styles/responsive.css`)
  - Add `@media (max-height: 500px)` checks
  - Adjust sidebar height for landscape tablets

---

## Requested UX Changes (Reference)

1. Remove the top-right `X` close control in the mobile sidebar modal.
2. Add top padding for notch/status-bar clearance.
3. Make `Dashboard` and `Discover` nav buttons/text larger on mobile.
4. Set mobile sidebar modal width to `95%` (instead of `100%` on small screens).
5. Add a close-sidebar button in the footer drawer, to the right of refresh, using the same icon used in dashboard sidebar toggle (`panel-left-close`).
6. Make the bottom 4-icon toolbar full width, with only a top border, and flush to the bottom edge of the screen.

---

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

---

## Important Dependency / Risk

- `src/modals/import-opml-modal.ts` currently closes open mobile navigation modals by finding `.rss-mobile-navigation-modal .modal-close-button` and calling `.click()`.
- To avoid regression, we should hide the close button visually (CSS) rather than removing its DOM element, or update that OPML path in the same change set to a modal-close method that does not rely on the visible `X`.

---

## Validation Checklist

1. Open sidebar on iPhone-sized viewport (`<=768px`):
   - [ ] Modal width is ~95% of screen width.
   - [ ] No visible top-right `X`.
   - [ ] Header content starts below notch/safe area.
2. `Dashboard` and `Discover` buttons appear visually larger and easier to tap.
3. Footer drawer:
   - [ ] Refresh button remains functional.
   - [ ] New close button appears to refresh button's right and closes modal.
   - [ ] Close icon matches dashboard sidebar close icon style (`panel-left-close`).
4. Bottom 4-icon toolbar:
   - [ ] Full width.
   - [ ] Top border only.
   - [ ] Flush with bottom edge (no visual bottom gap/border).
5. Regression checks:
   - [ ] Desktop sidebar unchanged.
   - [ ] OPML import flow still closes/reloads mobile navigation safely.

---

## Acceptance Criteria

- [ ] Mobile sidebar no longer overlays status/battery area with an `X` control.
- [ ] Sidebar occupies ~95% width on phone breakpoints.
- [ ] `Dashboard`/`Discover` controls are clearly larger on mobile.
- [ ] Close action is available in the footer drawer next to refresh using the dashboard close icon.
- [ ] Bottom icon toolbar is full-width, top-border-only, and flush to the screen bottom.
- [ ] No regressions in desktop sidebar or OPML import workflow.
