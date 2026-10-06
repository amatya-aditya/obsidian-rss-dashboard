---
status: proposed
created: 2026-08-16
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812"
milestone: ""
owner: unassigned
workstream: "article metadata"
sequence: null
depends_on:
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263"
release_requirement: ""
implementation: ""
---

# Opt-In Cover Image Fallback Plan

This plan covers plugin-wide cover image retrieval when a feed item does not already carry a usable image. It is intentionally opt-in, off by default, and should follow the UI and interaction rules in [docs/development/design-spec.md](../development/design-spec.md).

## Status update (2026-10-06)

The article-metadata pipeline this plan waited on now exists: page-metadata extraction and resolution shipped in #247 slice 3 (`src/utils/article-metadata.ts`), and slices 4 to 7 store the resolved fields on the item. It does **not** extract an image yet: `RawArticleMetadata` has no `og:image` or `twitter:image` signal, so this plan's first job is to add one, alongside the existing signals, rather than build a fetch of its own.

Two things have changed since this plan was written:

- **The page is already fetched when an article is opened.** The Reader and `ArticleSaver` fetch the full article and read its `<head>` once. Using the page image from that fetch costs no extra request. Only fetching pages at refresh time, to fill cards before an article is ever opened, is new network traffic. That second case is what the opt-in below is really for.
- **A cover-image display setting already exists.** Settings > Display > "Show cover images" (`display.showCoverImage`) turns card images off entirely. Anyone who doesn't want images already has that switch; the question for this plan is whether they also need a separate one for the fetching.

## Evidence from testing #247 (GitHub Blog, sampled 2026-10-06)

Found with `https://github.blog/feed/` in the fixture vault ([issue #812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812)):

- The first four items in the stored shard have `coverImage: ""` and `image: ""`. Their feed entries carry no `media:*`, no `<enclosure>` and no `<img>` in `content:encoded`, so a card has nothing to show. Items whose feed entries do carry an image get a card image.
- The article pages have page-level images the plugin ignores. "AI is changing developer work…" has `og:image` `…/uploads/2026/03/branchingout.png`, a real hero. "ReviewBench…" has `og:image` `…/uploads/2026/01/generic-invertocat-logo.png`, a site-wide placeholder that would look wrong on every card.
- A "first image on the page" rule picks the wrong image. The author's GitHub avatar (`avatars.githubusercontent.com/u/78101617`, shown as an image labelled "78101617") sits in the byline ahead of the body, and the page's own navigation markup has images before the article.

These shape the design below: take the declared page image (`og:image`, then `twitter:image`) instead of scanning the body, and guard against placeholders and avatars.

## Design notes added by the #247 findings

- Resolve the page image in `resolveArticleMetadata` like the other signals: absolute `http(s)` URLs only, and the same formula-injection guard other image paths use (`firstNonFormulaImageUrl`).
- Fill only: use the page image when the feed gave none. A feed image still wins, as the product decisions below already say.
- Guard against non-hero images: an image equal to the feed's own icon, a URL repeated across the feed's items (site-wide placeholder), avatar hosts, and images known to be tiny.
- A refresh rewrites `coverImage` from the feed (`resolveExistingCoverImage`), so a page-derived image must survive it, following the first-write-wins rule that `metadataFetchedAt` already sets for the other metadata fields.

## Open questions

These are not decided and need an answer before this plan is accepted.

1. **Should there be a setting at all?** The plan says opt-in and off by default, because it assumed a fetch at refresh. The cases split:
   - Using the image from a page the user already opened costs nothing extra, so a separate toggle may be unnecessary; "Show cover images" already hides every card image.
   - Fetching pages at refresh for imageless items contacts publisher sites for items the user may never read. That is the case that justifies a toggle (see the next question).
     One option is no new setting for the free case plus an opt-in only for refresh-time fetching; another is a single opt-in covering both. Which one?
2. **Is there any case where someone wants it off?** Candidates to weigh:
   - Privacy: fetching an article page tells the publisher the reader's IP address and that they follow the feed, before they open anything.
   - Data and battery on mobile, and rate limits or blocks on sites that dislike bulk fetching.
   - A deliberately text-only or low-clutter dashboard. "Show cover images" covers this, so a second switch would only matter for the fetching.
   - Publisher placeholders and logos as card images that look worse than none, which better guards might make a non-issue.
   - Offline or metered use, where a failed fetch per item adds delay.
     Are any of these enough to justify a setting beyond "Show cover images"?
3. **Fill or replace?** Should a page image ever replace a feed image, for example when the feed's image is a tiny thumbnail and the page has a full-size hero? The default here is fill only, so existing cards don't change.
4. **Placeholder detection.** How aggressive should the guard be: a known-placeholder list, "the same URL on N items of one feed", or an image-size check that needs an extra request?
5. **When to fetch.** On article open only (free), at feed refresh for imageless items (the original plan, with bounded concurrency), or lazily when a card scrolls into view?
6. **Where the result is stored.** The existing `image` and `coverImage` fields, or a new field so a refresh can tell a page-derived image from a feed one?

## Dependency note

The extraction mechanism in this plan is superseded by the article-metadata
pipeline being charted in [#263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263).

That pipeline extracts `og:image` from the article page's `<head>` in the same
pass that resolves description, author, canonical URL, and language, so this
plan should **consume** a resolved `metadata.image` rather than implement its
own fetch-and-parse in the refresh path. A second independent page-fetch path
is precisely the sprawl [#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247)
exists to remove.

The product decisions below stand unchanged and are the reason this plan
survives: opt-in, off by default, no extra fetch when the toggle is off,
bounded concurrency, feed-provided images always win, and the resolved URL
persists on the item. Only the "how" is replaced.

## Goal

Add a setting that lets the plugin fetch an article page once, read `og:image`, then persist the resolved URL onto the feed item so Card view and saved-item reuse can show a stable cover image.

## Red-Green TDD Shape

### Red

1. Add parser tests that fail when:
   - the new setting is off and no extra article-page request is made,
   - the setting is on and a missing feed image is resolved from `og:image`,
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
