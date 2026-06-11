# Plan: Remove card preview fallback setting and force summary-only card previews

## Goal

Remove the Display settings UI for choosing card preview fallback behavior and make card preview fallback behavior permanently summary-only:

- Cards with valid cover images continue to render the cover image.
- Cards without images, or whose image fails to render, show only the article summary text in the preview area.
- No feed logo/icon fallback should be rendered for missing or failed card images.
- If no summary text exists, do not render a feed-logo fallback or “No summary available” placeholder.

## Current findings

- `src/settings/tabs/display-settings-tab.ts:85-112` contains the `Card preview fallback` setting as a commented block. It should be removed entirely, not left in the settings tab.
- `src/types/types.ts:310` still defines `cardImageFallback: "feed-logo" | "summary-only"`.
- `src/types/types.ts:716` still sets `DEFAULT_SETTINGS.display.cardImageFallback` to `"feed-logo"`.
- `src/components/article-list/views/card-view.ts` currently has partial edits that disable feed-logo fallback but leave commented code and a `fallbackMode` parameter that is no longer needed.
- Existing working tree already contains unrelated changes, so implementation must preserve unrelated edits and avoid broad rewrites.

## Implementation steps

1. **Remove the Display settings option**
   - In `src/settings/tabs/display-settings-tab.ts`, delete the commented `Card preview fallback` `Setting` block.

2. **Remove the setting from types/defaults**
   - In `src/types/types.ts`, remove `cardImageFallback` from `DisplaySettings`.
   - Remove `cardImageFallback` from `DEFAULT_SETTINGS.display`.

3. **Make card rendering summary-only by default**
   - In `src/components/article-list/views/card-view.ts`, simplify `resolveCoverImageSrc` so it no longer accepts a fallback mode and never returns `article.fallbackIconUrl`.
   - Remove all `fallbackMode` handling from `renderCardView`.
   - Keep existing image extraction from:
     - `article.coverImage`
     - `article.content`
     - `article.summary`
     - image enclosures
   - When no valid image exists:
     - Render `.rss-dashboard-cover-summary-only` using `getArticlePreviewSummaryText(article)` if summary text exists.
     - Render no preview region if no summary text exists.
   - When an image fails via `onerror`:
     - Rebuild the preview region as summary-only text if summary text exists.
     - Remove the preview region entirely if no summary text exists.

4. **Clean up stale setting references**
   - Ensure `cardImageFallback` is not referenced by source code after the change.
   - Consider adding a migration in `src/utils/settings-loader.ts` to delete stale `display.cardImageFallback` values from saved settings, since existing users may already have this key persisted.

5. **Update tests**
   - In `test_files/unit/components/article-list/views/card-view.test.ts`, add coverage for:
     - Valid cover image still renders `.rss-dashboard-cover-image`.
     - Article with no image but with summary renders `.rss-dashboard-cover-summary-only` and no `.rss-dashboard-cover-image`.
     - Article with `fallbackIconUrl` but no cover image does not render a feed-logo image.
     - Simulated image `error` event removes the image and renders summary-only text.
     - Article with no image and no summary renders no preview region.
   - If adding stale-setting cleanup in settings migration, add a corresponding test in `test_files/unit/utils/settings-loader.test.ts`.

## Validation

Run focused and full checks after implementation:

1. `npm run test:unit -- test_files/unit/components/article-list/views/card-view.test.ts`
2. If settings migration is changed: `npm run test:unit -- test_files/unit/utils/settings-loader.test.ts`

## Work completed

- Removed the commented `Card preview fallback` setting from `src/settings/tabs/display-settings-tab.ts`.
- Removed `cardImageFallback` from `DisplaySettings` and `DEFAULT_SETTINGS.display`.
- Simplified `src/components/article-list/views/card-view.ts` so missing or failed card images no longer use feed-logo fallback and render summary-only previews when summary text exists.
- Added focused tests for:
  - valid cover image rendering
  - missing-image summary-only preview
  - failed-image summary-only preview
  - no-image/no-summary preview omission
- Focused unit test command passed:
  - `npm run test:unit -- test_files/unit/components/article-list/views/card-view.test.ts`

## Follow-up investigation needed

The latest changes appear to partially work on certain articles but not others. The implemented code path handles cards with no image or failed image by rendering summary-only text, but one observed NPR item still shows a gray card that obscures the summary until hover.

Working example:

```xml
<item>
<title>
U.S. launches second day of Iran strikes. And, World Cup facts to know before kickoff
</title>
<description>
The U.S. launched air strikes on Iran for a second consecutive day. And, the World Cup kicks off today in Mexico City, where tensions threaten to disrupt events.
</description>
<pubDate>Thu, 11 Jun 2026 07:09:33 -0400</pubDate>
<link>
https://www.npr.org/2026/06/11/g-s1-127423/up-first-newsletter-us-iran-war-inflation-rates-world-cup
</link>
<guid>
https://www.npr.org/2026/06/11/g-s1-127423/up-first-newsletter-us-iran-war-inflation-rates-world-cup
</guid>
<content:encoded>
<img src='undefined' alt='Motorists ride past a giant banner depicting Iranian missiles and a sword belonging to Imam Ali, the first Imam of the Shiites, at the Vanak Square in Tehran on June 10, 2026.'/><p>The U.S. launched air strikes on Iran for a second consecutive day. And, the World Cup kicks off today in Mexico City, where tensions threaten to disrupt events.</p><p>(Image credit: Atta Kenare)</p><img src='https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=g-s1-127423' />
</content:encoded>
<dc:creator>Brittney Melton</dc:creator>
</item>
```

