---
id: module-sidebar-filtering
type: submodule-design
status: draft
title: Service area — sidebar, filtering, and search
parent: architecture
---

# Service area — sidebar, filtering, and search

## Responsibility

Decide what a view shows and how the sidebar is ordered and selected:
article filters and scope, keyword rules, sidebar search, range and batch
selection, folder moves, and highlight matching.

Entry points: `matchesArticleFilters` (`article-filters.ts`), `ArticleScope`
(`article-scope.ts`), `KeywordFilterService`, `SidebarSearchService`,
`resolveSidebarRangeSelection`, `batchMoveFeedsAndFolders`, `moveFolder`,
`SidebarOrderingController`, `HighlightService`.

## Boundary

The matching is pure data in, data out: rendering stays in
`src/components/`, so a filter can be unit-tested without a DOM. It reads the
ingestion area's item-identity and date helpers and never writes storage
directly — a state change goes through the settings store.

`HighlightService` and `tag-chip-radius-sync` touch the DOM from a service.
`TagChipRadiusSync` receives the workspace through its options; `HighlightService`
uses `activeDocument` directly. Neither imports a view, which is the shape to
keep.

## Invariants

- **Filters hide, retention deletes.** A view filter never removes an article
  from storage; switching the filter back reveals it.
- **Scope is feed membership only** (`ArticleScope`) — folder, tag, and search
  inputs narrow the feed set, they do not re-derive article identity.
- **Sidebar search covers feeds, folders, and tag names only**, never article
  titles or body text; article-title search is a separate dashboard action
  ([vocabulary](../../CONTEXT.md)).
- Keyword rules run at ingestion/apply time and stay migrated in one place
  (`keyword-rules-migration`), so old rule shapes keep working.
- A multi-selection move is one operation over the selection, not one move per
  row, so undo semantics and ordering stay consistent.
