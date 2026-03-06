# Bug: iPhone Sidebar Header Headroom Regression

## Summary
- Scope: Mobile sidebar modal header top-padding on iPhone and Android tablet.
- Current outcome: Android tablet spacing fix works as expected.
- Regression: iPhone still shows substantial extra headroom above header tabs (estimated ~40px), with little/no visible improvement from the previous fix.

## Initial Plan Export (2026-03-04)
The original plan is exported below verbatim.

```md
# Device-Aware Sidebar Header Top Padding (Dashboard + Discover)

## Summary
Normalize top-padding behavior for mobile sidebar modals so headers consistently clear notches/status bars without excessive empty space:
1. Reduce iPhone dashboard header top spacing.
2. Increase iPhone discover header top spacing.
3. Add reliable Android tablet status-bar clearance, especially for discover.
4. Keep desktop behavior unchanged and keep tablet/mobile logic centralized.

## Public Interfaces / Contract Changes
1. Add modal root CSS classes (new styling interface) in:
   1. [mobile-navigation-modal.ts](c:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/modals/mobile-navigation-modal.ts)
   2. [mobile-discover-filters-modal.ts](c:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/modals/mobile-discover-filters-modal.ts)
2. New classes:
   1. `rss-mobile-platform-ios`
   2. `rss-mobile-platform-android`
3. No runtime behavior/API changes for plugin commands or settings; this is styling-contract only.

## Implementation Plan
1. Add platform class assignment in both mobile modal classes.
2. In each modal `onOpen()`, after modal class assignment, detect platform via Obsidian `Platform` and apply exactly one platform class:
   1. iOS: `rss-mobile-platform-ios`
   2. Android app: `rss-mobile-platform-android`
3. Keep logic local to each modal (no shared utility extraction for this pass) to minimize scope/risk.

4. Centralize top-inset CSS variables in [modals.css](c:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/src/styles/modals.css) under the existing `@media (max-width: 1200px)` mobile-sidebar block:
   1. Add shared fallback/status inset variable for mobile sidebar modals:
      1. `--rss-mobile-statusbar-fallback-top: 24px`
      2. `--rss-mobile-statusbar-inset-top: max(env(safe-area-inset-top, 0px), var(--rss-mobile-statusbar-fallback-top))`
   2. Add balanced defaults:
      1. `--rss-dashboard-header-top-padding: calc(6px + var(--rss-mobile-statusbar-inset-top))`
      2. `--rss-discover-header-top-padding: calc(10px + var(--rss-mobile-statusbar-inset-top))`

5. Apply variables to headers in modal contexts:
   1. Dashboard modal header selector:
      1. `.modal.rss-mobile-navigation-modal .rss-dashboard-header { padding-top: var(--rss-dashboard-header-top-padding); }`
   2. Discover modal header selector:
      1. `.modal.rss-mobile-discover-filters-modal .rss-discover-header { padding-top: var(--rss-discover-header-top-padding); }`
   3. Keep existing left/right/bottom/header structure rules intact.

6. Replace the current phone-only dashboard safe-area override (`calc(10px + env(...))`) with variable-driven logic to avoid duplicate/conflicting rules.
7. Add iPhone-specific phone-tier overrides in `@media (max-width: 768px)`:
   1. `.modal.rss-mobile-navigation-modal.rss-mobile-platform-ios { --rss-dashboard-header-top-padding: calc(2px + env(safe-area-inset-top, 0px)); }`
   2. `.modal.rss-mobile-discover-filters-modal.rss-mobile-platform-ios { --rss-discover-header-top-padding: calc(8px + env(safe-area-inset-top, 0px)); }`
8. Do not add Android-specific override constants initially; Android tablets use the balanced default fallback inset (`24px`) and per-view offsets above.

9. Document the new status-bar/notch spacing rule in [design-spec.md](c:/Obsidian/Obsidian_Main/.obsidian/plugins/rss-dashboard/docs/design/design-spec.md):
   1. Add a concise rule under breakpoint behavior that modal header top spacing is status-bar aware and may be platform-scoped.
   2. Note selector ownership:
      1. Modal platform classes live on modal roots.
      2. Header top-padding tokens live in `modals.css`.

## Test Cases and Scenarios
1. iPhone (<=768) dashboard modal:
   1. Open mobile sidebar from dashboard.
   2. Confirm reduced top gap vs current behavior.
   3. Confirm tabs and toolbar remain fully visible and not clipped.
2. iPhone (<=768) discover filters modal:
   1. Open mobile filters.
   2. Confirm increased top clearance so header no longer intersects notch/status area.
3. Android tablet (e.g., 1200x2000) discover filters modal:
   1. Open discover filters modal.
   2. Confirm top nav tabs no longer collide with status bar (time/date/icons).
4. Android tablet dashboard modal:
   1. Open dashboard mobile sidebar.
   2. Confirm top spacing remains clear and visually consistent with discover (discover slightly larger allowed).
5. Desktop (>1200):
   1. Confirm no header top-padding regression.
6. Regression pass:
   1. Modal close button placement still correct.
   2. Secondary discover tabs (`Types/Categories/Tags`) remain aligned.
   3. No unintended horizontal layout shifts.

## Validation Commands
1. `npm run lint`
2. `npm run test:unit` (sanity; expected no CSS-focused assertions)

## Assumptions and Defaults
1. `Platform.isAndroidApp` reliably distinguishes Android app runtime from iOS app runtime.
2. `env(safe-area-inset-top)` is reliable on iPhone and may be `0` on Android; therefore Android fallback inset is required.
3. Balanced profile constants are fixed for this implementation:
   1. Tablet/mobile fallback inset: `24px`
   2. Default offsets: dashboard `+6px`, discover `+10px`
   3. iPhone phone override offsets: dashboard `+2px` (reduced), discover `+8px` (increased)
4. If one device still shows minor mismatch, follow-up tuning should only adjust these variables, not selector structure.
```

