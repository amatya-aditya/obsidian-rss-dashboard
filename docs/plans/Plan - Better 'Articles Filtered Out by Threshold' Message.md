## Plan - Better "Articles Filtered Out by Threshold" Message (Revised)

**TL;DR:** Implement a detection layer that identifies when all articles are hidden due to active date/multi-filters (not truly empty feeds). Replace "No articles found" with a context-aware message showing the filter reason, count, and a link to adjust settings. Use strict TDD cycle (Red → Green → Refactor), mock Obsidian APIs via stubs, follow design-spec tokenized colors and clickable-icon pattern, and organize tests in folders mirroring src structure.

### Implementation Status (May 2026)

- Completed: detection and empty-state context now distinguish genuinely empty feeds, age-threshold filtering, view-filter exclusions, and per-feed retention pruning.
- Completed: empty-state CTA routing is wired to real actions:
  - View-filter cases open the dashboard viewing filters.
  - Per-feed retention cases open Edit Feed directly to per-feed controls.
- Completed: per-feed deep-link opens and highlights:
  - The full per-feed controls section.
  - The Auto delete articles duration setting row using dedicated class `.rss-per-feed-auto-delete-highlight`.
- Completed: targeted unit tests cover context modeling, empty-state rendering/action behavior, ArticleList callback routing, and EditFeedModal deep-link highlighting behavior.
- Completed: CSS scope check and build pass after the implementation.

---

### Steps

#### Phase 1: Detection & Data Modeling (Test-First)

1. **RED: Write failing test for filter detection** — Create `test_files/unit/utils/filter-detection.test.ts`
   - Test: "Detects when articles are filtered by age threshold" — Feed has articles, but all older than 1 month
   - Test: "Detects when articles are filtered by multi-filter combination" — Feed has articles but missing required tags + outside date window
   - Test: "Returns 'no articles' when feed is genuinely empty" — Feed.items.length === 0, no filtering needed
   - Test: "Counts correctly when mixed articles exist" — Some pass filters, some don't; correct count reported
   - Setup pattern: Use stubs from obsidian.ts; clean DOM with `document.body.empty()` in `afterEach`

2. **GREEN: Implement filter detection** — New file `src/utils/filter-detection.ts`
   - Type: `FilterContext = { type: 'NoArticlesAtAll' | 'AllArticlesFiltered'; filteredCount?: number; unfilteredCount?: number; filterReason?: string; thresholdLabel?: string; }`
   - Function: `detectFilteredOutScenario(feedItems: FeedItem[], currentFilters: ArticleFilter, matchesFiltersFn: (item: FeedItem) => boolean): FilterContext`
   - Logic: Compare unfiltered count vs filtered count; return reason + threshold label ("1 month", "3 months", etc.)

3. **REFACTOR: Simplify and document** — Add JSDoc to `detectFilteredOutScenario()` explaining each return branch

#### Phase 2: UI Component & Integration Tests

4. **RED: Write failing test for empty state rendering** — Create `test_files/unit/components/article-list-empty-state.test.ts`
   - Test: "Renders 'No articles found' when FilterContext.type === 'NoArticlesAtAll'"
   - Test: "Renders filtered-out message with count and threshold label when FilterContext.type === 'AllArticlesFiltered'"
   - Test: "Settings button has aria-label and is keyboard-accessible" — Test `Enter` and `Space` key handlers
   - Test: "Message includes injected threshold value (e.g., '1 month')"
   - Setup: Use `vi.mock()` for Obsidian `app.commands`; clean `document.body` after each test

5. **GREEN: Extract empty state component** — New file `src/components/article-empty-state.ts`
   - Export: `class ArticleEmptyState { render(container: HTMLElement, context: FilterContext): void }`
   - For `NoArticlesAtAll`: Icon + "No articles found" + "Try refreshing your feeds..."
   - For `AllArticlesFiltered`: Icon + "Articles outside your filter" + "{count} article(s) found but all are older than {thresholdLabel}" + keyboard-accessible button
   - Icon pattern: Use `setIcon()` with component-scoped CSS for Android visibility (per design-spec)
   - Button: `role="button" tabindex="0" aria-label="Open settings"` with `Enter`/`Space` handlers

6. **REFACTOR: Style the component** — New file `src/styles/article-empty-state.css`
   - **CSS scoping**: All selectors prefixed with `rss-` (`.rss-dashboard-empty-state`, `.rss-dashboard-empty-state-button`, `.rss-dashboard-empty-state-icon`)
   - **Token usage**:
     - Button: `background: var(--interactive-accent); color: var(--text-on-accent)`
     - Text: `color: var(--text-muted)` for description
     - Icon: `--icon-size: 32px` with `width: var(--icon-size) !important` for Android
   - **Accessibility**: `min-height: 40px; min-width: 40px` for mobile touch target, focus-visible outline
   - Verify: `npm run check:css-scope` passes (no unscoped global selectors)

#### Phase 3: Update Article List

7. **Update article-list rendering** — Modify article-list.ts
   - Compute `filterContext` in `renderArticles()` before checking `if (this.articles.length === 0)`
   - Replace current empty state block with: `new ArticleEmptyState().render(articlesList, filterContext);`

#### Phase 4: Dashboard View Integration

8. **Pass unfiltered article data to article-list** — Modify dashboard-view.ts
   - Store reference to all articles before filtering
   - Pass to article-list via method: `this.articleList.setUnfilteredArticles(unfilteredArticles);`
   - Article-list uses this in `renderArticles()` to compute `FilterContext`

---

### Relevant Files

- **Current empty state**: article-list.ts
- **Filter matching logic**: dashboard-view.ts (`matchesFilters()` method)
- **Article filter type**: types.ts
- **Age filter options**: article-header.ts (shows "1 month" → "2592000000" ms mapping)
- **Obsidian stubs for testing**: obsidian.ts
- **Design tokens**: Examine styles for `--interactive-accent`, `--text-on-accent` patterns

---

### Verification

1. **All unit tests pass** — `npm run test:unit` (vitest, 100% pass rate)
2. **Coverage maintained** — No regression below thresholds (lines 40%, branches 33%, functions 34%)
3. **Dirkjanm.io feed scenario** — Manually set filter to "1 month", verify filtered-out message appears with correct count
4. **Accessibility** — Tab to button, verify focus outline visible, test `Enter` and `Space` activation
5. **CSS scoping check** — `npm run check:css-scope` passes
6. **Multi-filter scenario** — Test with date + tag filter combination

---

### Decisions

- **Detection scope**: Only trigger for age filter + multi-filter combos (not pure tag-only filters)
- **Article count**: Always shown for transparency
- **Threshold label**: Dynamically mapped ("1 month", "3 months") in detection function
- **CSS organization**: Dedicated `article-empty-state.css` file (mirrors component structure per testing guide)

---

### Alignment with Guidelines ✅

**Testing Guide**: Tests in utils + components mirroring src structure, TDD cycle, `document.body.empty()` cleanup, Obsidian stubs, descriptive `it` statements

**Design Spec**: CSS scoped with `rss-` prefix, tokenized colors (`--interactive-accent`, `--text-on-accent`, `--text-muted`), clickable-icon accessibility pattern with keyboard parity, `40px` mobile touch target, Android icon visibility rules, passes CSS collision guardrail

**Codebase Patterns**: Reuse `setIcon()`, follow existing component lifecycle, existing test patterns, CSS file organization

---
