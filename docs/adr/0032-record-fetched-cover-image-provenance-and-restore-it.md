# ADR 0032: Record a Fetched Cover Image's Provenance and Restore It from the Feed

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1330),
which carries the change. Amends
[ADR 0031](0031-store-a-manually-fetched-page-cover-image-in-coverimage.md)'s
"no provenance" trade-off for the manual path.

## Date

2026-10-18

## Context and problem

[ADR 0031](0031-store-a-manually-fetched-page-cover-image-in-coverimage.md)
lets a reader fill a blank card with the article page's declared image. The
image goes into `coverImage`, the same field the feed writes, and nothing
records where it came from. Once fetched, the choice is permanent from the
dashboard: the feed's own image is gone from the item, and a refresh only
replaces the value when the feed ships a cover of its own.

That is a problem in exactly the case the action exists to fix. A page whose
`og:image` is a site logo, or a stale hero from an old campaign, produces a card
the reader wants to undo — and there is no undo. The item cannot even explain
itself: `coverImage` is "the image this item shows", with no statement of which
source won.

The parser already knows what the feed supplies, and the item already stores
everything that answer needs: the blurb, `itunes.image`, `image`, and an image
`enclosure`. Recomputing the feed's image therefore needs no request, no new
storage of feed data, and no refresh.

## Decision

- A manual fetch records its provenance in one new optional field,
  `coverImageFromPage`, written together with the image. The automatic card fill
  writes it too when it copies the fetched page's image onto an item with no
  picture of its own, because that cover is page-derived as well (amended
  2026-10-19, [#1354](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1354)).
  Absent means the cover is the feed's own, so items stored before the field
  existed need no migration.
- The marker is dropped by every writer that puts a feed image back: a refresh
  that finds the feed's own cover, the YouTube-thumbnail step, the feed's shared
  logo blanking, and the settings dedupe that keeps one of two covers. The
  restore drops it too.
- **Restore** recomputes the feed's cover from the data the item already stores,
  using the parser's own precedence — blurb scan, then `itunes.image`, `image`,
  and an image enclosure — writes it, and clears the marker. It makes no request
  and warms no cache.
- When the feed supplies no image, restore clears `coverImage`. The card returns
  to its blank or summary state and the control returns to the fetch label.
- The affordance keeps its existing place and becomes one control whose role
  follows the item's state. Both entry points — the tag-row control and the
  context menu — read one helper:

  | State                        | Label                              | Icon         | Role    |
  | ---------------------------- | ---------------------------------- | ------------ | ------- |
  | no cover                     | Fetch and replace cover image      | `download`   | fetch   |
  | feed cover                   | Replace cover image from the fetch | `download`   | fetch   |
  | fetched cover, feed has one  | Restore cover image from feed      | `rotate-ccw` | restore |
  | fetched cover, feed has none | Remove fetched cover image         | `rotate-ccw` | restore |

- Surfaces are unchanged: the tag-row control and the context menu, in Card and
  Feed views, while cover-image display is on. List view renders no cover, so it
  offers neither role.
- Cover surfaces read `coverImage` before `image`, so the image a fetch stored is
  the one the card, the feed-view hero and a saved note's `{{image}}` show. The
  feed-view hero read `image` first, which this decision corrects; the card and
  the save template already read `coverImage` first. The Reader's RSS content
  version does not follow it once the marker is set: that version's hero is the
  feed's own image, recomputed the same way restore does (amended 2026-10-19,
  [#1354](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1354)).

## Consequences

### Benefits

- A wrong fetch has an undo, and it costs nothing: the feed's image comes back
  from stored data, offline.
- The stored item can now explain its own cover, which the refresh rule already
  relies on ("the feed wins, otherwise the stored value stays").
- Restore touches only the cover and the marker: the item is not marked read, no
  page content is stored, and no success Notice is shown. The card, the feed-view
  hero and a saved note's `{{image}}` all follow the field; the Reader's RSS
  content version keeps the feed's own image (amended 2026-10-19,
  [#1354](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1354)).
- Existing items need no migration and are not backfilled.

### Trade-offs

- One more optional field on `FeedItem`, and one more rule for writers to
  honour: a writer that supplies a feed image without clearing the marker would
  offer a restore that reverts its own value.
- Deciding between the two restore labels means knowing whether the feed
  supplies an image, so a marker-carrying card runs the blurb scan on render.
  The marker keeps that cost to page-derived covers only — a manual fetch or the
  automatic fill — instead of every card on every render.
- Restore applies the parser's article precedence to every item, including
  podcasts and videos. For a podcast whose blurb image and `itunes.image` differ,
  the restored image can differ from the one the parser originally picked; the
  feed-level images some podcasts rely on are not stored on the item at all.
- A durable "remove cover" that survives a refresh is a different decision: the
  feed wins on refresh today, so a removed feed cover returns on the next
  refresh. This ADR deliberately does not offer that action.

### Existing users and data

- `coverImage` keeps its shape; `coverImageFromPage` is additive and optional.
- No backfill. An image fetched before this change carries no marker, so its
  item keeps offering the replace action only: there is nothing left to recover
  the original feed image from, and guessing would be worse than the missing
  action.

## Considered options

### Option A — a separate `pageCoverImage` field with display precedence

The feed's value would never be overwritten, so a restore would only need to
stop preferring the page image. Every consumer would then need the rule:
`resolveArticlePreviewImage`, the feed-view hero, the Reader hero, the save
template variables, the export and bundle formats. That is a wider change than
one marker plus one local recompute, and it leaves two competing covers on the
item.

### Option B — recompute and compare at render time, with no marker

No schema change, and the item stays in one field. But every card would run a
`DOMParser` pass over its blurb on every render just to decide a label, for the
rare case where a page image is showing. The marker confines that work to items
the reader actually fetched.

### Option C — a targeted feed refresh instead of a local recompute

Hits the network and can change more than the image — title, blurb, author,
dates — which is not what "put the image back" promises.

### Option D — a "Cover image" submenu with fetch, use the feed's image, and remove

Rejected for two actions, and a _durable_ remove is a separate decision: it would
need its own marker and a refresh precedence change, because the feed wins today.

## Related

- [ADR 0031 — Store a Manually Fetched Page Cover Image in `coverImage`](0031-store-a-manually-fetched-page-cover-image-in-coverimage.md)
- [ADR 0007 — Article Metadata Pipeline Seam](0007-article-metadata-pipeline-seam.md)
- [Article Enrichment](../development/article-enrichment.md)
- [Cover image terms in `CONTEXT.md`](../../CONTEXT.md)
- [GitHub Issue #1330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1330)
- [GitHub Issue #1314](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1314)
- [GitHub Issue #812](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/812)
- [GitHub Issue #1030](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1030)
