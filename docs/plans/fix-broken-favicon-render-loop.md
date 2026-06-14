# Fix broken favicon render loop

## Summary

The issue is caused by broken RSS feed icon URLs being rendered as `<img src="...">` without terminal failure state. When the browser rejects the response or CORB blocks it, the component can repeatedly re-render the same failing URL, producing a large request storm.

This plan adds failure caching and safer `onerror` handling in both the article list and sidebar icon render paths.

## Goals

- Prevent repeated broken favicon requests.
- Keep fallback rendering stable after a single failure.
- Use safe fallback behavior instead of continually retrying failing URLs.
- Add test coverage for icon failure caching and fallback rendering.

## Files to change

- `src/components/article-list/utils/feed-icon.ts`
- `src/components/sidebar.ts`
- `src/utils/favicon-utils.ts` (optional provider update, if needed)

## Proposed change breakdown

### Phase 1: article-list icon fallback hardening

1. Add a module-level failure cache:
   - `const failedFeedIconUrls = new Set<string>();`
2. Add a fallback data URI or safe blank source constant:
   - `const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";`
3. In `renderFeedIcon()`:
   - If `feed.iconUrl` already failed, render fallback UI directly.
   - Otherwise create `<img>` with a single `onerror` handler.
4. In the image `onerror` handler:
   - add the failed URL to the failure cache,
   - clear the event handler to prevent repeat triggers,
   - set `src` to the transparent data URI,
   - then render the fallback icon once.
5. Apply the same terminal failure pattern in `renderHeaderFeedIcon()` and any fallback image helper.

### Phase 2: sidebar feed icon failure caching

1. Add a per-`Sidebar` cache:
   - `private failedFeedIconUrls = new Set<string>();`
2. In `renderFeed()` when using `feed.iconUrl`:
   - if the URL failed already, use fallback immediately.
   - otherwise render the `<img>`, attach an `onerror` handler that caches the failure and uses fallback.
3. Keep existing `requestUrl` domain favicon validation for `renderDomainFavicon()`.
   - This already prevents invalid domain favicon URLs from rendering repeatedly.
4. Ensure any fallback branch is terminal and does not re-insert the same failed image URL.

### Phase 3: testing

1. Add or update tests around the new failure cache.
2. Suggested test file locations:
   - `src/components/article-list/utils/feed-icon.test.ts`
   - `src/components/sidebar.test.ts`
3. Test cases:
   - `renderFeedIcon()` renders fallback when `feed.iconUrl` is already failed.
   - `img.onerror` marks the URL failed and prevents a second `<img>` load.
   - `renderHeaderFeedIcon()` uses fallback after feed image failure.
   - `Sidebar.renderFeed()` handles a failing `feed.iconUrl` without retrying.
4. If the existing test framework uses `vitest`, add DOM assertions for element contents and event handler cleanup.

## Recommended test structure

- Create a fake `Feed` object with `iconUrl: "https://broken.example/favicon.png"`.
- Render the icon container.
- Simulate `img.onerror()` and verify the fallback icon appears.
- Re-render and verify the broken URL is not used again.
- For sidebar tests, ensure `failedFeedIconUrls` blocks repeated render attempts.

## Notes / rationale

- The request storm is likely a render/retry cycle, not a feed fetch bug.
- `requestUrl` is a good follow-up for validating arbitrary favicon URLs safely, but the core fix should be local DOM-side failure caching.
- A transparent data URI prevents browsers from issuing a second request or showing broken image UI.

## Example code snippets

### `feed-icon.ts`

```ts
const failedFeedIconUrls = new Set<string>();
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function createSafeIconImage(
  container: HTMLElement,
  src: string,
  alt: string,
  onErrorFallback: () => void,
) {
  const imgEl = container.createEl("img", {
    attr: { src, alt },
    cls: "rss-dashboard-article-feed-icon-img",
  });

  imgEl.onerror = () => {
    failedFeedIconUrls.add(src);
    imgEl.onerror = null;
    imgEl.src = TRANSPARENT_PIXEL;
    onErrorFallback();
  };
}
```

### `sidebar.ts`

```ts
private failedFeedIconUrls = new Set<string>();

if (feed.iconUrl && !this.failedFeedIconUrls.has(feed.iconUrl)) {
  const imgEl = feedIcon.ownerDocument.createElement("img");
  imgEl.src = feed.iconUrl;
  imgEl.alt = feed.title;
  imgEl.className = "rss-dashboard-feed-icon-img";
  imgEl.onerror = () => {
    this.failedFeedIconUrls.add(feed.iconUrl!);
    imgEl.onerror = null;
    imgEl.src = TRANSPARENT_PIXEL;
    this.renderFallbackFeedIcon(feedIcon);
  };
  feedIcon.appendChild(imgEl);
} else {
  this.renderFallbackFeedIcon(feedIcon);
}
```
