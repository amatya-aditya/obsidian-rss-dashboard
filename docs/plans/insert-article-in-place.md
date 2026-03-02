# Plan: `insertArticleInPlace` — targeted DOM insertion

## Problem
When an article is removed from the list via `removeArticleInPlace` (e.g. auto-mark-read with an "unread only" filter active) and the user subsequently reverses that state from the reader toolbar (e.g. marks it unread), the article should animate back into the list at its correct sorted position. The current fallback calls `refilter()`, which destroys and recreates the entire article section DOM — scroll position is preserved but it's a full rebuild rather than a targeted insertion.

## Goal
Replace the `refilter()` fallback in `syncArticleListAfterUpdate` with a targeted `insertArticleInPlace()` that:
1. Renders only the single article element
2. Splices it into the correct sorted slot in the DOM
3. Animates it in with a fade+expand (the reverse of `removeArticleInPlace`)

---

## Files to modify

| File | What changes |
|------|-------------|
| `src/components/article-list.ts` | Add private `findSortedInsertIndex()` + public `insertArticleInPlace()` after the existing `hasArticle()` method (~line 326) |
| `src/views/dashboard-view.ts` | Update the `!hasArticle` branch in `syncArticleListAfterUpdate()` (~line 1590) |

---

## Key context

### `removeArticleInPlace(guid)` — existing method in `ArticleList` (~line 290)
Removes the article from `this.articles`, then animates the DOM card out (fade + height collapse via `setCssProps`, ~320 ms). `setCssProps` is imported from `../utils/platform-utils` and must be used instead of `element.style.prop = value` (ESLint rule `obsidianmd/no-static-styles-assignment`).

### `hasArticle(guid)` — existing method in `ArticleList` (~line 323)
Returns `this.articles.some(a => a.guid === guid)`. The `!hasArticle` branch in `syncArticleListAfterUpdate` is where the new `insertArticleInPlace` call goes.

### `renderListView(container, articles)` / `renderCardView(container, articles)` — private methods in `ArticleList` (~lines 1851, 1983)
Accept *any* container and an articles array. Can be called with a single-item array and a detached `div` to render one card without touching the live DOM.

### View style + group by
`this.settings.viewStyle` is `"list"` or `"card"`. `this.settings.articleGroupBy` is `"none" | "feed" | "date" | "folder"`. Grouped view is an early-exit fallback case (see Decisions).

---

## Implementation

### 1. `findSortedInsertIndex(article, sortOrder)` — private, in `ArticleList`

```typescript
private findSortedInsertIndex(
  article: FeedItem,
  sortOrder: "newest" | "oldest",
): number {
  const newTime = new Date(article.pubDate).getTime();
  for (let i = 0; i < this.articles.length; i++) {
    const existingTime = new Date(this.articles[i].pubDate).getTime();
    if (sortOrder === "newest" ? newTime > existingTime : newTime < existingTime) {
      return i;
    }
  }
  return this.articles.length;
}
```

### 2. `insertArticleInPlace(article, sortOrder)` — public, in `ArticleList`

