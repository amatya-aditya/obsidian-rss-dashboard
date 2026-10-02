---
status: accepted
created: 2026-09-16
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247"
milestone: "vNext"
owner: jonwilks
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Article Metadata Enrichment and Language Support

This plan implements [#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247) (article metadata enrichment) together with the feed-level portion of [#246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246) (language metadata) that #247 unblocks. The architecture is locked by [ADR 0007](../adr/0007-article-metadata-pipeline-seam.md) and by the resolved tickets on [wayfinder map #263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263); this plan is the file-level breakdown of that ADR, not a re-derivation of it. Read the ADR first: every precedence order, guard, and persisted field below is settled there, not proposed here.

The plan was first written on 2026-09-16 in commit `80508d2`, which never reached `dev`. It was restored on 2026-10-02 and reorganized into the slices agreed on [#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247#issuecomment-5945262623). That discussion also settled the two persisted-field names the ADR now records: `publisherDescription` and `authors`.

## Dependencies

- [#253](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/253) (architecture-drift guardrails) has landed, so this work runs under `check:architecture` and ESLint's function-length and complexity limits from the start. The new logic still goes in new modules rather than in `article-saver.ts` or `feed-parser-class.ts`.
- [#266](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/266) settled the template-variable registry's design but never built it, so the registry is slice 1 here.
- Dashboard preview resolution is deferred out of these slices until the questions in **Deferred** are settled on [#263](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/263).
- [#666](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/666) audits `FeedItem.description` and whether it needs a clearer name. It runs alongside and blocks nothing here.

## Delivery

One issue and one pull request per slice, in the order below. Each slice's issue is filed when the slice starts and linked from its heading here. Each slice is test-first: the failing test lands before the change, and a slice that only moves code pins today's behavior with characterization tests first, as a [#436](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/436) refactor does.

### 1. Template-variable registry

Builds the registry #266 designed: a new `src/services/article-template/` module with a resolved value object built once per item, the variable registry (with `omitIfEmpty` and per-call-site default overrides), and the renderer. `{{content}}` stays a renderer parameter, not a registry field. All four hand-maintained chains go through it: `generateFrontmatter` and `applyTemplate` in `article-saver.ts`, and their copies in `web-viewer-integration.ts`.

- **No output changes.** Each call site's output stays byte-identical, including the web viewer's current differences. #266's resolution folded some of those differences into the registry PR (the guarded `{{image}}` resolver, the variables the web viewer doesn't fill). They now follow as their own PRs (see **Web viewer follow-ups**).
- **No new variables.**
- YAML escaping stays where each call site applies it today (#286).
- **Tests first:** characterization tests pin each chain's output for representative items and templates, including empty values, `{{date:FORMAT}}`, and `$` sequences in content. They stay green and unedited through the move.

### 2. Duplicate-intro utility

Adds `src/utils/duplicate-intro-detection.ts` with `isDuplicateIntro`, built on the existing `htmlToReadableText`, per ADR 0007's _Duplicate-intro suppression_ (#269): an exact match or a normalized prefix of at least 30 characters in either direction, after normalizing whitespace and stripping a trailing ellipsis, with no positional word-overlap layer.

- Replaces the Reader's private checks: `isEquivalentHtml` behind `hasDistinctMainContent` in `src/utils/reader-article-render.ts` and `src/components/article-renderer.ts`, and the description match in `stripDuplicateLeadContentFromDocument` (`src/utils/reader-html-cleanup.ts`, and its copy in `article-renderer.ts`).
- **Tests first:** pin today's Reader suppression. Where `isDuplicateIntro` flags more than today's checks do (the prefix match), the PR says so and tests it; it must not flag a lightly reworded near-duplicate.

### 3. Page-metadata extraction and resolution

Adds `src/utils/article-metadata.ts` with `extractPageMetadata(doc)` and `resolveArticleMetadata(pageRaw, feedFallbacks)`, per ADR 0007 (#264, #265, #267, #275).

- `parseArticleContent` (`src/utils/fetch-helpers.ts`) calls `extractPageMetadata(doc)` before `new Readability(doc).parse()` mutates the document, and `FullArticleFetchResult` gains `pageMetadata?: RawArticleMetadata`.
- The resolver implements the description tier and its degenerate-value guard, the excerpt tier, the language precedence (`<html lang>`, then the feed-level value, which stays empty until slice 7), and the page-level author signals (meta, then JSON-LD, then microdata, then `rel=author`).
- Deletes the dead `extractContentFromDocument` and `convertRelativeUrlsInContent` from `article-saver.ts`.
- **No user-visible change:** nothing reads the resolved values yet.
- **Tests:** `test_files/unit/utils/article-metadata.test.ts`, against `Document` fixtures rather than live fetches. Extraction reads every raw signal (meta description, `og:description`, `twitter:description`, `<html lang>`, `meta[name=author]`, JSON-LD author, microdata author, `rel=author`, canonical link) and swallows internal errors to an all-empty result. The description tier re-runs the guard on fallthrough. The guard rejects under 40 normalized characters, title-equal, punctuation- or ellipsis-only, and duplicate-intro values, and only a duplicate-intro rejection seeds the excerpt tier. Language preserves regional subtags and stays unset when unresolved. A `FullArticleFetchResult` test asserts that `pageMetadata` is filled and that extraction runs before Readability.

### 4. Persisted fields and the Reader callout

`FeedItem` gains five optional fields: `publisherDescription`, `language`, `canonicalUrl`, `metadataFetchedAt`, and `languageSource` (#268). `FeedItem.description` keeps the feed-supplied HTML; the resolved description goes in `publisherDescription`, beside it rather than over it (ADR 0007, amended).

- The callers that hold feed context resolve the metadata and write it: `reader-view.ts`, `article-saver.ts`, and `feed-parser-class.ts`.
- First-write-wins at the write site: once `metadataFetchedAt` is set, a later fetch or refresh never overwrites these fields.
- The Reader's description callout uses the resolved description. It never renders empty, it's hidden for a duplicate intro, and it doesn't call a page-level description "Feed description" (see _Feed description_ in the [glossary](../../CONTEXT.md#article-metadata-pipeline)).
- **Tests:** first-write-wins persistence; no callout for an empty description; a duplicate-intro description suppressed by the shared test; refresh leaves `FeedItem.description` behaving as today.

### 5. Authors

Parse-time and post-fetch author cleanup (#290, #291).

- Adds `splitAuthorElements` in `src/services/feed-parser/author-normalization.ts`. The RSS, Atom, and JSON Feed parsers collect every author element instead of only the first, splitting each element on its first comma or pipe.
- `FeedItem` gains `authors?: string[]`. `FeedItem.author` stays a string holding the names joined with `", "`, so its existing readers and `{{author}}` are unchanged (ADR 0007, amended).
- The page-level author from slice 3 overrides the feed-derived value only when the feed side resolved to a single author entry.
- **Tests:** parser tests for multiple author elements and the per-element split; resolver tests for the single-entry override; a polluted value from each publisher measured in #290 resolves clean.

### 6. `{{description}}` and `{{excerpt}}`

Exposes `{{description}}` and `{{excerpt}}` through the registry from slice 1, filled from the resolved metadata.

- `{{summary}}` stays byte-identical to today's `extractSummary(...)` output (#271).
- **Tests:** the template suite shows no change to any existing variable's output; the new variables follow the description and excerpt tiers.

### 7. Language support (#246)

The feed-level part of [#246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246).

- The feed parser reads feed-level `<language>` and `xml:lang`, which it doesn't parse today, as the resolver's language fallback.
- `{{language}}` goes through the registry with `omitIfEmpty`, so an unknown language omits the `lang:` line rather than writing `lang: ""` (#266).
- **Tests:** feed-level language parsing for RSS and Atom; the precedence `<html lang>`, then the feed value; the omitted line.

## Web viewer follow-ups

The web viewer's "Save with template" output differs from the other template call sites in ways the registry PR deliberately keeps. Each difference gets its own follow-up PR after slice 1:

1. The body's `{{date}}` is the save date.
2. The body leaves `{{tags}}`, `{{feedTitle}}`, `{{guid}}`, and `{{date:FORMAT}}` unfilled.
3. The saved-tag rule differs.
4. The `{{image}}` resolver differs: it lacks the formula-injection guard (`firstNonFormulaImageUrl`).
5. `{{created}}`, an alias for `{{date}}` from #266's addendum, isn't registered yet.

The web viewer's `"Web viewer"` default for `{{source}}` and `{{feedTitle}}` is intended, and stays as a per-call-site default override (#266).

## Deferred

Dashboard preview resolution. Before it's implemented, #263 should settle which fields previews use, their fallback order, whether duplicate-intro suppression applies, and what a preview shows when no usable text exists.

## Out of scope

Local text-based language detection (#272), reader header enrichment, metadata-aware duplicate detection, a metadata inspector or diagnostics surface, Web Clipper vocabulary parity, the cover-image fallback implementation (it consumes this pipeline but ships separately), `{{wordCount}}` and `{{readingTime}}` (still unspecified on the map), renaming `FeedItem.description` (#666), and any LLM-based summarization, translation, or tagging.

## Acceptance criteria

1. `{{summary}}` is byte-identical to today's output for every existing template (#271).
2. Slice 1 changes no template output at any of the four call sites.
3. `{{description}}` and `{{excerpt}}` are exposed and filled per the description and excerpt tiers.
4. `{{language}}` is exposed, feed-level `<language>`/`xml:lang` parses, and an unknown language omits its line.
5. A publisher description that duplicates the article's own opening text is suppressed, by the same test the Reader uses.
6. Empty description callouts never render.
7. Multi-author feed values are kept as separate `authors` entries; `author` stays the joined string.
8. A polluted author value resolves clean for the publishers measured in #290, through either the parse-time split or the post-fetch page signal.
9. Persisted metadata is first-write-wins: once `metadataFetchedAt` is set, a later refresh never overwrites `publisherDescription`, `language`, `authors`, or `canonicalUrl`.
10. `FeedItem.description` keeps holding the feed-supplied HTML, and refresh keeps rewriting it as today.
11. New logic lives in new modules; no function exceeds ESLint's limits and no new module imports `main.ts`.
12. No LLM or external API is introduced, and no new runtime dependency is added.

## Likely files

- `src/services/article-template/` (new, slice 1)
- `src/utils/duplicate-intro-detection.ts` (new, slice 2)
- `src/utils/article-metadata.ts` (new, slice 3)
- `src/services/feed-parser/author-normalization.ts` (new, slice 5)
- [src/services/article-saver.ts](../../src/services/article-saver.ts)
- [src/services/web-viewer-integration.ts](../../src/services/web-viewer-integration.ts)
- [src/utils/fetch-helpers.ts](../../src/utils/fetch-helpers.ts)
- [src/utils/full-article-fetch.ts](../../src/utils/full-article-fetch.ts)
- [src/utils/reader-article-render.ts](../../src/utils/reader-article-render.ts)
- [src/utils/reader-html-cleanup.ts](../../src/utils/reader-html-cleanup.ts)
- [src/components/article-renderer.ts](../../src/components/article-renderer.ts)
- [src/views/reader-view.ts](../../src/views/reader-view.ts)
- [src/services/feed-parser/feed-parser-class.ts](../../src/services/feed-parser/feed-parser-class.ts)
- [src/services/feed-parser/feed-item-builder.ts](../../src/services/feed-parser/feed-item-builder.ts)
- [src/types/types.ts](../../src/types/types.ts) (`FeedItem` fields)

## Verification

Each slice runs the repository's validation ladder (`AGENTS.md`) and reports the raw `vitest` summary line. Slices 4 to 7 change what users see, so each one is also tested by hand in the fixture vault (`docs/development/fixture-vault.md`), checking the saved notes and stored data on disk as well as the UI.
