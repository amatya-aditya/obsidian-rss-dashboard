# Implementation Plan: 'Date > Feed' and 'Folder > Feed' Grouping Options

## Problem & Summary of Changes

Currently in Feed view:

- **Date** (`"date"`) and **Folder** (`"folder"`) grouping apply outer grouping and then inside each group, `renderFeedView` automatically sub-groups by Feed source (creating double/nested collapsible grouping).
- Users need the ability to choose between **single/flat grouping** (e.g. grouped by Date or Folder, but with flat article cards inside) vs **hierarchical double grouping** (e.g. `Date > Feed` or `Folder > Feed`, with collapsible Feed sections nested inside each Date/Folder group).

We will provide 6 clean, explicit options in the Grouping selector:

1. **None** (`"none"`): No grouping.
2. **Feed** (`"feed"`): Grouped by feed source.
3. **Date** (`"date"`): Grouped by date (flat article cards inside each date section in all view styles, including Feed view).
4. **Date > Feed** (`"date_feed"`): Hierarchical double grouping (grouped by Date first, then Feed sections inside each date section in Feed view).
5. **Folder** (`"folder"`): Grouped by folder (flat article cards inside each folder section in all view styles, including Feed view).
6. **Folder > Feed** (`"folder_feed"`): Hierarchical double grouping (grouped by Folder first, then Feed sections inside each folder section in Feed view).

---

## User Review Required

> [!IMPORTANT]
>
> - **Grouping Options & Values**:
>   - `None` (`"none"`)
>   - `Feed` (`"feed"`)
>   - `Date` (`"date"`)
>   - `Date > Feed` (`"date_feed"`)
>   - `Folder` (`"folder"`)
>   - `Folder > Feed` (`"folder_feed"`)
> - **Behavior in Feed View**:
>   - `"none"`, `"date"`, `"folder"` render flat feed cards inside their respective parent containers/sections.
>   - `"feed"`, `"date_feed"`, `"folder_feed"` render collapsible feed source headers/sections inside their respective parent containers/sections.
> - **Backward Compatibility**:
>   - Existing persisted settings with `"date"` or `"folder"` will map to flat grouping; users wanting double grouping can choose `"date_feed"` or `"folder_feed"`.

---

## Proposed Changes

### 1. Types (`src/types/types.ts`)

#### [MODIFY] [types.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts)

- Update `ArticleGroupByOption`:

```typescript
export type ArticleGroupByOption =
  | "none"
  | "feed"
  | "date"
  | "folder"
  | "date_feed"
  | "folder_feed";
```

- Update `RssDashboardSettings.articleGroupBy`:

```typescript
articleGroupBy: ArticleGroupByOption;
```

---

### 2. Grouping Utility (`src/components/article-list/utils/article-grouping.ts`)

#### [MODIFY] [article-grouping.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/article-list/utils/article-grouping.ts)

- Update `groupArticles(articles, groupBy, getFeedFolderFn)`:
  - When `groupBy === "date"` or `groupBy === "date_feed"`, group by date.
  - When `groupBy === "folder"` or `groupBy === "folder_feed"`, group by folder.
  - When `groupBy === "feed"`, group by feed.
  - When `groupBy === "none"`, return `{ "All articles": articles }`.

---

### 3. Feed View Rendering (`src/components/article-list/views/feed-view.ts`)

#### [MODIFY] [feed-view.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/article-list/views/feed-view.ts)

- In `renderFeedView`:

```typescript
export function renderFeedView(
  container: HTMLElement,
  articles: FeedItem[],
  ctx: BaseViewContext,
  deps: ViewDeps,
): void {
  const isNestedFeedGrouping =
    ctx.settings.articleGroupBy === "feed" ||
    ctx.settings.articleGroupBy === "date_feed" ||
    ctx.settings.articleGroupBy === "folder_feed";

  if (!isNestedFeedGrouping) {
    for (const article of articles) {
      renderArticleCard(container, article, ctx, deps);
    }
    return;
  }

  // Group articles by feed source
  const groupedArticles = groupArticles(articles, "feed");
  // ... render collapsible feed sections ...
}
```

---

### 4. Article List Main Rendering (`src/components/article-list.ts`)

#### [MODIFY] [article-list.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/article-list.ts)

- Update `feedViewGroupsByFeed`:

```typescript
const feedViewGroupsByFeed =
  this.settings.viewStyle === "feed" && this.settings.articleGroupBy === "feed";
```

- For `"date"`, `"date_feed"`, `"folder"`, `"folder_feed"`, `ArticleList` creates the outer group container and delegates child rendering to `renderFeedView`, which respects `ctx.settings.articleGroupBy`.

---

### 5. Article Header & Menu Selectors (`src/components/article-header.ts`, `src/components/article-header-menu.ts`, `src/views/dashboard-view.ts`)

#### [MODIFY] [article-header.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/article-header.ts) & [article-header-menu.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/components/article-header-menu.ts)

- Update `onGroupChange` callback type: `(value: ArticleGroupByOption) => void`.
- Update selector options in both desktop toolbar and dropdown menu:

```typescript
this.createThemedSelector(
  controls,
  "folders",
  "Grouping:",
  {
    None: "none",
    Feed: "feed",
    Date: "date",
    "Date > Feed": "date_feed",
    Folder: "folder",
    "Folder > Feed": "folder_feed",
  },
  () => this.settings.articleGroupBy,
  (val) => this.callbacks.onGroupChange(val as ArticleGroupByOption),
  "rss-dashboard-group",
);
```

#### [MODIFY] [dashboard-view.ts](file:///C:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts)

- Update `handleGroupChange(value: ArticleGroupByOption)` signature and handlers.

---

## Verification Plan

### Automated Tests

- Unit test coverage in `test_files/unit/`:
  - `test_files/unit/components/article-list/views/feed-view.test.ts`
  - `test_files/unit/views/feed-view-collapse.test.ts`
  - `test_files/unit/components/article-list-grouping-toggle.test.ts`
  - `test_files/unit/components/article-header.test.ts`
  - `test_files/unit/components/article-header-menu.test.ts`
- Tests to add/update:
  1. `renderFeedView` with `articleGroupBy: "date"` renders flat article cards.
  2. `renderFeedView` with `articleGroupBy: "date_feed"` renders nested feed section headers.
  3. `renderFeedView` with `articleGroupBy: "folder"` renders flat article cards.
  4. `renderFeedView` with `articleGroupBy: "folder_feed"` renders nested feed section headers.
  5. `ArticleHeader` and `ArticleHeaderMenu` render all 6 grouping options.
- Run full validation ladder:
  - `npm run lint`
  - `npm run check:platform`
  - `npm run test:unit`
  - `npm run build`

### Manual Verification

1. Switch to **Feed view**.
2. Select **Grouping: Date** -> verify articles are grouped under date headers without feed section headers.
3. Select **Grouping: Date > Feed** -> verify articles are grouped under date headers and then under collapsible feed section headers.
4. Select **Grouping: Folder** -> verify articles are grouped under folder headers without feed section headers.
5. Select **Grouping: Folder > Feed** -> verify articles are grouped under folder headers and then under collapsible feed section headers.
6. Verify **None** and **Feed** still function as expected.
