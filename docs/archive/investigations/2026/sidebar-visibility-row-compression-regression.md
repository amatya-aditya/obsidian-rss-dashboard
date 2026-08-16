# Bug Report: Sidebar Visibility + Folder Row Compression Regression

## Summary
The dashboard sidebar has two concurrent regressions observed on March 4, 2026:

1. Sidebar entry/access can fail (or feel inconsistent) depending on viewport/state.
2. Folder/feed rows can appear visually "squished" (compressed spacing), especially when spacing settings are low.

This appears to be a multi-factor issue caused by CSS/state coupling and recent sidebar layout refactors.

## Affected Area
- Sidebar render/state wiring
  - `src/views/dashboard-view.ts`
  - `src/components/sidebar.ts`
- Sidebar/mobile visibility CSS
  - `src/styles/layout.css`
  - `src/styles/controls.css`
  - `src/styles/modals.css`
- Sidebar row spacing controls
  - `src/settings/settings-tab.ts`
  - `src/components/sidebar.ts`
  - `src/styles/sidebar.css`

## User-Visible Symptoms
1. Sidebar does not appear/activate reliably across viewport scenarios.
2. Sidebar folders/feeds look compressed with reduced vertical breathing room.

## Expected Behavior
- Desktop (`>1200px`): inline sidebar appears when not collapsed and toggles reliably.
- Tablet/phone (`<=1200px`): mobile sidebar modal opens reliably from header controls.
- Folder/feed rows maintain readable vertical spacing by default and cannot collapse into near-zero height accidentally.

## Actual Behavior (Current Implementation)
- Visibility is controlled by multiple overlapping mechanisms:
  - Runtime class state (`.sidebar-collapsed` in `dashboard-view.ts`)
  - Breakpoint rule hiding inline sidebar at `<=1200px` in `layout.css`
  - Additional mobile control-hiding rule in `controls.css`
- Row spacing permits a value of `0`, which makes rows appear tightly compressed.

## Investigation Findings

### Finding 1 (High confidence): Stale mobile control-hiding rule can block sidebar entry flow
In `src/styles/controls.css` (mobile block), this rule exists:

- `:not(.sidebar-collapsed) .rss-dashboard-container .rss-dashboard-mobile-filter-button, ... .rss-dashboard-hamburger-menu { display: none !important; }`

This assumes "sidebar open on mobile" maps to `!sidebar-collapsed`. But at `<=1200px` the inline sidebar is forcibly hidden by `layout.css` and mobile uses modal navigation. This class-based hide logic is now semantically stale and can hide important entry controls in certain state combinations.

### Finding 2 (High confidence): Sidebar row spacing allows zero-height style compression
`src/settings/settings-tab.ts` allows:
- `sidebarRowSpacing` min = `0`, max = `44`

`src/components/sidebar.ts` applies spacing directly as:
- `--sidebar-row-spacing: ${value}px`

`src/styles/sidebar.css` uses:
- `padding-top/bottom: calc(var(--sidebar-row-spacing) / 2)`

So `0` yields almost no row padding, matching the "squished together" symptom.

### Finding 3 (Medium confidence): Recent refactor increased state/CSS drift risk
Commit `2e444b5` (March 4, 2026) changed sidebar structure:
- Toolbar moved to top flow (`order` changes in `sidebar.css`)
- Adaptive footer inset logic removed from `sidebar.ts`
- Sidebar render order changed (`renderToolbar`, `renderSearchDock`, `renderFeedFolders`)

These changes are valid in isolation but increased coupling between:
- `order`-based layout in CSS
- runtime render order
- mobile/desktop behavior assumptions.

This drift increases regression likelihood when other rules still target older behavior.

### Finding 4 (Medium confidence): Sidebar state model is split across viewport modes
`dashboard-view.ts` uses a single persisted flag `settings.sidebarCollapsed` for all modes.
- Desktop uses inline sidebar collapse/expand.
- Mobile/tablet uses modal sidebar flow.

This can create confusing transitions when switching widths/devices because one persisted flag is interpreted differently across two UI paradigms.

