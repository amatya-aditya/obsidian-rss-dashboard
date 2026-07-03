Steps
Phase 1: Settings & Type Definitions

Create test file test_files/unit/views/feed-view-collapse.test.ts with RED test: "Feed view renders with collapsible section headers" — expects .rss-dashboard-feed-section containers and .rss-dashboard-feed-section-toggle buttons grouped by feed source (fails — feed-view.ts doesn't create headers yet)
Extend src/types/plugin-settings.ts with collapsedFeedSections?: Set<string> field (minimal change to unblock test compilation)
Phase 2: Collapse State Tests (RED)

Add RED test: "Clicking collapse button hides cards in that section" — click toggle, assert .collapsed class added, cards hidden (fails — no handler)
Add RED test: "Clicking collapse button again shows cards" — toggle twice, assert class removed, cards visible
Add RED test: "Toggle button icon changes between chevron-down and chevron-right" — mock setIcon(), verify icon state on collapse/uncollapse (fails — feed-view.ts doesn't use setIcon())
Phase 3: Persistence Tests (RED)

Add RED test: "Toggling collapse calls onToggleFeedSectionCollapse callback" — mock callback, verify signature (feedSourceName: string, isCollapsed: boolean) (fails — no callback support)
Add RED test: "Collapsed sections are restored on re-render" — render with settings.collapsedFeedSections = new Set(["TechCrunch"]), assert section has .collapsed on initial render (fails — feed-view.ts doesn't check settings)
Phase 4: Implementation (GREEN)

Update feed-view.ts renderFeedView():

Call groupArticles(articles, "source") to group by feed source
For each feed group: create .rss-dashboard-feed-section container, .rss-dashboard-feed-section-header with feed name, .rss-dashboard-feed-section-toggle button (icon: chevron-down)
Render cards inside section
Use createDiv() per compliance-patterns.md §5 (Obsidian DOM helpers)
Add click handler in feed-view.ts:

addEventListener("click") on toggle button
Toggle .collapsed class on section + cards container
Call setIcon(toggleButton, isCollapsed ? "chevron-right" : "chevron-down")
Invoke deps.onToggleFeedSectionCollapse?.(feedName, isCollapsed) callback
Add callback signature to deps type: onToggleFeedSectionCollapse?: (feedSourceName: string, isCollapsed: boolean) => void

Implement handler in article-list.ts:1401 to persist:

Add/remove feed name from settings.collapsedFeedSections
Call this.plugin.saveSettings()
Update feed-view.ts to restore collapsed state on render:

Check settings.collapsedFeedSections.has(feedSourceName) before rendering each section
Pre-add .collapsed class and set icon to chevron-right if found
Add minimal CSS: .rss-dashboard-feed-section.collapsed > .rss-dashboard-feed-section-cards { display: none; }

Phase 5: Refactor & Compliance

Extract collapse handler logic to reusable function if complex
Run npm run check:css — ensure scoped .rss-dashboard-feed-section\* classes (compliance-patterns.md)
Run npm run lint and npm run test:unit — verify coverage thresholds (~55% lines, ~45% branches)
Relevant Files
Core: feed-view.ts, article-list.ts:1401, src/types/plugin-settings.ts
Reuse: article-grouping.ts for groupArticles(), sidebar.ts:1200 for collapse pattern reference
Tests: test_files/unit/views/feed-view-collapse.test.ts (new file), reference dashboard-lifecycle.test.ts
Verification
All 7 unit tests pass (RED → GREEN phases)
Lint passes on modified files; no undocumented suppressions (compliance-patterns.md §2)
CSS scoped (compliance-patterns.md §5); npm run check:css passes
Manual: Feed view renders grouped headers → collapse hides cards → icon toggles → state persists on reload
