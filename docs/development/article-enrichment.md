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
([ADR 0007](../adr/0007-article-metadata-pipeline-seam.md)). The page's declared
image (`og:image`, else `twitter:image`, else a JSON-LD `image`) is stored beside
them as `pageImage`, first-write-wins on its own presence, and is the hero of the
fetched version
([ADR 0033](../adr/0033-use-the-pages-own-image-as-the-fetched-heros-source.md)).
A restricted or blocked response's `<head>` declares one too, so the image is
read from that head as well; a formula image, a tracking pixel, the feed's own
icon, and a known avatar host are refused.

Page-derived data therefore exists only for articles that have been opened.

The Reader labels the two sources **RSS content** (the feed-provided version,
including Atom and JSON Feed) and **Fetched content** (the extracted article
page). Either source may contain the complete article; these names distinguish
origin, not completeness. See the [reader-source ADR](../adr/0022-rss-first-reader-content-selection.md).

The two versions can also disagree about **media**, and the most visible case is
video. A feed entry that embeds a YouTube video shows a click-to-play placeholder
in RSS content; the fetched version of the same article shows nothing, because
these pages build their player with script after load, leaving no iframe for the
sanitizer to recognize and no page-declared video the plugin will trust. That
commitment is deliberate, not an oversight: the fetched version mirrors what its
source serves ([#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168)),
and the measurement behind it, including which page-side video signals were
rejected and why, is recorded in
[fetched-page video signals](../archive/investigations/2026/fetched-page-video-signals.md).
The user-facing half of this is the FAQ entry in
[troubleshooting](../user/troubleshooting.md#the-video-disappears-when-you-switch-to-the-fetched-version).

Both readers render RSS content immediately while the page fetch runs. A
successful fetch offers **Show fetched content** instead of replacing text under
the reader; **Show RSS content** switches back. Each version keeps its DOM and
scroll position for that display, and switching does not fetch again. The feed
body remains unchanged. Metadata still uses first-write-wins, but a result
from an obsolete display (including closing or reopening the same article) is
ignored before any metadata or UI write.

The pending status is a polite live region. Short or empty feed content also
gets a static skeleton, so it remains motion-free with or without reduced
motion. Failure leaves RSS readable and resolves the status; restricted
results retain the existing restriction banner. A page that answers with a bot
challenge is a **blocked** fetch rather than a restricted one: it carries no
paywall wording, is remembered like a network failure, and shows the banner
with **Try again** and **Open in browser**
([ADR 0034](../adr/0034-treat-a-bot-challenge-as-a-blocked-fetch.md)). The direct request, sequential
proxy attempts, and SagePub abstract fallback share one **Fetch timeout**
budget. The underlying Obsidian request cannot be cancelled, so an expired
request is abandoned and its late result is ignored.

This reader change does not add a save-source selector, template provenance,
or saved-note upgrades. Those saving decisions remain separate work. Source
parity detection is also deferred: no byte-equality or 95–100% similarity rule
is assumed or implemented.

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

A reader can ask for the page's image by hand, though: **Fetch and replace cover
image** in an article's right-click menu, or the same control at the right end of
a card's or feed item's tag row. That action fetches the page once, takes its
declared image (`og:image`, then `twitter:image`), and stores it in `coverImage`
with the `coverImageFromPage` marker, so the card, the feed-view hero and a saved
note's `{{image}}` pick it up. The Reader's RSS content version does not: its
hero is the feed's own image, recomputed from the stored fields when the marker
says a page image replaced the cover (#1354). It reads no page body — a body's
first image is usually a byline avatar or a site logo — stores no page content,
and changes no other field. It is manual and one request per activation; the
automatic alternatives remain
[#812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812) and
[#1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030).
See [ADR 0031](../adr/0031-store-a-manually-fetched-page-cover-image-in-coverimage.md).

The same control also undoes that choice. A cover the fetch stored offers
**Restore cover image from feed** — or **Remove fetched cover image** when the
feed supplies no image of its own — which recomputes the feed's cover from the
fields the item already stores, using the precedence above (blurb scan, then
`itunes.image`, `image`, and an image enclosure). The restore is local: no page
request, no cache warm, no other field touched. A refresh that finds the feed's
own image takes it back on its own, clearing the marker. See
[ADR 0032](../adr/0032-record-fetched-cover-image-provenance-and-restore-it.md).

A saved note's Markdown body leads with the hero (`![Hero image](...)`) unless
the note template places `{{image}}` in the note body, which is the author
choosing where the image goes, as in Web Clipper. `noteLeadsWithHero`
(`src/services/article-template/note-template.ts`) decides it for every save
path: the saver's RSS, Fetched and fetch-failure builders, and the Reader's own
Markdown (`buildReaderSaveMarkdown`). An `{{image}}` that sits only in a leading
frontmatter block (`cover: {{image}}`) does not count, so that body keeps its
hero. Neither does an `{{image}}` the item cannot fill (`templateImageUrl` is
empty, as for a feed with no cover whose image comes only from the fetched
page): the body keeps its hero, so the note is not left with no image. The hero the body would have led with can differ in size from `{{image}}`,
which is why the "already in the body" check could not prevent the repeat.

The same condition also removes the body's own copy of that image. The article's
HTML usually repeats the cover at another size or behind a resizer path, so
`removeTemplateImageFromBody` (same file) drops the first `<img>` that is
`{{image}}`: the same host and path ignoring the query and a WordPress size
suffix, or else the same distinctive file name. A generic name such as
`image.jpg` never matches, and only that first image goes. Each save path applies
it to the HTML before conversion, as the hero decision itself is made.

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

The one exception is manual: the per-card cover-image fetch contacts the article
page when the reader asks for it, for one item at a time, and stores only the
image. A refresh still never fetches article pages.

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
- [#964](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/964) — placeholder for preview-less cards
- [#812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812) — use the article page's image when the feed has none
- [#1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030) — opt-in page enrichment at refresh
