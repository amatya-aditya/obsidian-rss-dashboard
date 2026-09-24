# ADR 0007: Article-metadata pipeline seam

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-15

## Context and problem

Two planned features, [#246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246) and [#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247), both need metadata that publishers put in an article page — signals such as language, description, and author — and both need to weigh those signals against fallbacks supplied by the feed itself (feed `<language>`, feed-supplied `<description>`, feed author).

The plugin already fetches full article pages and runs them through Readability, but that pipeline kept only the extracted article body and discarded the rest of the page. There was no agreed place for page metadata to be extracted, carried through the fetch result, resolved against feed-level fallbacks, or stored on an article. The terms `summary`, `description`, and `excerpt` were also used interchangeably across the codebase, and the article's description and author came straight from whatever the feed supplied, with no precedence or cleanup applied.

Several constraints shaped the answer:

- Readability's `parse()` mutates the document it is given, so page metadata has to be read before parsing. The pipeline order is fixed: `fetch -> extract head metadata -> Readability.parse() -> resolve`.
- The fetch layer only ever sees a URL; feed context lives with the callers.
- `article-saver.ts` and `feed-parser-class.ts` were close to the project's file line-count threshold and could not absorb the work inline.
- Module dependencies must follow the enforced `views/components/modals/settings -> services -> utils/types` direction.
- Saved-note template variables write into the user's own vault notes, so any change to an existing variable's output is user-visible.

We needed to settle the seam — where extraction and resolution live, what the shared fetch result carries, what rules the resolver applies to each field, and what persists onto a feed item — so that #246 and #247 could be implemented without a further architectural decision. Those questions were worked through as separate tickets on [wayfinder map #263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263).

This record was first committed with only the extraction, fetch-result, and persistence-boundary decisions from [#267](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/267). The remaining sections were written for [#270](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/270) on 2026-09-16 in commit `80508d2`, which did not reach `dev` at the time, and were restored on 2026-09-23.

## Decision

Page-metadata extraction and metadata resolution are two separate, pure steps. Raw signals are extracted once from the fetched page, before Readability runs; they are resolved against feed-level fallbacks only by the callers that hold feed context. Resolved metadata is transient and is never persisted wholesale.

This ADR locks the full seam: the extraction point, what the resolver does with what it extracts, what persists, and the two edge behaviors (duplicate suppression, `{{summary}}` compatibility) that share the resolver's output. The sections below are ordered pipeline-first: placement and interface, then each field's precedence, then persistence, then the two consumers that read the resolved result without themselves being part of resolution.

### Extractor placement and interface

Page-metadata extraction is a new pair of pure functions in a new file, `src/utils/article-metadata.ts`: `extractPageMetadata(doc: Document): RawArticleMetadata` and `resolveArticleMetadata(pageRaw: RawArticleMetadata, feedFallbacks: {...}): ResolvedArticleMetadata`. Neither takes a URL, HTML string, or service dependency — `extractPageMetadata` reads the one `Document` instance the caller already built and is about to hand to `Readability`; `resolveArticleMetadata` is pure precedence logic over two already-extracted signal bags. See the _Page metadata_, _Feed metadata_, _Raw article metadata_, and _Resolved article metadata_ entries in the [article metadata pipeline glossary](../../CONTEXT.md#article-metadata-pipeline).

`fetch-helpers.ts`'s `parseArticleContent` calls `extractPageMetadata(doc)` before `new Readability(doc).parse()`, matching the fixed pipeline order (`fetch -> extract head metadata -> Readability.parse() -> resolve`). Extraction runs on every response with non-trivial HTML — reusing the existing `< 200 chars` guard as the only skip condition — regardless of whether the response is later classified as blocked or restricted. A paywalled page's `<head>` is frequently real signal even though its body is gated; a bot-challenge page's `<head>` just comes back empty on its own, needing no separate gate. `extractPageMetadata` swallows internal errors and returns an all-empty `RawArticleMetadata`, matching `parseArticleContent`'s existing swallow-and-return-empty contract, so a metadata-extraction bug never fails the whole fetch.

`FullArticleFetchResult` gains `pageMetadata?: RawArticleMetadata` (raw, not resolved) alongside the existing `content` and `failureType`. Resolution is deliberately _not_ done inside `full-article-fetch.ts` or `fetch-helpers.ts`: those layers only ever see a URL, and #264's language precedence and #265's description precedence both fold in feed-level fallbacks (feed `<language>`, feed-supplied `<description>`) that only the caller (`reader-view.ts`, `article-saver.ts`, `feed-parser-class.ts`) has. Those callers invoke `resolveArticleMetadata` themselves once they hold both the fetch result and their own feed context.

`ResolvedArticleMetadata` is transient. It is never persisted onto `FeedItem` as a nested object. `FeedItem` stays flat, consistent with every field on it today; #246 and #247 each pick which of `ResolvedArticleMetadata`'s fields (if any) get copied onto a flat `FeedItem` property, and whether a source/provenance field (`languageSource`, `descriptionSource`) is worth persisting alongside it is a per-field call left to those tickets, not forced either way by this seam.

`extractCoverImage` (`feed-parser-class.ts`) and `extractContentFromDocument` (`article-saver.ts`) are not part of this seam. `extractCoverImage` resolves images from feed-supplied `content`/`description` HTML at RSS-parse time — it never sees the fetched page `Document` this extractor operates on, so it is a different pipeline stage, not a duplicate implementation. `extractContentFromDocument` and the private `convertRelativeUrlsInContent` it alone calls have no callers anywhere in `src/` — confirmed dead code, to be deleted outright rather than migrated into the new extractor.

### Description precedence and the degenerate-value guard

`resolveArticleMetadata`'s description tier tries, in order, `meta[name=description]` -> `og:description` -> `twitter:description` -> guarded feed-supplied description (measured live against 47 publisher pages in #265; JSON-LD is dropped — it was never the sole signal and lost to the meta tags twice — and Readability's `excerpt` moves out of this tier entirely, since in the shipped Readability version it already duplicates the meta description).

Every candidate passes a degenerate-value guard before acceptance (#275): reject if it is under ~40 normalized characters, normalized-equal to the title, punctuation/ellipsis-only, or a duplicate intro of the article body (see below). A rejection falls through to the next candidate in the same tier, re-running the guard each time, rather than dropping straight to the excerpt tier — Substack ships `"..."` in every signal simultaneously, so a single-candidate reject-and-stop would surface nothing. A duplicate-intro rejection alone seeds the excerpt tier afterward (it is real prose, just misplaced); a length/title/punctuation rejection is discarded outright.

The excerpt tier itself falls back to Readability `excerpt` (when it did not already come from a meta tag tried above), then the feed-supplied description, then a truncated derived excerpt.

### Language precedence

Measured on 100 live pages and 53 feeds (#264): `<html lang>` alone covers 96% of articles, with zero disagreements against any other signal across 69 comparisons. `og:locale` and JSON-LD `inLanguage` add no incremental coverage over `<html lang>` and are dropped rather than carried as unused extra tiers.

The resolver's language precedence is therefore `<html lang>` -> feed-level `<language>`/`xml:lang`, normalized to a BCP-47-compatible code with regional subtags preserved (not truncated to the base language). Feed metadata parses `<language>`/`xml:lang` where it is not parsed today. Unresolved languages are left unset rather than guessed.

This precedence directly gates #246's scope: local text-based language detection, the only tier that would have covered the remaining gap, needs a third runtime dependency on a mobile-shipping plugin and is out of scope (tracked separately as #272).

### Author extraction and cleanup

Author pollution is publisher-specific, not a general trait: measured across 16 feeds / 77 items (#290), 23% carry a polluted feed-author value, but it concentrates entirely in three publishers shipping structurally different pollution (`Name, Title, Institution`; `Name | Dept`; `Name in City` or a semicolon-joined multi-credit line). The fix is two layers (#291), not one:

- **Parse-time, no fetch needed.** The RSS/Atom/JSON-Feed parsers stop keeping only the first author element and collect every one; a new shared `splitAuthorElements` (`src/services/feed-parser/author-normalization.ts`) keeps the substring before the first comma or pipe **per element**. This alone resolves the comma/pipe-style pollution with zero page fetch.
- **Post-fetch.** `article-metadata.ts` adds a fourth page-level author signal, schema.org microdata (`itemprop="author"`), alongside `meta[name=author]` / JSON-LD / `rel=author` (microdata is the only mechanism that resolves one of the three polluted publishers, which has neither of the other two markers). Priority is meta -> JSON-LD -> microdata -> `rel=author`. The page-level result overrides the feed-derived value only when the feed side resolved to a single author entry — a multi-element feed result is trusted as-is, since a page byline typically exposes only the primary author.

`ResolvedArticleMetadata.author` and the persisted `FeedItem.author` are both `string[]`, not `string` — needed to hold multiple co-authors without re-concatenating them, and no storage migration is required for a new optional field under [ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md). `{{author}}` stays a single `", "`-joined string in the template output for now; per-name output is deferred with Web Clipper parity (out of scope). A natural-language pollution case with no comma or pipe (`"Name in City"`) has no parse-time fix and is caught only when the page fetch runs — an accepted gap, not a defect to chase further.

### Duplicate-intro suppression

A description is a duplicate intro when it restates the article's own opening text, either exactly or as a normalized prefix of at least 30 characters in either direction, after normalizing whitespace and stripping a trailing ellipsis (#269). A prototyped positional word-overlap layer meant to catch lightly reworded near-duplicates was rejected: a single inserted word shifts every later word out of position and collapses the score, so it adds fragility without catching cases the prefix match misses. On ambiguity the check does not flag — a false positive hides real publisher prose, which is worse than an occasional visible duplicate.

This one test (`isDuplicateIntro`, built on the existing `htmlToReadableText`) is shared by every caller that needs it: the degenerate-value guard above, the Reader's duplicate-suppression display, and the resolver's excerpt-tier eligibility check. It lives in a new `src/utils/duplicate-intro-detection.ts` rather than staying duplicated as private methods on `reader-view.ts` and `article-renderer.ts`, since `utils` cannot import from `views`.

### What persists, and its staleness policy

`FeedItem` gains six new optional fields, populated once a full-article fetch resolves them (#268, author shape revised by #291): `description` (overwrites the feed-derived value), `language`, `author` (`string[]`), `canonicalUrl`, `metadataFetchedAt`, and `languageSource`.

**First-write-wins**: once `metadataFetchedAt` is set on an item, a later feed refresh never overwrites these fields — feed metadata is the pre-fetch fallback, not a rival source to reconcile against on every refresh.

`excerpt`, `siteName`, and `modifiedAt` are deliberately **not** persisted — no coverage data supports the cost, and they stay transient `ResolvedArticleMetadata`-only. Of the two provenance fields the resolver could track, only `languageSource` earns persistence: the page/feed coverage gap (96% vs. 57%) makes it load-bearing for callers deciding whether to re-derive; `descriptionSource` stays internal-only, since meta and `og:description` agree 88% of the time and the distinction that actually matters — description versus excerpt — is already implied by which `FeedItem` field the value landed in.

No byte-budget concern was found or is needed: `content` already dwarfs six optional fields by one to three orders of magnitude, and the shard serializer needs no migration for new optional fields. Whether persisted metadata is ever re-fetched to catch a publisher's post-publication edit is deliberately left open (see _Not yet specified_ on the [#263 map](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263)) — first-write-wins is the policy until that question has data behind it.

### `{{summary}}` compatibility

`{{summary}}` keeps resolving to today's `extractSummary(...)` 220-character excerpt, byte-identical, forever (#271). It does not cascade to `description` or `excerpt`, and it is not reserved for a future real summarization feature either — this project already excludes LLM/external summarization, so there is nothing to reserve the name for.

This is a blanket rule, not a case-by-case judgment: the plugin writes into the user's vault notes, so a template variable silently changing its output is unacceptable even when the new value is objectively better. `{{summary}}` stays absent from frontmatter templates by design — frontmatter is structured, a prose excerpt is body-shaped — while `{{description}}` and `{{excerpt}}` are the new, separately named variables #246/#247 expose through the template-variable registry (#266). The _Summary_, _Description_, _Excerpt_, and _Feed description_ glossary entries record the distinction.

## Consequences

`article-saver.ts` and `feed-parser-class.ts` stay under their line-count threshold by construction — the new logic never lands in either file, and deleting the dead `extractContentFromDocument`/`convertRelativeUrlsInContent` pair shrinks `article-saver.ts` by roughly 50 lines instead of relocating them.

`RawArticleMetadata` and `ResolvedArticleMetadata` get their own test file under `test_files/unit/utils/`, exercised directly against `Document` fixtures rather than through the full fetch-and-proxy machinery in `fetch-helpers.test.ts`.

#246 and #247 can now be implemented without a further architectural decision: extraction interface, description/language/author precedence, the degenerate-value guard, duplicate-intro suppression, the persisted-field list and its staleness policy, and `{{summary}}` compatibility are all settled above. Both remain blocked on #253 (architecture-drift guardrails) landing before implementation starts; this ADR settles the shape, not the scheduling. Implementation is tracked in [GitHub Issue #247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247).

### Existing users and data

- Existing saved-note templates keep producing byte-identical `{{summary}}` output.
- The new `FeedItem` fields are optional and need no storage migration; articles are enriched only when a full-article fetch resolves them, and first-write-wins means a later refresh never overwrites that result.

## Considered options

### Extractor as a `services` module

Rejected. Extraction and resolution are pure functions over an already-parsed `Document` and a plain fallback object — no settings, no I/O, no cross-module state. `utils` is reachable from `services` under the enforced `views/components/modals/settings -> services -> utils/types` direction, so nothing loses access by placing it there.

### Single extract-and-resolve function instead of a raw/resolved split

Rejected. #265 and #264 both needed every raw signal to measure precedence against real publishers. Collapsing the two steps would make a future precedence change untestable without re-deriving HTML fixtures.

### Resolve inside `full-article-fetch.ts` before returning `FullArticleFetchResult`

Rejected. That layer only has a URL and proxy config, never the feed context (feed-level language, feed-supplied description) that resolution's precedence order requires. Threading feed context down into the fetch layer would invert the dependency for no benefit, since every caller already holds both pieces.

### Skip extraction on blocked/restricted responses

Rejected. Paywalled pages routinely serve intact `<head>` metadata alongside a gated body — the case the ticket explicitly called out. The existing short-response guard already filters out the bot-challenge pages that would contribute noise.

### Persist `ResolvedArticleMetadata` wholesale on `FeedItem`

Rejected. It would commit every future metadata field to persistence regardless of whether it's ever displayed from storage versus recomputed per-render, and would preempt #246/#247's own per-field provenance decisions.

### Fold `extractCoverImage` or `extractContentFromDocument` into the new extractor

Rejected for different reasons: the former operates on a different input at a different pipeline stage, so there is nothing to merge; the latter has no callers, so there is nothing to migrate.

### Include JSON-LD and site-name-equality in the description guard

Rejected. #265 found JSON-LD description never the sole signal and worse than the meta tags twice across 47 pages; #275 found zero evidence for site-name-equality as a rejection reason in the same sample.

### Drop a degenerate description straight to the excerpt tier

Rejected. Substack ships placeholder-only content (`"..."`) across every description-tier signal at once, so a single-candidate reject-and-stop would surface nothing usable; falling through the remaining description candidates first is required.

### Split a polluted author value per feed-level value instead of per element

Rejected. CBC ships clean multi-author values comma-joined at the feed level, so a per-value split cannot tell a co-author apart from a trailing title — only a per-element split (#291) does.

### Persist `excerpt`, `siteName`, `modifiedAt`, or `descriptionSource` alongside the fields that do persist

Rejected for lack of coverage data (#268) and, for `descriptionSource`, low entropy — meta and `og:description` agree 88% of the time, and the field the value landed on already implies the distinction that matters.

### Let `{{summary}}` cascade to `description`/`excerpt` once those exist

Rejected (#271). A template variable's output changing silently in a vault note is unacceptable regardless of whether the new value is better; a future real-summarization feature gets its own variable name instead of reclaiming `summary`.

## Related

- [GitHub Issue #263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263) — wayfinder map for the article-metadata pipeline seam
- [GitHub Issue #267](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/267) — extractor placement and interface
- [GitHub Issue #270](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/270) — completing the ADR, glossary, and triage verdicts
- [GitHub Issue #264](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/264) and [GitHub Issue #265](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/265) — language and description precedence measurements
- [GitHub Issue #268](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/268), [#269](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/269), [#271](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/271), [#275](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/275), [#290](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/290), and [#291](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/291) — persistence, duplicate-intro, `{{summary}}`, degenerate-value, and author decisions
- [GitHub Issue #246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246) and [GitHub Issue #247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247) — the features this seam unblocks
- [GitHub PR #253](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/253) — architecture-drift guardrails
- [Glossary: Article metadata pipeline](../../CONTEXT.md#article-metadata-pipeline)