Non-working example:

```xml
<item>
<title>Morning news brief</title>
<description>
U.S. launches a second-round of strikes against Iran, inflation jumps to its highest level in more than three years, 2026 World Cup kicks off in Mexico.
</description>
<pubDate>Thu, 11 Jun 2026 04:48:53 -0400</pubDate>
<link>
https://www.npr.org/2026/06/11/nx-s1-5846832/morning-news-brief
</link>
<guid>
https://www.npr.org/2026/06/11/nx-s1-5846832/morning-news-brief
</guid>
<content:encoded>
<p>U.S. launches a second-round of strikes against Iran, inflation jumps to its highest level in more than three years, 2026 World Cup kicks off in Mexico.</p><img src='https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=nx-s1-5846832' />
</content:encoded>
<dc:creator>Leila Fadel</dc:creator>
</item>
```

Do not attempt a fix yet. Next step is to investigate why the non-working item still renders a gray card instead of a summary-only preview.

## Acceptance criteria

- The Display settings tab no longer exposes any card preview fallback choice.
- `cardImageFallback` is removed from default settings and type definitions.
- Missing or broken card images never fall back to feed logo/icon rendering.
- Missing or broken card images with summary text render summary text only.
- Missing or broken card images without summary text leave the preview area absent.
- Existing image rendering behavior remains intact.

---

# Tracking Pixel Card Preview Bug - Investigation & Implementation Plan

## Completed Work

- Added `TRACKING_PIXEL_PATTERNS` constant and `isTrackingPixel()` function to `src/components/article-list/utils/article-preview-utils.ts`
- Modified `extractFirstImageSrc()` to reject tracking pixels before returning URLs (lines 7-49)
- Added regression tests in `test_files/unit/components/article-list/utils/article-preview-utils.test.ts`
- Added test in `test_files/unit/components/article-list/views/card-view.test.ts`
- All unit tests pass (10 card-view tests, 6 article-preview-utils tests)

## Remaining Issue

The fix does **NOT** resolve the "Morning news brief" gray card issue.

## Updated Thesis

The gray card persists because of **cached/stale `coverImage` values** in existing feed items.

### Analysis

For items already stored in user data before the changes:

1. `coverImage` may have been set to the feed logo URL when no article image was found (previous fallback behavior)
2. Even after removing fallback logic, existing items retain their stored `coverImage` value
3. These items show a gray card if the feed logo was cached as `coverImage`

### Key Evidence

Looking at the non-working example XML:

- `content:encoded` contains: `<img src='https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=nx-s1-5846832' />`
- The NPR generic feed image is: `https://media.npr.org/images/podcasts/primary/npr_generic_image_300.jpg`

The parser (lines 752-772 in feed-parser-class.ts) already clears `coverImage` if it matches feed logo for shared artwork. However, two scenarios could still cause the gray card:

1. **Tracking pixel as feed logo**: If the feed logo URL itself matched tracking pixel patterns (it doesn't in this case), or
2. **Stale `coverImage` from previous parsing**: Items parsed before the changes may have `coverImage` set to a value that's now considered a tracking pixel, but the value persists in stored data

### Why My Fix Is Insufficient

My fix in `extractFirstImageSrc()` only affects:

- Runtime extraction from HTML content when `coverImage` is empty
- New items being parsed

But for **existing items** with `coverImage` already populated:

- The `resolveCoverImageSrc()` function (card-view.ts:15-34) returns `article.coverImage` directly (line 16)
- No validation of stored `coverImage` against tracking pixel patterns occurs

## New Thesis for Investigation

The issue is that `resolveCoverImageSrc()` should also validate the **stored `coverImage` value** at render time, not just during extraction.

Specifically, when `article.coverImage` contains a URL that would be rejected by `extractFirstImageSrc()` today (e.g., a tracking pixel), the card still renders an image container.

### Potential Trigger Paths

1. `coverImage` was set to the feed's generic image during a previous parse when no real image was available
2. The stored `coverImage` value is being used directly without re-validation

## Proposed Next Fix

In `resolveCoverImageSrc()` in `card-view.ts`, add validation of `article.coverImage`:

```typescript
function resolveCoverImageSrc(article: FeedItem): string | undefined {
  let coverImgSrc = article.coverImage;

  // Validate stored coverImage against tracking pixels
  if (coverImgSrc && isTrackingPixel(coverImgSrc)) {
    coverImgSrc = undefined;
  }

  // ... rest of existing logic
}
```

This requires either:

1. Exporting `isTrackingPixel` from article-preview-utils.ts, or
2. Duplicating the tracking pixel check in card-view.ts

## Handoff Prompt

Investigate why the "Morning news brief" item still shows a gray card after the tracking pixel fix was implemented:

1. Check if `article.coverImage` is already populated for this item (from prior parsing)
2. Determine whether `coverImage` contains the feed logo URL or some other stale value
3. Examine the relationship between `coverImage` and `fallbackIconUrl` for this specific item
4. Implement validation of stored `coverImage` values at render time if needed
