# Plan: Add Favicon Icons to Article List and Card Views

## Problem

In the list and card view subheaders, the RSS feed "source" is displayed as plain text only. Users want to see the associated favicon icon next to the source name, matching what appears in the left sidebar.

## Goals

1. Add favicon icons next to the source name in both list view and card view
2. Reuse existing sidebar favicon logic (domain extraction + Google favicon service)
3. Handle special media types (video/podcast) with appropriate icons

## Implementation Plan

### 1. Add Helper Methods to ArticleList Class

Add two private methods to `src/components/article-list.ts`:

```typescript
private extractDomain(url: string): string {
    // Copy from sidebar.ts - extracts main domain from URL
}

private getFaviconUrl(domain: string): string {
    // Copy from sidebar.ts - returns Google faviconV2 URL
}
```

### 2. Update List View (renderListView)

At lines 446-448, modify the source display to include an icon:

**Current code:**
```typescript
metaEl.createSpan({ text: "|" });
metaEl
    .createSpan("rss-dashboard-article-source")
    .setText(article.feedTitle);
metaEl.createSpan({ text: "|" });
```

**New code:**
- Create icon container before the source span
- Check `article.mediaType`:
  - If "video": show play icon
  - If "podcast": show mic icon  
  - Otherwise: show favicon image (or RSS fallback if disabled in settings)
- Then render source text as before

### 3. Update Card View (renderCardView)

At lines 855-867, enhance the existing feed container:

**Current code already handles:**
- Video: shows video icon
- Podcast: shows podcast icon

**Need to add:**
- For regular feeds: show favicon image next to feed title
- Use same logic as sidebar (check `settings.display.useDomainFavicons`)

### 4. CSS Considerations

The existing CSS classes from sidebar can likely be reused:
- `.rss-dashboard-feed-icon` - icon container
- `.rss-dashboard-feed-favicon` - favicon image
- Add to `.rss-dashboard-article-source` container if needed

## Affected Files

- `src/components/article-list.ts` - Main implementation
- (No CSS changes expected - reuse existing classes)

## Testing Checklist

- [ ] List view shows favicon icon next to source name
- [ ] Card view shows favicon icon next to feed title
- [ ] Video feeds show play icon in both views
- [ ] Podcast feeds show mic icon in both views
- [ ] Works with "use domain favicons" setting enabled/disabled
- [ ] Falls back gracefully if favicon fails to load