## Regression Update (2026-03-05)
- User validation result:
  - Android: fix worked perfectly.
  - iPhone: still large extra headroom (~40px) above the top header tabs.
  - Visual effect: little/no change between initial issue and latest fix on iPhone.

## Root-Cause Hypothesis
1. In this modal context, iPhone `env(safe-area-inset-top)` likely includes offset already compensated by the host/shell layout.
2. Adding raw `env(safe-area-inset-top)` again at header level effectively double-counts top clearance.
3. Android path is correct because fallback/top inset behavior there was the main missing piece and does not exhibit the same double-count.

## Proposed iPhone-Specific Solution
1. Keep Android/tablet rules unchanged.
2. Replace direct iPhone `+ env(safe-area-inset-top)` offsets with normalized iPhone tokens:
   - `--rss-ios-top-safe-raw: env(safe-area-inset-top, 0px);`
   - `--rss-ios-top-safe-effective: clamp(0px, calc(var(--rss-ios-top-safe-raw) - 40px), 12px);`
3. Apply normalized values to iPhone modal header paddings:
   - Dashboard: `calc(4px + var(--rss-ios-top-safe-effective))`
   - Discover: `calc(8px + var(--rss-ios-top-safe-effective))`
4. Preserve existing header selectors and Android class behavior.

## Validation Matrix
1. iPhone portrait (`<=768`)
   - Dashboard mobile sidebar: confirm reduced headroom and no notch overlap.
   - Discover mobile filters: confirm slightly larger spacing than dashboard and no notch overlap.
2. Android tablet (`769-1200`)
   - Dashboard and Discover modals: confirm current good behavior remains unchanged.
3. Desktop (`>1200`)
   - Confirm no visual change.
4. Regression checks
   - Header close button alignment.
   - Tab row alignment/click targets.
   - No horizontal shift.

## Status
Open. Android is stable; iPhone requires normalized top-inset handling to remove residual headroom.