## Likely Root Causes
1. Outdated class-based control hiding in mobile CSS that conflicts with modal-based sidebar behavior.
2. Lack of safe minimum clamping for sidebar row spacing in both settings and runtime.
3. Mode/state coupling (single collapse flag across desktop inline + mobile modal behaviors).

## Reproduction Paths

### Path A: Control visibility inconsistency (mobile)
1. Open dashboard at phone width (`<=768px`).
2. Ensure `sidebarCollapsed` is false (can happen from previous desktop state).
3. Observe header control visibility behavior (filter/hamburger/toggle), then attempt to open sidebar modal.
4. In failing states, expected entry controls can be hidden/inconsistent.

### Path B: Squished sidebar rows
1. In Settings -> Display, set Sidebar row spacing to `0`.
2. Return to dashboard sidebar.
3. Folder/feed rows appear tightly packed and visually compressed.

### Path C: Cross-mode state drift
1. Toggle sidebar state on desktop.
2. Resize to tablet/phone widths.
3. Attempt to open sidebar via mobile flow.
4. Behavior can feel inconsistent due to shared persisted collapse flag across two paradigms.

## Resolution Plan

### Phase 1: Stabilize entry points (highest priority)
1. Remove or rewrite stale mobile control-hiding rule in `src/styles/controls.css`:
   - Remove `:not(.sidebar-collapsed) ... mobile-filter-button/hamburger-menu { display: none }` for mobile mode.
   - Prefer explicit viewport/mode selectors tied to modal behavior.
2. Verify at widths: `<=768`, `769-1200`, `>1200`.

### Phase 2: Prevent compressed rows by construction
1. Raise `sidebarRowSpacing` minimum from `0` to a safer baseline (recommended `6` or `8`).
2. Add runtime clamp in `src/components/sidebar.ts` before setting CSS variable.
3. Keep existing default (`10`) unless product decision changes.

### Phase 3: De-risk state model
1. Separate desktop inline collapse state from mobile modal state (or explicitly ignore collapse flag in mobile mode).
2. In mobile mode, always keep entry control visible and treat sidebar as modal-only interaction.
3. Document this contract near `handleToggleSidebar()` in `dashboard-view.ts`.

### Phase 4: Regression guardrails
1. Add QA checklist for sidebar behavior across all three width tiers.
2. Add quick manual checks for:
   - sidebar open/close entry controls,
   - modal open/close,
   - row spacing readability at min/default/max,
   - viewport transitions.

## Recommended Priority
- Priority: High
- Reason: Core navigation is impacted and issue spans multiple resolutions.

## Status
Open - investigation complete, implementation fixes pending.

## Follow-Up Findings (March 4, 2026, later pass)

### Context
- The temporary mitigation that raised sidebar row spacing minimum to `6` was reverted because it did not address the root issue.
- Current code again allows spacing minimum `0` in settings/runtime.

### New Finding 5 (High confidence): Flex scroller child shrink is likely causing both symptoms
In `src/styles/sidebar.css`, `.rss-dashboard-feed-folders-section` is currently:
- `display: flex;`
- `flex-direction: column;`
- `overflow-y: auto;`
- `min-height: 0;` (introduced in commit `2e444b5`)

Its children (for example `.rss-dashboard-all-feeds-button`, `.rss-dashboard-feed-folder`, root feed containers) do not define `flex-shrink`, so they inherit `flex-shrink: 1`.

Likely behavior:
1. The feed-folders section gets constrained height.
2. Child rows shrink to satisfy flex sizing instead of overflowing naturally.
3. Visual result is compressed/squished rows.
4. Because content shrinks, overflow may not trigger as expected, so scrollbar visibility is reduced or absent.

This single mechanism matches both reported symptoms:
- folders squished together,
- sidebar scrollbar not appearing.

### Supporting evidence
- `git blame` on `src/styles/sidebar.css` shows `min-height: 0` for `.rss-dashboard-feed-folders-section` came from `2e444b5` (`Simplify sidebar toolbar to top layout and remove adaptive footer logic`).
- The same commit also changed section order/margins, increasing the chance of layout pressure in the list region.

