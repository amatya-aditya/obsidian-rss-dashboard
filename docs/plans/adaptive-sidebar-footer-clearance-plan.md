# Adaptive Sidebar Footer Clearance Plan

Date: 2026-03-03

## Objective

Resolve the mobile footer-toolbar spacing tension by splitting bottom spacing into two independent concerns:

- visual spacing (how high the toolbar appears above the bottom edge)
- system clearance (how much space is needed to avoid iPhone home indicator and Android tablet navigation UI)

Use a shared inset contract so iPhone can stay visually tight while Android tablets still get enough clearance when safe-area values are incomplete.

## Scope

- Include: sidebar footer-toolbar bottom inset contract, mobile/tablet viewport-tier behavior, and Android-tablet fallback path.
- Exclude: broad redesign of sidebar toolbar layout/icons, unrelated modal width redesign, and desktop-only styling changes.

## Implementation Steps

1. Baseline current bottom-spacing behavior in sidebar toolbar, mobile sheets, and feed manager modal to identify all hardcoded inset values.
2. Introduce shared CSS custom properties for footer clearance in `src/styles/sidebar.css`:
   - `--rss-footer-visual-pad`
   - `--rss-footer-safe-bottom`
   - `--rss-footer-system-bottom`
   - `--rss-footer-platform-fallback-bottom`
3. Compute final bottom inset via one formula (`visual + max(safe, measured, fallback)`) so spacing logic is centralized and inspectable.
4. Add a lightweight runtime updater (mobile/tablet only) that writes `--rss-footer-system-bottom` from `visualViewport` deltas.
5. Add Android-tablet fallback when measured and safe-area insets are both zero but tablet/touch conditions are true.
6. Normalize related mobile bottom offsets in `src/styles/modals.css` and `src/styles/dropdown-portal.css` so bottom-docked surfaces do not diverge from the same contract.
7. Keep desktop behavior unchanged (`>1200`) and document the contract for future contributors.

## Files In Scope

- `src/styles/sidebar.css`
- `src/components/sidebar.ts`
- `src/utils/platform-utils.ts`
- `src/styles/modals.css`
- `src/styles/dropdown-portal.css`
- `docs/plans/adaptive-sidebar-footer-clearance-plan.md`

## Verification

1. Run `npm run build`.
2. Validate viewport tiers: `<=768`, `769-1200`, `>1200`.
3. Device checks:
   - iPhone portrait and landscape
   - Android phone
   - Android tablet (gesture navigation and 3-button navigation)
4. Confirm toolbar remains close to bottom on iPhone while staying clear of Android tablet system menus.
5. Focus sidebar search input and verify keyboard transitions do not cause footer overlap or excessive jumping.
6. Confirm desktop sidebar spacing and resize behavior are unchanged.

## Notes For Future Iterations

- Prefer CSS-first behavior; use runtime viewport measurement only to cover environments where `safe-area-inset-bottom` under-reports.
- Avoid reintroducing hardcoded bottom offsets (`8px`, `20px`, etc.) in isolated components without mapping them to the shared inset variables.
- If regressions appear, inspect variable values in dev tools before adjusting breakpoints or adding per-platform special cases.
