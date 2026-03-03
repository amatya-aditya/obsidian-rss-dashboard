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
