# ADR 0033: Use the Page's Own Image as the Fetched Version's Hero

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-18

## Context and problem

The Reader shows an article in two versions: [[RSS content]], the feed's own
markup, and [[Fetched content]], extracted from the article page. Both versions
draw their hero from the item's stored cover chain (`coverImage`, then `image`,
then an iTunes image) and, when that is empty, from the first image in the body.

That works for the RSS version, which is the feed's own article. It is wrong for
the fetched version. A page usually declares its own lead image in `<head>` as
`og:image` (else `twitter:image`) — a signal distinct from anything the feed
carries and from the first image in the page body, which is often a byline
avatar, a promo, or a related-story thumbnail. Because the fetched hero reused
the cover chain, a feed that supplied any picture at all hid the page's real
hero: the fetched version showed the feed's image and the page's own image never
appeared. It also meant the fetched hero could only change when the stored cover
changed, so a cover fetched from the card after the reader had already shown the
fetched version left that version stale.

[ADR 0031](0031-store-a-manually-fetched-page-cover-image-in-coverimage.md) had
the manual [[Cover image fetch]] read the page's declared image into
`coverImage`, deliberately fill-only, so every cover surface changes together.
That left the automatic on-open path free to make its own provenance decision,
which this ADR records. [ADR 0032](0032-record-fetched-cover-image-provenance-and-restore-it.md)
then added the `coverImageFromPage` marker for the manual path only.

## User stories

The decision is intended to preserve these core user expectations:

1. As a reader, I want the fetched version to show the page's own hero, so that
   an article looks as its publisher intended even when the feed carries a
   different picture.
2. As a reader, I want the card and the RSS version to keep showing the feed's
   picture, so that a feed with its own image is unchanged.
3. As a reader, I want a note saved from the fetched version to hold the same
   hero the fetched version showed.

## Decision

The page's declared image is read during the Reader's full-article fetch and
kept on the item as `pageImage`. It is the hero of the fetched version, ranked
above the feed's cover chain, and the hero of a note saved from the fetched
version.

- The fetched version's hero is `pageImage` first, then the existing cover chain
  (`coverImage`, `image`, an iTunes image), then the first image in the body.
- The RSS version and the card keep reading the cover chain and never read
  `pageImage`, so a card that already shows a feed image does not change.
- `pageImage` is first-write-wins on its own presence rather than the
  `metadataFetchedAt` gate the other fetched metadata shares, so an item stored
  before the field existed still gains its page image on the next open, and a
  feed refresh preserves it either way.
- A candidate that is a formula image, a tracking pixel, a non-`http(s)` value,
  or the feed's own icon is refused, the same guards the cover path uses.
- The page request is the one the Reader already makes on open. No refresh-time
  fetch and no new setting are added; fetching pages for items the reader has
  not opened is [issue #1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030).

## Consequences

### Benefits

- The fetched version shows the image the publisher declared for the article,
  not the feed's image or an unrelated body image.
- The card, the RSS version, and an RSS-content save are unchanged, so a feed
  that ships its own picture keeps it everywhere it already showed.
- The fetched hero no longer depends on the stored cover, so a cover that
  changes (a manual fetch, a refresh) cannot leave it stale.

### Trade-offs

- One more optional `FeedItem` field, and one more rule writers must honour: a
  writer that supplies the page image must be first-write-wins, matching the
  other fetched metadata.
- The page image is stored for every fetched article, including ones whose feed
  already supplied a picture, so an item can hold two covers that differ. The
  fetched version reads the page image; every other surface reads `coverImage`.
- The image survives on the item even after the fetched content itself is gone
  (nothing stores the page body), so it is the last trace of the page on the
  item. That is intended: it is what a later save or render reuses.

### Existing users and data

- `pageImage` is additive and optional. No migration and no backfill: an item
  fetched before this change has no page image, so its fetched hero falls back
  to the cover chain it already showed — until the next time its article is
  opened, when the fetch stores one like any other item.
- A refresh preserves `pageImage` unchanged.

## Considered options

### Option A — keep the cover chain for both versions (rejected)

The status quo. Simple, but it never shows the page's own hero when the feed
supplies a picture, which is the bug this ADR fixes.

### Option B — overwrite `coverImage` with the page image (rejected)

Reusing `coverImage` — what the manual fetch does — would change the card and
the RSS version too, contradicting the promise that a feed's own image is not
displaced without the reader asking.

### Option C — a separate `pageImage` field with fetched-only precedence (chosen)

A new, additive field that only the fetched version and its save read. It keeps
the card and RSS version stable and gives the automatic path its own provenance,
which ADR 0031 anticipated.

## Implementation notes

- `persistFetchedPageImage` (`src/utils/reader-article-fetch.ts`) stores the
  value once, guarded; it sits beside `persistFetchedCoverImage`, whose
  fill-only rule for the card is unchanged.
- `resolveFetchedHeroUrl` (`src/utils/reader-article-render.ts`) is the shared
  fetched hero resolver; `resolveFallbackHeroUrl` and `resolvePageImageHeroUrl`
  are its two halves, and `placeHeroImage` still fills any remaining slot from
  the first body image.
- `feed-item-builder.ts` carries `pageImage` through a refresh like the other
  fetched metadata.

## Related

- [ADR 0031 — Store a Manually Fetched Page Cover Image in `coverImage`](0031-store-a-manually-fetched-page-cover-image-in-coverimage.md)
- [ADR 0032 — Record a Fetched Cover Image's Provenance and Restore It from the Feed](0032-record-fetched-cover-image-provenance-and-restore-it.md)
- [ADR 0007 — Article Metadata Pipeline Seam](0007-article-metadata-pipeline-seam.md)
- [Page image term in `CONTEXT.md`](../../CONTEXT.md)
- [GitHub Issue #812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812)
- [GitHub Issue #1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030)
