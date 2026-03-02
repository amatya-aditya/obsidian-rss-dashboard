## Plan: Fix iPhone Filter Status Bar Visibility

Status bar element is rendered by `renderFilterSubheader()` but is likely being visually suppressed on real iPhone due to iOS Safari stacking/overflow behavior (`sticky` header + scroll container + parent `overflow: hidden`). Implement a minimal CSS-first fix (layering + isolation), then only add TS viewport handling if iPhone validation still fails.

**Steps**

1. Confirm reproducible render path and guard conditions in `RssDashboardView.renderFilterSubheader()` and ensure no conditional early return is iOS-specific (_baseline, blocks later debugging confidence_).
2. Phase 1 (CSS-first, low risk): adjust filter subheader layering so it cannot sit below sticky article header on iOS (`z-index` alignment and stacking-context isolation) in the dashboard content stack (_depends on 1_).
3. Phase 1b (CSS containment hardening): if needed, update scroll/flex container constraints to avoid iOS clipping of earlier siblings (`overflow`/`min-height` interaction) while preserving existing desktop behavior (_depends on 2_).
4. Phase 2 (targeted iOS resilience): add safe-area-aware padding and max-height constraints for the subheader container to prevent notch/viewport overlap on iPhone (_parallel with 3 after 2, if still needed_).
5. Phase 3 (TS fallback only if unresolved): add `visualViewport` sync logic for filter subheader height using existing mobile viewport sync pattern already used in article/reader components (_depends on 4 outcome; avoid unless required_).
6. Validate on real iPhone and desktop emulation with the same dataset/settings, then regression-check toolbar/header/list interactions and collapse toggle animation (_depends on 2-5_).

**Relevant files**

- `src/views/dashboard-view.ts` — `renderFilterSubheader()` render conditions/order, potential viewport listener lifecycle if Phase 3 is needed.
- `src/styles/controls.css` — `.rss-dashboard-filter-subheader`, `.rss-dashboard-filter-subheader-content`, `.rss-dashboard-articles-header` layering and sticky interaction.
- `src/styles/articles.css` — `.rss-dashboard-content` + `.rss-dashboard-articles` flex/overflow constraints impacting iOS clipping.
- `src/styles/layout.css` — container-level overflow/layout constraints that may affect clipping under mobile width.
- `src/components/article-list.ts` — reference implementation for `visualViewport` sync pattern.
- `src/styles/dropdown-portal.css` and `src/styles/sidebar.css` — safe-area inset patterns to mirror consistently.

**Verification**

1. Enable conditions that guarantee subheader render (active keyword filters and/or enabled highlights) and verify subheader exists in DOM.
2. Real iPhone Safari/Obsidian mobile: verify subheader is visible below toolbar and above articles at initial load, after scroll, and after filter changes.
3. Toggle collapse/expand button repeatedly and verify content transition, pointer interaction, and no overlap with sticky header.
4. Open/close keyboard-triggering UI and rotate portrait/landscape; verify subheader remains visible and not clipped.
5. Regression on desktop + desktop mobile emulation: confirm no visual regressions for article header stickiness, toolbar controls, or article list scroll.

**Decisions**

- Prefer CSS-only remediation first to minimize behavioral risk and avoid introducing new viewport event listeners unless necessary.
- Keep scope limited to dashboard status bar visibility; do not alter unrelated mobile toolbar/sidebar behavior.
- Preserve existing design tokens and component structure; no new UI affordances.

**Further Considerations**

1. If Phase 1 does not fix real iPhone behavior, prioritize isolation/overflow adjustments before JS listeners to avoid complexity.
2. If issue reproduces only inside Obsidian iOS WebView (not Safari), include WebView-specific class checks in validation (`mod-mobile`, platform classes) before expanding fix scope.
3. If clipping persists with all CSS changes, capture a Safari Web Inspector computed-style snapshot to confirm whether issue is layout clipping vs render omission.
