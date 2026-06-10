# Investigation: RSS Card Image Extraction Failure

## Findings

### Hypothesis 1 — Regex or parser drops URLs containing `%` encoded characters
**Status: Ruled out**

The `extractImageFromContent` regex in `custom-xml-parser.ts` (line 415) uses:
```js
/<img[^>]+src=["']([^"']+)["'][^>]*>/i
```
The character class `[^\'"]+` correctly captures any character except quotes, including `%`, `&`, `+`, `!`. Verified via test script.

### Hypothesis 2 — The `!` character and offset parameters in Brightspot URLs cause rewrite to fail
**Status: Confirmed and fixed in `src/utils/image-url-utils.ts`**

The `optimizeImageUrl` function had regex patterns that did NOT match NPR Brightspot URLs:
- Crop pattern `/\/crop\/\d+x\d+\//g` failed on `/crop/8552x5292+0+0/` (has `+0+0` offset after dimensions)
- Resize pattern `/\/resize\/\d+x\d+(\/|$)/g` failed on `/resize/8552x5292!/` (has `!` before the `/`)

URLs were returned unchanged. They were still valid and loadable, but not CDN-optimized.

### Hypothesis 3 — The tracking pixel is being selected instead of the article image
**Status: Confirmed and fixed in `src/services/feed-parser/feed-parser-class.ts`**

In `extractCoverImage`, the fallback loop at lines 266-298 would pick the NPR tracking pixel (`npr-rss-pixel.png`) because its URL contains `/images/tracking/` and the old filter only checked for `.jpg`/`.png`/etc. or `image` substring. The `firstImg` path (lines 250-264) returns the first `<img>` unconditionally if `src` starts with `http`, but if a page begins with a tracking pixel, the loop becomes a second chance to pick *any* image — and it could still land on the pixel.

`isTrackingPixel()` and `TRACKING_PIXEL_PATTERNS` were added. Both the `firstImg` path and the fallback loop exclude tracking pixel URLs.

### Hypothesis 4 — Image dimensions in the URL exceed a hardcoded size limit
**Status: Ruled out**

No dimension threshold check exists in the image processing pipeline. The only place dimensions are parsed is in `optimizeImageUrl` for URL rewriting, not for validation/rejection.

---

## Work completed

- `src/utils/image-url-utils.ts`: Brightspot regex patterns updated to handle `+0+0` crop offsets and `!` resize delimiters.
- `src/services/feed-parser/feed-parser-class.ts`: `isTrackingPixel()` filter applied in both `firstImg` and fallback loop paths for `<img>` extraction.
- `test_files/unit/services/feed-parser/feed-parser-class.test.ts`: regression test added covering an NPR-like feed with a tracking pixel before the article image.
- `test_files/unit/utils/image-url-utils.test.ts`: new regression test file created and import path corrected during iteration.

---

## Next steps

1. **Bug Resolution Complete**
   - The failing tests (`image-url-utils.test.ts` and `feed-parser-class.test.ts`) were fixed.
   - The full test suite passes.
2. **Handle feed-side missing images**
   - We observed that some NPR articles genuinely do not provide an image in the feed, resulting in `<img src='undefined' ... />` or similar missing image states.
   - We need to implement a fallback mechanism to use the feed's favicon or icon when an article lacks a valid image.
