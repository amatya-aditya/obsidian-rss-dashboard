---
status: idea
created: 2026-09-21
issue: ""
milestone: ""
owner: unassigned
workstream: search
sequence: 1
depends_on: []
release_requirement: ""
implementation: ""
---

# Search Scope & Global Article Search

## Summary

Improve RSS Dashboard's existing article search so users can choose between the current fast page-level search and a broader search across all articles in the active dashboard context.

The existing search should remain lightweight and familiar by default. A new **Search all articles** control would opt into the broader behavior.

This work also establishes a cleaner search pipeline that future features such as regex search, field-specific search, saved searches, or richer query syntax can build on.

## Current Behavior

Article search is currently handled locally by `ArticleList`.

The search:

- operates on the articles already rendered on the current page;
- searches article titles;
- hides non-matching DOM elements;
- does not search articles on other pagination pages;
- does not alter the underlying filtered article collection or pagination;
- is not currently part of the main filtering pipeline in `RssDashboardView`.

This behavior is useful as an inexpensive "filter this page" feature, but may be surprising when users expect search to cover the full selected feed, folder, or dashboard view.

## Goals

1. Preserve existing page-level search behavior.
2. Add an explicit way to search the complete article collection for the current dashboard context.
3. Make search results paginate normally when global search is active.
4. Keep status, tag, age, folder, feed, and other existing filters composable with search.
5. Establish a reusable article-search layer rather than placing additional search logic directly in DOM rendering code.
6. Avoid forcing a potentially more expensive full-collection search on users who only want to filter the current page.

## Proposed UX

Retain the existing search field.

Add a compact toggle or checkbox associated with the search control:

> [ ] Search all articles

### Toggle Off — Page Search

This preserves current behavior.

Example:

- User is on page 3 of a feed.
- Page contains 50 articles.
- Searching `OpenAI` filters those 50 visible articles only.
- Pagination and the underlying article collection remain unchanged.

Possible helper text or tooltip:

> Search articles on the current page.

### Toggle On — Search All Articles

Search becomes part of the article filtering pipeline.

Example:

- The selected feed contains 2,000 currently available articles.
- User searches `OpenAI`.
- RSS Dashboard searches the full eligible collection.
- Matching results are then sorted and paginated.
- Pagination represents the search results rather than the original collection.

Possible helper text or tooltip:

> Search all articles in the current view.

## Search Scope

"All articles" should not necessarily mean every article stored by RSS Dashboard.

It should mean all articles belonging to the user's current navigation context before pagination.

Examples:

| Current view      | Search-all scope                            |
| ----------------- | ------------------------------------------- |
| All Feeds         | All eligible articles across feeds          |
| Folder            | Articles belonging to feeds in that folder  |
| Individual feed   | Articles from that feed                     |
| Unread            | All unread articles in the active context   |
| Saved             | All saved articles in the active context    |
| Starred           | All starred articles in the active context  |
| Tag/filter active | Articles remaining after applicable filters |

This keeps search predictable and prevents it from unexpectedly escaping the user's current view.

## Proposed Search Pipeline

When **Search all articles** is enabled, search should occur before pagination.

Conceptually:

```text
stored/cached articles
        ↓
current feed/folder/view scope
        ↓
status/tag/age/keyword filters
        ↓
search query
        ↓
sort
        ↓
pagination
        ↓
ArticleList rendering
```

Page-level search remains a presentation-layer filter after pagination:

```text
filtered articles
        ↓
sort
        ↓
pagination
        ↓
current page
        ↓
page search
        ↓
ArticleList rendering
```

## Proposed Architecture

### [NEW] Search utility/service

Prefer extracting matching behavior into a small reusable module rather than expanding `ArticleList`.

Possible location:

```text
src/services/article-search-service.ts
```

or:

```text
src/utils/article-search.ts
```

Initial API could remain deliberately small:

```ts
matchesArticleSearch(article: FeedItem, query: string): boolean
```

A later version could accept structured search options:

```ts
searchArticles(
  articles: FeedItem[],
  query: string,
  options: ArticleSearchOptions,
): FeedItem[]
```

The matcher should initially preserve the current title-search semantics unless separately expanded.

### [MODIFY] `src/views/dashboard-view.ts`

