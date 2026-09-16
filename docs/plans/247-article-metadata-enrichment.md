---
status: blocked
created: 2026-09-16
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247"
milestone: ""
owner: unassigned
workstream: ""
sequence: null
depends_on: ["#253", "#263"]
release_requirement: ""
implementation: ""
---

# Article Metadata Enrichment and Language Support

This plan implements [#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247) (article metadata enrichment) together with the feed-level portion of [#246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246) (language metadata) that #247 unblocks. The architecture is locked by [ADR 0007](../adr/0007-article-metadata-pipeline-seam.md) and by nine resolved tickets on [wayfinder map #263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263); this plan is the file-level breakdown of that ADR, not a re-derivation of it. Read the ADR first — every precedence order, guard, and persisted field below is settled there, not proposed here.

## Blocked on

- [#253](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/253) (architecture-drift guardrails) must merge first, so this work lands under `check:architecture` rather than being retrofitted to it. `article-saver.ts` (936 lines) and `feed-parser-class.ts` (980 lines) are both within ~60 lines of the 1000-line warning threshold — every step below extracts into new files rather than growing either one.
- [#263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263) (the wayfinder map) supplies every design decision this plan implements. All nine of its child tickets are closed as of this plan's creation.

## Scope

**In scope** (from ADR 0007 and the map's closed tickets):

- New `src/utils/article-metadata.ts`: `extractPageMetadata(doc)` / `resolveArticleMetadata(pageRaw, feedFallbacks)`.
- `FullArticleFetchResult` gains `pageMetadata?: RawArticleMetadata`.
- Description-tier precedence and the degenerate-value guard (#265, #275).
- Language precedence: `<html lang>` -> feed `<language>`/`xml:lang` (#264). Feed-level `<language>`/`xml:lang` parsing, currently absent.
- Author extraction: parse-time `splitAuthorElements` (all parsers) plus the post-fetch microdata signal (#291).
- Duplicate-intro suppression as a shared utility, replacing two private duplicated implementations (#269).
- `FeedItem` gains `description`, `language`, `author: string[]`, `canonicalUrl`, `metadataFetchedAt`, `languageSource`, first-write-wins (#268, #291).
- `{{description}}`, `{{excerpt}}`, `{{language}}` exposed through the template-variable registry from #266 (already implemented independently of this plan).
- Delete dead code: `extractContentFromDocument` and `convertRelativeUrlsInContent` in `article-saver.ts` (#267).
- Reader: suppress empty description callouts and duplicate-intro descriptions; dashboard preview resolution follows description -> excerpt -> nothing.

**Out of scope** (see the map's Out of scope section for the full list and reasoning): local text-based language detection (#272, separate triage), reader header enrichment, metadata-aware duplicate detection, a metadata inspector/diagnostics surface, Web Clipper vocabulary parity, cover-image fallback implementation (consumes this pipeline but ships separately), the YAML-escaping frontmatter fix (#286, filed separately), `{{wordCount}}`/`{{readingTime}}` (still fog — see the map's Not yet specified), and any LLM-based summarization/translation/tagging.

## Red-Green TDD Shape

### Red

1. Add `test_files/unit/utils/article-metadata.test.ts` fixtures asserting, against `Document` fixtures (not live fetches):
   - `extractPageMetadata` reads every raw signal (meta description, og:description, twitter:description, `<html lang>`, `meta[name=author]`, JSON-LD author, microdata author, `rel=author`, canonical link) and swallows internal errors to an all-empty result.
   - `resolveArticleMetadata`'s description tier follows meta -> og -> twitter -> guarded feed description, re-running the degenerate-value guard on fallthrough.
   - The degenerate-value guard rejects: <40 normalized chars, title-equal, punctuation/ellipsis-only, duplicate-intro — and that only the duplicate-intro rejection seeds the excerpt tier.
   - Language resolves `<html lang>` first, then feed-level, preserving regional subtags; unresolved stays unset.
   - Author resolves per-element `splitAuthorElements` results at parse time, and the post-fetch microdata/meta/JSON-LD/`rel=author` priority only overrides a single-entry feed result.
2. Add `test_files/unit/utils/duplicate-intro-detection.test.ts` covering exact match, normalized-prefix match (>=30 chars either direction), and the rejected positional-overlap case (must NOT flag a lightly reworded near-duplicate).
3. Add parser tests (RSS/Atom/JSON-Feed) asserting multiple author elements are now collected instead of only the first, and that `splitAuthorElements` runs per element.
4. Add a `FullArticleFetchResult` test asserting `pageMetadata` is populated from `parseArticleContent` and extraction runs before `Readability.parse()` mutates the document.
5. Add a `FeedItem` persistence test: first-write-wins — a second full-article fetch after `metadataFetchedAt` is set must not overwrite `description`/`language`/`author`/`canonicalUrl`.
6. Add Reader tests: no description callout renders when the resolved description is empty; a duplicate-intro description is suppressed identically to the existing `hasDistinctMainContent`/`stripDuplicateLeadContentFromDocument` behavior it replaces.
7. Add a dashboard-preview test: resolution order is description -> excerpt -> nothing, never an empty region.

### Green

1. Delete `extractContentFromDocument`/`convertRelativeUrlsInContent` from `article-saver.ts` (confirmed dead — #267).
2. Add `src/utils/article-metadata.ts` with `extractPageMetadata`/`resolveArticleMetadata` per ADR 0007's interface.
3. Add `src/utils/duplicate-intro-detection.ts` (`isDuplicateIntro`, built on the existing `htmlToReadableText`), and point `reader-view.ts` and `article-renderer.ts` at it instead of their private implementations.
4. Add `src/services/feed-parser/author-normalization.ts` (`splitAuthorElements`); wire into the RSS/Atom/JSON-Feed parsers to collect every author element instead of the first.
5. Call `extractPageMetadata(doc)` in `fetch-helpers.ts`'s `parseArticleContent`, before `new Readability(doc).parse()`; add `pageMetadata` to `FullArticleFetchResult`.
6. Call `resolveArticleMetadata` at each caller that holds feed context (`reader-view.ts`, `article-saver.ts`, `feed-parser-class.ts`), not inside the fetch layer.
7. Parse feed-level `<language>`/`xml:lang` in the feed parser (currently unparsed).
8. Add the six new optional `FeedItem` fields and the first-write-wins guard at the write site.
9. Wire `{{description}}`, `{{excerpt}}`, `{{language}}` into the #266 template-variable registry.
10. Update Reader description-callout rendering and dashboard preview resolution to consume the resolved values.

### Refactor

1. Confirm `article-saver.ts` and `feed-parser-class.ts` shrink or hold steady rather than absorbing the new logic inline — the new code lives in `src/utils/article-metadata.ts`, `src/utils/duplicate-intro-detection.ts`, and `src/services/feed-parser/author-normalization.ts`.
2. Confirm `extractCoverImage` in `feed-parser-class.ts` is untouched — different pipeline stage (ADR 0007), not folded in.

## Acceptance Criteria

1. `{{summary}}` is byte-identical to today's output for every existing template (#271) — no template regression test may fail from this change.
2. `{{description}}` and `{{excerpt}}` are exposed and populated per the description/excerpt tier precedence.
3. `{{language}}` is exposed; feed-level `<language>`/`xml:lang` parses where it previously did not.
4. A publisher description that duplicates the article's own opening text is suppressed, using the same test as the Reader's existing duplicate-suppression display.
5. Empty description callouts never render.
6. Multi-author feed values are preserved as multiple entries, not collapsed to the first.
7. A polluted author value (name + title/institution) resolves clean for the publishers measured in #290, via either the parse-time split or the post-fetch page signal.
8. Persisted metadata is first-write-wins: a later feed refresh never overwrites `description`/`language`/`author`/`canonicalUrl` once `metadataFetchedAt` is set.
9. `article-saver.ts` and `feed-parser-class.ts` do not grow past their current line counts from this change.
10. No LLM or external API is introduced; no new runtime dependency is added.

## Likely Files

- [src/utils/article-metadata.ts](../../src/utils/article-metadata.ts) (new)
- [src/utils/duplicate-intro-detection.ts](../../src/utils/duplicate-intro-detection.ts) (new)
- [src/services/feed-parser/author-normalization.ts](../../src/services/feed-parser/author-normalization.ts) (new)
- [src/utils/fetch-helpers.ts](../../src/utils/fetch-helpers.ts)
- [src/utils/full-article-fetch.ts](../../src/utils/full-article-fetch.ts)
- [src/services/article-saver.ts](../../src/services/article-saver.ts)
- [src/services/feed-parser/feed-parser-class.ts](../../src/services/feed-parser/feed-parser-class.ts)
- [src/views/reader-view.ts](../../src/views/reader-view.ts)
- [src/services/article-renderer.ts](../../src/services/article-renderer.ts)
- [src/services/article-template/](../../src/services/article-template/) (registry from #266)
- [src/types/types.ts](../../src/types/types.ts) (`FeedItem` new fields)
- [test_files/unit/utils/article-metadata.test.ts](../../test_files/unit/utils/article-metadata.test.ts) (new)
- [test_files/unit/utils/duplicate-intro-detection.test.ts](../../test_files/unit/utils/duplicate-intro-detection.test.ts) (new)

## Verification

1. Run the new `article-metadata` and `duplicate-intro-detection` unit suites against `Document` fixtures.
2. Run the feed-parser suite for multi-author collection and feed-level language parsing.
3. Run the existing template-variable suite to confirm zero `{{summary}}` regressions.
4. Run the Reader and dashboard-preview suites for description-callout and duplicate-suppression behavior.
5. Confirm `article-saver.ts` and `feed-parser-class.ts` line counts against `check:architecture` once #253 lands.