### Potential fixes to test (ordered)
1. Preferred: make `.rss-dashboard-feed-folders-section` a non-flex scroller.
   - Remove `display: flex` and `flex-direction: column` from this section.
   - Keep `overflow-y: auto`.
2. Alternative: keep flex container but prevent child shrink.
   - Add `.rss-dashboard-feed-folders-section > * { flex: 0 0 auto; }`.
3. Fallback: restore `min-height: fit-content` for desktop only and keep mobile/tablet behavior isolated with media rules.

### Resolution update
- The previous Phase 2 plan item about spacing minimum is no longer the recommended primary fix.
- New primary fix target is feed-folders section flex/shrink behavior.

## Second Follow-Up Findings (March 4, 2026, latest pass)

### What was tried and outcome
1. Removed stale mobile control-hide rule in `src/styles/controls.css`.
2. Temporarily raised sidebar row spacing minimum and added runtime clamp.
3. Reverted spacing minimum/clamp after no meaningful improvement.

Outcome:
- Reported issue still reproduces: scrollbar still missing and folders still visually squished.

### New Finding 6 (High confidence): Nested scroll owners plus shrinkable list items
Current sidebar layout uses multiple potential scroll owners:
- `.rss-dashboard-sidebar-container` has `overflow-y: auto`
- `.rss-dashboard-sidebar` has `overflow-y: auto`
- `.rss-dashboard-feed-folders-section` has `overflow-y: auto`

At the same time, `.rss-dashboard-feed-folders-section` is a flex column and its children are shrinkable by default.

Likely effect:
1. Browser distributes size/scroll responsibility across nested scroll containers.
2. Child rows shrink under flex pressure instead of producing overflow in the intended container.
3. Scrollbar visibility becomes inconsistent or absent.
4. Row density appears compressed/squished.

### New solution recommendation (replace prior Phase 2)
Adopt a single-scroll-owner sidebar contract.

1. Make only `.rss-dashboard-feed-folders-section` scrollable.
   - Set sidebar container/shell overflow to `hidden`.
   - Keep list section as `overflow-y: auto`.
2. Remove shrink behavior from list rows.
   - Option A: make feed-folders section non-flex block flow.
   - Option B: keep flex container, but force direct children `flex: 0 0 auto`.
3. Add explicit row minimum heights to protect readability independent of spacing token.
   - Example targets: desktop `>= 30-32px`, touch `>= 44px`.
4. Keep row-spacing token as visual tuning only, not structural guardrail.

### Verification criteria for the new solution
1. With long folder/feed lists, scrollbar is visible and usable in both desktop sidebar and mobile modal sidebar.
2. Rows do not compress when viewport height is reduced.
3. Changing row spacing still adjusts visual density without collapsing row usability.
4. No regression in header/toolbar/search placement.

## Resolution (March 4, 2026, final)

Status: Resolved and user-validated.

### Implemented fix
1. Enforced a single scroll owner for sidebar feed content.
   - `src/styles/sidebar.css`
   - Sidebar shell elements now use `overflow: hidden`.
   - `.rss-dashboard-feed-folders-section` remains the only vertical scroller.
2. Removed row-compression pressure in the list section.
   - `src/styles/sidebar.css`
   - Feed folders section moved to block flow (non-flex list flow).
   - Added non-shrinking behavior on row containers/items.
   - Added explicit row minimum heights (`32px`, coarse-pointer `44px`).
3. Aligned mobile modal behavior to the same scroll contract.
   - `src/styles/modals.css`
   - Modal sidebar container/shell overflow set to hidden.
   - Modal scrollbar styling and scrolling moved to `.rss-dashboard-feed-folders-section`.
4. Removed stale mobile control-hiding rule.
   - `src/styles/controls.css`
   - Deleted `:not(.sidebar-collapsed)` mobile hide rule for hamburger/filter controls.

### Validation outcome
1. User confirmed fix success after implementation ("that worked!").
2. Sidebar scrollbar now appears on long lists.
3. Folder/feed rows no longer collapse into compressed spacing under viewport pressure.

### Follow-up
1. Keep the single-scroll-owner contract as the default for future sidebar refactors.
2. If toolbar/header layout changes again, verify that scroll ownership does not move back to nested containers.
