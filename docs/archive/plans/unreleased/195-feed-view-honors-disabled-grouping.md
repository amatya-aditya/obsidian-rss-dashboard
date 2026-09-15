---
status: implemented
completed: 2026-08-24
released_in: unreleased
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/195
implementation: ""
---

# Make Feed View honor disabled grouping

## Problem and user value

Issue #195 reports that Feed View still groups articles by feed and displays
collapsible feed headers after the user selects **Grouping: Disabled** from the
dashboard hamburger menu. When a folder grouping is also involved, this creates
nested folder and feed grouping even though grouping is disabled.

Users need the grouping control to have the same meaning in every dashboard
view: disabled grouping must produce one uninterrupted article sequence.

## Agreed behavior

- With `articleGroupBy: "none"`, Feed View renders the supplied articles as a
  flat sequence of feed cards, in the existing article order.
- No `.rss-dashboard-feed-section` wrappers, feed-section headers, or section
  collapse controls are rendered while grouping is disabled.
- Feed-source metadata within each card remains available according to the
  existing `showFeedSource` behavior.
- With `articleGroupBy: "feed"`, preserve the existing feed headers and their
  collapse/persistence behavior.
- With `articleGroupBy: "folder"`, preserve the dashboard's folder-level
  grouping and the Feed View's existing feed-section behavior inside each
  folder group.

## Implemented approach

`BaseViewContext` now carries the selected grouping mode. Feed View renders its
existing article cards directly into the supplied container when that mode is
`"none"`; otherwise, it retains the existing feed-section grouping, collapse
state lookup, and callbacks. The dashboard's persisted grouping setting remains
the sole source of truth.

When Feed View groups by feed, `ArticleList` now delegates the complete article
set directly to Feed View instead of first creating generic feed groups. This
leaves Feed View as the single owner of one collapsible header per feed. Folder
grouping and non-Feed views retain the generic group wrapper.

Likely files:

- `src/components/article-list/views/view-types.ts`
- `src/components/article-list.ts`
- `src/components/article-list/views/feed-view.ts`
- `test_files/unit/views/feed-view-collapse.test.ts`
- potentially `test_files/unit/components/article-list-grouping-toggle.test.ts`

## Acceptance criteria

1. In Feed View, choosing **Grouping: Disabled** produces one flat list of
   feed cards with no feed-section wrappers, headers, or collapse toggles.
2. The flat list preserves the article order supplied by `ArticleList`.
3. Choosing **Grouping: Feed** continues to render collapsible feed sections
   and preserves their collapsed state.
4. Choosing **Grouping: Folder** continues to render the existing folder group
   structure and Feed View sections within it.
5. Switching among grouping modes rerenders the current view correctly and the
   selected setting persists through the established settings path.

## Validation and manual checks

- Added a jsdom regression test through `ArticleList` with Feed View and
  `articleGroupBy: "none"`; it asserts no section wrappers, headers, or
  toggles, and preserves article order across multiple feeds.
- Added a regression test confirming Feed View with explicit Feed grouping
  renders one Feed View header per feed and no generic group header.
- Passed changed-file ESLint, `npm run check:platform`, and three focused Feed
  View/grouping test files (24 tests).
- Passed `npm run build`, including compliance checks, full lint, TypeScript
  checking, and production bundling.
- Manual verification remains recommended in Obsidian: select Disabled, Feed,
  and Folder in Feed View on desktop and narrow/mobile layouts; reopen the
  dashboard to confirm persisted selection and collapse behavior.

## Non-goals, risks, and sequencing

- Do not alter list or card view grouping behavior.
- Do not remove collapsible feed sections from explicit Feed or Folder grouping.
- Do not migrate or clear existing `collapsedFeedSections`; they are simply not
  applied while grouping is disabled.
- Risk is low-to-medium: rendering changes are confined to Feed View, but the
  context type is shared by its renderer and must preserve current behavior for
  explicit grouping modes.
- No known dependency. Recommend `vNext` consideration as a required bug fix,
  but leave milestone and release requirement blank until maintainers triage it.