```typescript
public insertArticleInPlace(
  article: FeedItem,
  sortOrder: "newest" | "oldest",
): boolean {
  // Grouped view: group headers would need to be redrawn — fall back
  if (this.settings.articleGroupBy !== "none") return false;

  const listEl = this.container.querySelector<HTMLElement>(
    ".rss-dashboard-articles-list",
  );
  // Empty state (no list rendered yet) — fall back
  if (!listEl) return false;

  const insertIdx = this.findSortedInsertIndex(article, sortOrder);
  const temp = document.createElement("div");
  if (this.settings.viewStyle === "list") {
    this.renderListView(temp, [article]);
  } else {
    this.renderCardView(temp, [article]);
  }
  const newEl = temp.firstElementChild as HTMLElement | null;
  if (!newEl) return false;

  // Find the DOM sibling that should come after the new element
  const nextArticle = this.articles[insertIdx];
  const referenceEl = nextArticle
    ? listEl.querySelector<HTMLElement>(
        `#article-${CSS.escape(nextArticle.guid)}`,
      )
    : null;

  // Safety guard: if a required reference sibling exists in internal array
  // but is not in the DOM, fallback to refilter() to avoid silent sort corruption.
  if (nextArticle && !referenceEl) {
    return false;
  }

  // Only mutate internal state after confirming DOM insertion will succeed.
  this.articles.splice(insertIdx, 0, article);

  if (referenceEl) {
    listEl.insertBefore(newEl, referenceEl);
  } else {
    listEl.appendChild(newEl);
  }

  // Entrance animation (reverse of removeArticleInPlace)
  const naturalHeight = newEl.offsetHeight; // force layout before collapsing
  setCssProps(newEl, {
    overflow: "hidden",
    "max-height": "0",
    opacity: "0",
    "margin-top": "0",
    "margin-bottom": "0",
    "padding-top": "0",
    "padding-bottom": "0",
  });

  requestAnimationFrame(() => {
    setCssProps(newEl, {
      transition:
        "opacity 150ms ease, max-height 200ms ease 100ms, margin 200ms ease 100ms, padding 200ms ease 100ms",
      "max-height": `${naturalHeight}px`,
      opacity: "1",
      "margin-top": "",
      "margin-bottom": "",
      "padding-top": "",
      "padding-bottom": "",
    });
  });

  setTimeout(() => {
    setCssProps(newEl, {
      overflow: "",
      "max-height": "",
      transition: "",
    });
  }, 320);

  return true;
}
```

### 3. Update `syncArticleListAfterUpdate` in `RssDashboardView` (~line 1590)

Replace the `!hasArticle` branch:

```typescript
if (!this.articleList.hasArticle(article.guid)) {
  const inserted = this.articleList.insertArticleInPlace(
    article,
    this.settings.articleSort,
  );
  if (!inserted) {
    // Fallback for grouped view or empty-state
    const filtered = this.getFilteredArticles();
    const pageSize = this.getCurrentPageSize();
    const currentPage = this.getCurrentPage();
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const articlesForPage = filtered.slice(startIdx, endIdx);
    this.articleList.refilter(
      new Set(this.activeStatusFilters),
      new Set(this.activeTagFilters),
      this.filterLogic,
      articlesForPage,
    );
  }
  return;
}
```

---

## Implementation notes (safety guards)

1. **Splice timing**: `this.articles.splice(...)` is called *after* confirming element renders successfully and reference sibling (if needed) exists in DOM. This prevents internal state/DOM parity drift on render failures.
2. **Reference validation**: If `nextArticle` exists in the internal array but its DOM element is not found, `insertArticleInPlace()` returns `false` rather than appending—this triggers the `refilter()` fallback to avoid silent sort order corruption.

---

## Decisions

- **Grouped view** (`articleGroupBy !== "none"`) falls back to `refilter()` — group headers would need creation/removal logic that is out of scope.
- **Empty state** (`.rss-dashboard-articles-list` absent from DOM) falls back to `refilter()`.
- **Missing reference sibling** (nextArticle exists but DOM element not found) returns `false` for `refilter()` fallback.
- **Sort order** is passed in as `this.settings.articleSort` from the view — not stored on `ArticleList` directly.
- **`setCssProps`** is used for all CSS assignments (both animation setup and cleanup) to comply with ESLint rule `obsidianmd/no-static-styles-assignment`.
- **Temp container**: `document.createElement("div")` renders the single card/item, then the element is transferred to live DOM.

---

## Verification checklist

1. Set "unread only" filter → click an article (auto-marks read, card animates out) → mark it unread from reader toolbar → card animates back in at correct chronological position
2. Repeat with "oldest first" sort — card appears in the right slot
3. With "Group by: Feed" active — `insertArticleInPlace` returns `false`, `refilter()` runs instead — no DOM corruption
4. `npm run build` exits 0 with no ESLint errors
