# Article-metadata pipeline seam

## Status

accepted

## Decision

Page-metadata extraction is a new pair of pure functions in a new file,
`src/utils/article-metadata.ts`: `extractPageMetadata(doc: Document):
RawArticleMetadata` and `resolveArticleMetadata(pageRaw: RawArticleMetadata,
feedFallbacks: {...}): ResolvedArticleMetadata`. Neither takes a URL, HTML
string, or service dependency — `extractPageMetadata` reads the one `Document`
instance the caller already built and is about to hand to `Readability`;
`resolveArticleMetadata` is pure precedence logic over two already-extracted
signal bags. See [[Page metadata]], [[Feed metadata]], [[Raw article
metadata]], [[Resolved article metadata]] in `CONTEXT.md`.

`fetch-helpers.ts`'s `parseArticleContent` calls `extractPageMetadata(doc)`
before `new Readability(doc).parse()`, matching the fixed pipeline order
(`fetch -> extract head metadata -> Readability.parse() -> resolve`).
Extraction runs on every response with non-trivial HTML — reusing the existing
`< 200 chars` guard as the only skip condition — regardless of whether the
response is later classified as blocked or restricted. A paywalled page's
`<head>` is frequently real signal even though its body is gated; a
bot-challenge page's `<head>` just comes back empty on its own, needing no
separate gate. `extractPageMetadata` swallows internal errors and returns an
all-empty `RawArticleMetadata`, matching `parseArticleContent`'s existing
swallow-and-return-empty contract, so a metadata-extraction bug never fails
the whole fetch.

`FullArticleFetchResult` gains `pageMetadata?: RawArticleMetadata` (raw, not
resolved) alongside the existing `content` and `failureType`. Resolution is
deliberately *not* done inside `full-article-fetch.ts` or `fetch-helpers.ts`:
those layers only ever see a URL, and #264's language precedence and #265's
description precedence both fold in feed-level fallbacks (feed `<language>`,
feed-supplied `<description>`) that only the caller (`reader-view.ts`,
`article-saver.ts`, `feed-parser-class.ts`) has. Those callers invoke
`resolveArticleMetadata` themselves once they hold both the fetch result and
their own feed context.

`ResolvedArticleMetadata` is transient. It is never persisted onto `FeedItem`
as a nested object. `FeedItem` stays flat, consistent with every field on it
today; #246 and #247 each pick which of `ResolvedArticleMetadata`'s fields (if
any) get copied onto a flat `FeedItem` property, and whether a source/
provenance field (`languageSource`, `descriptionSource`) is worth persisting
alongside it is a per-field call left to those tickets, not forced either way
by this seam.

`extractCoverImage` (`feed-parser-class.ts`) and `extractContentFromDocument`
(`article-saver.ts`) are not part of this seam. `extractCoverImage` resolves
images from feed-supplied `content`/`description` HTML at RSS-parse time — it
never sees the fetched page `Document` this extractor operates on, so it is a
different pipeline stage, not a duplicate implementation. `
extractContentFromDocument` and the private `convertRelativeUrlsInContent` it
alone calls have no callers anywhere in `src/` — confirmed dead code, to be
deleted outright rather than migrated into the new extractor.

## Considered Options

- **Extractor as a `services` module.** Rejected: extraction and resolution
  are pure functions over an already-parsed `Document` and a plain fallback
  object — no settings, no I/O, no cross-module state. `utils` is reachable
  from `services` under the enforced `views/components/modals/settings ->
  services -> utils/types` direction, so nothing loses access by placing it
  there.
- **Single extract-and-resolve function instead of a raw/resolved split.**
  Rejected: #265 and #264 both needed every raw signal to measure precedence
  against real publishers. Collapsing the two steps would make a future
  precedence change untestable without re-deriving HTML fixtures.
- **Resolve inside `full-article-fetch.ts` before returning
  `FullArticleFetchResult`.** Rejected: that layer only has a URL and proxy
  config, never the feed context (feed-level language, feed-supplied
  description) that resolution's precedence order requires. Threading feed
  context down into the fetch layer would invert the dependency for no
  benefit, since every caller already holds both pieces.
- **Skip extraction on blocked/restricted responses.** Rejected: paywalled
  pages routinely serve intact `<head>` metadata alongside a gated body — the
  case the ticket explicitly called out. The existing short-response guard
  already filters out the bot-challenge pages that would contribute noise.
- **Persist `ResolvedArticleMetadata` wholesale on `FeedItem`.** Rejected: it
  would commit every future metadata field to persistence regardless of
  whether it's ever displayed from storage versus recomputed per-render, and
  would preempt #246/#247's own per-field provenance decisions.
- **Fold `extractCoverImage` or `extractContentFromDocument` into the new
  extractor.** Rejected for different reasons: the former operates on a
  different input at a different pipeline stage, so there is nothing to
  merge; the latter has no callers, so there is nothing to migrate.

## Consequences

`article-saver.ts` and `feed-parser-class.ts` stay under their line-count
threshold by construction — the new logic never lands in either file, and
deleting the dead `extractContentFromDocument`/`convertRelativeUrlsInContent`
pair shrinks `article-saver.ts` by roughly 50 lines instead of relocating
them.

`RawArticleMetadata` and `ResolvedArticleMetadata` get their own test file
under `test_files/unit/utils/`, exercised directly against `Document` fixtures
rather than through the full fetch-and-proxy machinery in
`fetch-helpers.test.ts`.

#246 and #247 can now be implemented without a further architectural
decision: each only needs to define its own field(s) inside
`RawArticleMetadata`/`ResolvedArticleMetadata`, its precedence clause inside
`resolveArticleMetadata`, and which resolved field(s) it copies onto
`FeedItem`. Both remain blocked on #253 (architecture-drift guardrails)
landing before implementation starts; this ADR settles the shape, not the
scheduling.
