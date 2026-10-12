# Article Enrichment: Previews, Pages, and Fetch-on-Open

How RSS Dashboard builds the preview text and card image for an article, where
that data comes from, and why the plugin deliberately fetches an article page
only when it is opened. It records the trade-off behind a preview-less card
([#964](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/964)) so
the comparison against other readers does not have to be re-derived.

## Where an article's data comes from

A card can show two things: preview text and a cover image. They are resolved
separately, and either can be empty.

### Parse time: the feed only

When a feed refreshes, the parser reads the feed's own markup — RSS
`<description>`, Atom `<summary>`, `content:encoded`, `<enclosure>`, `media:*`,
and the first `<img>` in the blurb — into the item's `summary`, `description`,
`content`, `coverImage`, and `image`. `extractCoverImage` runs here, at parse
time, and never sees the article page
([ADR 0007](../adr/0007-article-metadata-pipeline-seam.md)).

A refresh fetches only the feed. It never fetches article pages.

### On open: the article page

Opening an article in the Reader (or saving it) fetches the page once: the
plugin extracts the page's `<head>` metadata, runs Readability for the body, and
resolves the page signals against the feed's fallbacks. `planMetadataWrite`
stores the resolved result on the item as `publisherDescription`, `language`,
`authors`, `canonicalUrl`, `metadataFetchedAt`, and `languageSource`, and a
later refresh never overwrites them — first-write-wins
([ADR 0007](../adr/0007-article-metadata-pipeline-seam.md)).

Page-derived data therefore exists only for articles that have been opened.

### Preview text

`getArticlePreviewSummaryText` returns the guarded feed blurb first, then the
reader-fetched `publisherDescription`, then the feed's own `summary`,
`description`, or `content` (#959). It returns an empty string when none of
them is usable.

The keyword filter's preview scope uses a sibling, `getArticleFilterSummaryText`,
which reads the feed's own fields only and deliberately excludes
`publisherDescription` — otherwise opening an article could change whether a
rule matches it (#888).

### Preview image

`resolveArticlePreviewImage` checks the stored `coverImage` and `image`, then
the first `<img>` in `content`, then in `summary`, then an `image/*` enclosure.
It never uses the article page's image; that is
[#812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812).

## Why the plugin fetches pages only on open

Fetching a page per item per feed at refresh would reverse a deliberate choice.
The reasons:

- **Privacy.** A refresh that fetched every page would tell every publisher the
  reader's IP and that they follow the feed, for articles the reader may never
  open.
- **Request volume.** A 40-item feed becomes 40 extra requests per refresh, per
  user, multiplied by every feed and every device.
- **Reliability and cost.** Rate limits, bot blocks, and slow or failing sites
  would slow refreshes and turn a feed refresh into partial failures. A
  server-side aggregator can absorb this with shared caches; a local plugin
  cannot.
- **Local-first storage.** Only articles that were opened carry page metadata,
  keeping the stored data proportional to what was read.

## How other readers do it

| Reader                                                 | Enrichment model                                                                                                                     | A preview-less item shows                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| NetNewsWire (plain), Firefox, Vienna, FreshRSS default | None: render the feed as-is                                                                                                          | Title only                                |
| NetNewsWire **Reader View**                            | On-demand fetch, server-assisted (Feedbin-hosted)                                                                                    | Title only until opened                   |
| FreshRSS **Readable**, Miniflux full-text              | Opt-in per feed, fetched at refresh                                                                                                  | Title only unless that feed is configured |
| Feedly, Inoreader, NewsBlur                            | Server-side fetch and cache; Feedly fetches full content server-side only when it detects a snippet and the article is not paywalled | A summary and/or lead image appear        |

The readers that show a page-derived preview for an unopened item do so by
fetching and caching pages server-side. No reader extracts an image from a feed
that ships none.

## What a preview-less item shows

For an unopened item with no feed text and no feed image — the case in the
reference fixture below — there is nothing to preview and the card is blank
([#964](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/964)). A
placeholder is the local fix. Fetching pages at refresh to fill these cards is a
separate, opt-in idea
([#1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030)).

A placeholder fixes a _blank_ preview, not a _wrong_ one. A page's site-wide
`<meta name="description">` can pass the resolver's degenerate-value guard and be
stored as `publisherDescription` even though it does not describe the article;
the Stack Overflow pages are the example. Rejecting that boilerplate is separate
work.

## Reference fixture

`test_files/unit/fixtures/rss/stackoverflow-empty-descriptions.xml` is the Stack
Overflow Blog feed captured on 2026-10-09. It models the edge case:

- 40 items, 8 with an empty `<description>`;
- no `content:encoded`, `<enclosure>`, `media:*`, or `<img>` markup anywhere, so
  no item has a feed image.

`test_files/unit/services/feed-parser/stackoverflow-empty-descriptions.test.ts`
parses it and pins those facts. It is public publisher data, committed as-is.

## Related

- [ADR 0007: Article-metadata pipeline seam](../adr/0007-article-metadata-pipeline-seam.md)
- [Feed Data Lifecycle](./data-flow.md)
- [Fixture Vault for Manual Testing](./fixture-vault.md)
- [Cover-image fallback plan](../plans/812-cover-image-fallback.md)
- [#964](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/964) — placeholder for preview-less cards
- [#812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812) — use the article page's image when the feed has none
- [#1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030) — opt-in page enrichment at refresh