Add global-search state such as:

```ts
private articleSearchQuery = "";
private searchAllArticles = false;
```

When search-all mode is active:

- incorporate the search query into the article filtering pipeline;
- calculate pagination after search;
- reset/clamp the current page when the result set changes;
- rerender the article list with the matching collection.

### [MODIFY] `src/components/article-list.ts`

Retain local page filtering for page-only search.

Longer term, consider moving matching logic out of this component entirely while leaving `ArticleList` responsible only for rendering and applying page-search visibility.

### [MODIFY] Search controls

Likely locations:

```text
src/components/article-header.ts
src/components/article-header-menu.ts
```

Add the **Search all articles** control in both desktop and compact/mobile search interfaces where appropriate.

Both controls must remain synchronized with the same state.

## State Persistence

Initial recommendation: **do not persist the toggle globally**.

Treat search scope as view/session state until usage demonstrates that users consistently want a default.

Reasons:

- Global search can be more expensive.
- Persisting it may cause users to unknowingly perform broader searches later.
- Page filtering is the existing behavior and therefore the safest compatibility default.

A future setting could allow users to choose their preferred default if there is demand.

## Performance Considerations

Full search will iterate over more articles than page search.

For simple title matching this should generally be inexpensive, but implementation should:

- avoid DOM traversal for global search;
- operate directly on `FeedItem` data;
- avoid unnecessary rerenders for unchanged queries;
- consider debouncing search input if large datasets cause noticeable UI work;
- benchmark against large feed collections before shipping.

If necessary, search can later be indexed or delegated to a more specialized storage/search layer without changing the user-facing scope model.

## Empty States

Global search should have a distinct empty state when no matches are found.

Example:

> No articles match "OpenAI" in the current view.

If filters are also active, the UI should avoid implying that the search covered articles excluded by those filters.

## Interaction With Pagination

When global search begins or its query changes:

- reset to page 1, unless preserving the current page is clearly safe;
- calculate `totalArticles` from the search result set;
- calculate `totalPages` from those results;
- display normal pagination controls.

When global search is disabled:

- restore normal view filtering and pagination;
- returning to page 1 is acceptable for the initial implementation if restoring the previous page adds unnecessary state complexity.

## Verification Plan

### Automated Tests

Add tests covering:

- page search continues to affect only current-page items;
- global search finds articles outside the current page;
- global search occurs before pagination;
- pagination count reflects search results;
- changing the query resets or safely clamps the current page;
- clearing search restores the original collection;
- global search respects individual feed scope;
- global search respects folder scope;
- global search respects status/tag/age filters;
- list, card, and feed views return equivalent search results;
- desktop and mobile/compact controls stay synchronized.

Preserve current characterization tests for page-level search.

### Manual Verification

1. Load enough articles to create several pages.
2. Place a uniquely named article on a later page.
3. Search for it with **Search all articles** disabled.
4. Confirm it is not returned from the current page.
5. Enable **Search all articles**.
6. Confirm the article is returned.
7. Confirm pagination now represents only search matches.
8. Test the same query inside:
   - All Feeds;
   - an individual feed;
   - a folder;
   - Unread;
   - Saved/Starred;
   - active tag/status filters.
9. Clear the query and verify the normal article collection returns.
10. Verify equivalent behavior on desktop and mobile layouts.

## Open Questions

### Control Design

Determine whether **Search all articles** should be:

- a checkbox beneath/beside the search input;
- a compact toggle;
- an icon/menu option inside the search field.

The state must remain obvious enough that users understand why pagination and result counts changed.

### Search Field Scope

Initial recommendation: continue searching titles only.

Full-content, author, URL, feed-name, and metadata search should be evaluated separately because they affect both expected semantics and performance.

### Filter Ordering

Confirm whether global search should always operate after existing dashboard filters.

Initial recommendation: **yes**. "Search all articles" should mean all articles in the current filtered view, not all stored articles regardless of the user's current context.

## Future Extensions

This plan intentionally creates the foundation for:

- regex matching;
- field-specific searches such as `title:` or `author:`;
- full-content search;
- boolean query operators;
- search history;
- saved searches;
- reusable smart views.

These should remain separate follow-up work so the search-scope refactor can be validated independently.
