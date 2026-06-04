# Opt-In Cover Image Fallback Plan

This plan covers plugin-wide cover image retrieval when a feed item does not already carry a usable image. It is intentionally opt-in, off by default, and should follow the UI and interaction rules in [docs/design/design-spec.md](../design/design-spec.md).

## Goal

Add a setting that lets the plugin fetch an article page once, read `og:image` first and `twitter:image` second, then persist the resolved URL onto the feed item so Card view and saved-item reuse can show a stable cover image.

## Red-Green TDD Shape

### Red

1. Add parser tests that fail when:
   - the new setting is off and no extra article-page request is made,
   - the setting is on and a missing feed image is resolved from `og:image`,
   - the fallback uses `twitter:image` when `og:image` is absent,
   - the resolved image is persisted on the item after refresh,
   - existing feed-provided image data still wins over article-page fallback.
2. Add card-view tests that fail when items with persisted `item.image` do not render a cover image after `coverImage` is empty.
3. Add a settings test that fails until the new toggle is present and defaults to off.

### Green

1. Add a new Display setting such as `Fetch cover image from article page when missing from feed`.
2. Thread the setting into `FeedParser` initialization.
3. Implement an article-page fallback fetch in the feed refresh/add path only.
4. Keep the request bounded and cheap:
   - only fetch when the item is still missing an image after feed parsing,
   - skip invalid or non-http article links,
   - use a small concurrency cap,
   - persist the resolved URL on the item so it becomes the cache.
5. Update Card view and any related preview surfaces to use the persisted item image consistently.

### Refactor

1. Extract a shared image-precedence helper if the parser and renderer need the same ordering.
2. Keep the precedence explicit and stable:
   - existing feed image fields first,
   - feed HTML image extraction next,
   - article-page OG fallback last.

## Acceptance Criteria

1. Toggle is off by default.
2. No extra article-page fetch occurs when the toggle is off.
3. The Atlantic-style feeds with missing feed images can populate cards after refresh when the toggle is on.
4. Persisted items keep their resolved cover image across restart.
5. UI wording stays compact and consistent with the design spec.

## Likely Files

- [src/services/feed-parser.ts](../../src/services/feed-parser.ts)
- [src/components/article-list.ts](../../src/components/article-list.ts)
- [src/types/types.ts](../../src/types/types.ts)
- [src/settings/tabs/display-settings-tab.ts](../../src/settings/tabs/display-settings-tab.ts)
- [main.ts](../../main.ts)
- [test_files/unit/services/feed-parser.test.ts](../../test_files/unit/services/feed-parser.test.ts)
- [test_files/unit/components/article-list.test.ts](../../test_files/unit/components/article-list.test.ts)

## Verification

1. Run the parser tests for enabled/disabled fallback behavior.
2. Run the card-view tests for persisted image rendering.
3. Run the display-settings test for the new toggle.
4. Finish with the focused unit suite for the touched services.