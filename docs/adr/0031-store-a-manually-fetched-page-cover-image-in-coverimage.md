# ADR 0031: Store a Manually Fetched Page Cover Image in `coverImage`

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1314](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1314),
which carries the change.

## Date

2026-10-17

## Context and problem

A dashboard card shows the article's cover image, and that image has always come
from the feed alone: `media:*` tags, an enclosure, or the first image in the
blurb. Plenty of feeds ship none, so the card has nothing to show even when the
article page carries a real hero image. #812 records two GitHub Blog items in
exactly that state, and #964 covers the blank card that results.

The plugin deliberately fetches article pages only when the reader opens an
article, and never at refresh (see
[Article Enrichment](../development/article-enrichment.md)). Any fix that reads
the page's image therefore has to make a request the current design does not
make, and has to decide where the result lives.

The stored image has no provenance today: `coverImage` means "the image this item
shows", and the refresh path already keeps an existing value when the feed itself
supplies none (`resolveExistingCoverImage` in
`src/services/feed-parser/feed-item-builder.ts`). A separate field would record
that the value came from the page, at the cost of a precedence rule in every
resolver that reads it.

## User stories

The decision is intended to preserve these core user expectations:

1. As a reader, I want to fill a blank card from the article page, so that the
   dashboard looks complete without me opening every article.
2. As a reader, I want the choice to be mine and the cost visible, so that the
   plugin does not contact publisher pages behind my back.
3. As a reader, I want the image I asked for to stay, so that a later refresh
   does not take it away again.

## Decision

A manual, per-article action reads the article page once, takes the page's
declared image, and stores it in the item's existing `coverImage` field.

- The action is offered from an article's context menu and from a control in a
  card's tag row, in Card and Feed views, while "Show cover images" is on, for
  items with an `http(s)` link.
- It reads `og:image`, then `twitter:image`, resolved against the article URL,
  and refuses a formula image, a tracking pixel, a `data:` URL, and any
  non-`http(s)` value. It never scans the page body, because a body's first image
  is usually a byline avatar or a site logo (#812).
- The page's text is not stored. The action does not produce Fetched content, does
  not mark the item read, and records neither `metadataFetchedAt` nor
  `fullContentFetchFailure`.
- One request per article link at a time; a repeated activation shares the
  request in flight.
- A found image is stored with no notice; a failure produces one Notice naming
  the reason.

## Consequences

### Benefits

- The image appears everywhere a cover already appears — the card, the feed-view
  hero, the Reader hero, and `{{image}}` in a saved note — with no other change.
- An existing value survives a refresh while the feed still ships no image,
  because the refresh already prefers a feed image but falls back to the stored
  one.
- Nothing changes for a reader who never uses the action: no fetch at refresh, no
  fetch at render, and no new setting.

### Trade-offs

- `coverImage` cannot tell a page-derived image from a feed one by itself, so
  [ADR 0032](0032-record-fetched-cover-image-provenance-and-restore-it.md)
  records the manual fetch's provenance and lets the reader put the feed's image
  back. A later refresh still replaces a page image the moment the feed ships its
  own cover, which is the intended "feed wins" rule.
- The action costs one page request, with the same proxy fallback and Fetch
  timeout the Reader uses. A paywalled page may still answer with a usable
  `og:image`, so a "restricted" page is not automatically a failure.
- The extraction signal (`ogImage`, `twitterImage`) joins
  `RawArticleMetadata`, which is the same bag the Reader's metadata pass fills.
  It is read, not persisted, by this action.

### Existing users and data

- No migration. `coverImage` is unchanged in shape; only its source may now
  differ.
- A page-derived image is written through the normal article-update path, so it
  is persisted and synced exactly like any other item field.

## Considered options

### Option A — a separate `pageImage` field (not chosen)

Would record provenance and let a refresh leave it untouched, but every consumer
(`resolveArticlePreviewImage`, the feed-view hero, the Reader hero, the save
template variables, the export and bundle formats) would need a new precedence
rule. #812 lists this as an open question for the automatic path; this ADR
answers it for the manual path only, where the simpler storage is enough.

### Option B — reuse the feed-side image extractor

`extractCoverImage` already reads `og:image`, but it then scans the body, which
#812's evidence shows picks the wrong image. It also has no `twitter:image`
support. Reusing it would have produced a worse image in exactly the case the
action exists to fix.

### Option C — a manual fetch that stores no page text, writing `coverImage` (chosen)

Keeps the request, the UI, and the stored shape small, and leaves the automatic
path (#812, #1030) free to make its own provenance decision.

## Historical precedent

Most readers that show a page-derived preview for an unopened item do it by
fetching and caching pages server-side (Feedly, Inoreader, NewsBlur); NetNewsWire
fetches on demand. RSS Dashboard has no server, so the equivalent is a
reader-initiated request — the same event-driven shape the Reader already uses
when it fetches on open.

## Implementation notes

- The page request reuses `fetchFullArticleContentWithOutcome`, so proxy
  fallback, the shared Fetch timeout, and blocked/restricted detection behave as
  they already do for the Reader.
- `extractPageMetadata` keeps taking only the `Document` its caller built, so
  [ADR 0007](0007-article-metadata-pipeline-seam.md)'s seam is unchanged;
  `ogImage` and `twitterImage` are two more raw slots.
- The extracted URL is warmed into the preview-image disk cache when image
  caching is on, so the card does not keep loading the image remotely.

## Related

- [ADR 0007 — Article Metadata Pipeline Seam](0007-article-metadata-pipeline-seam.md)
- [ADR 0032 — Record a Fetched Cover Image's Provenance and Restore It from the Feed](0032-record-fetched-cover-image-provenance-and-restore-it.md)
- [ADR 0022 — RSS-First Reader Content Selection](0022-rss-first-reader-content-selection.md)
- [Article Enrichment](../development/article-enrichment.md)
- [GitHub Issue #1314](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1314)
- [GitHub Issue #812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812)
- [GitHub Issue #964](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/964)
