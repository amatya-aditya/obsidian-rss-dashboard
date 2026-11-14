---
id: module-enrichment
type: submodule-design
status: draft
title: Service area — article enrichment and image caches
parent: architecture
---

# Service area — article enrichment and image caches

## Responsibility

Give an article a better image than its feed supplied, and keep those images
available offline: read a page's declared cover image on demand, cache feed,
preview, and overlay images, and surface what happened when a fetch was
blocked.

Entry points: `PageCoverImageService`, `PreviewImageCache`,
`ImageCacheService` / `cacheImageUrl` (`image-cache-writer.ts`),
`cover-image-notice`.

## Boundary

A leaf: no service-to-service imports. It uses the fetch helpers and image-URL
utilities in `src/utils/`, and writes files through the vault plumbing there.

The page-reading logic itself (extraction, metadata precedence) lives in
`src/utils/` — `article-metadata.ts`, `full-article-fetch.ts`,
`fetch-target-guard.ts` — behind the seam
[ADR 0007](../../docs/adr/0007-article-metadata-pipeline-seam.md). This area
orchestrates those reads; it is not a general page scraper.

## Invariants

- **One request, declared image only.** A manual cover fetch reads the image
  the page declares and makes no second request
  ([ADR 0031](../../docs/adr/0031-store-a-manually-fetched-page-cover-image-in-coverimage.md)).
- **Provenance is recorded and reversible.** A page-derived cover is marked on
  the item so the control can offer to restore the feed's own image locally,
  with no request ([ADR 0032](../../docs/adr/0032-record-fetched-cover-image-provenance-and-restore-it.md)).
  The fetched reader version keeps its own `pageImage`
  ([ADR 0033](../../docs/adr/0033-use-the-pages-own-image-as-the-fetched-heros-source.md)).
- **A blocked fetch says so.** A WAF/bot challenge is a blocked fetch with its
  own message and retry, distinct from a paywall
  ([ADR 0034](../../docs/adr/0034-treat-a-bot-challenge-as-a-blocked-fetch.md)).
- **No identity override.** Outbound requests send no User-Agent override
  ([ADR 0025](../../docs/adr/0025-identify-outbound-requests-as-obsidian.md)).
- **Caching is not fetching.** The caches key on the image URL and never
  trigger a page fetch on their own.
