---
status: implemented
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
implementation: ""
---

# Idempotent re-import (dedup + merge)

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

Re-running the starred.json importer against the same or an updated export is now safe. A new pure module, `src/services/starred-import-merge.ts`, matches each starred-import candidate against a target feed's existing `items` using `canonicalizeItemIdentityUrl` on guid-or-link — the exact identity logic feed-refresh merging already uses (`mergeFeedHistoryItems` in `src/services/feed-parser/feed-retention.ts`, and `FeedParserService`'s existing-item lookup in `src/services/feed-parser/feed-parser-class.ts`). A match is treated as an update, not a new insert: `mergeStarredImportIntoExistingItem` merges any newly-present labels (from [234-04](234-04-map-labels-to-tags.md)) into the article's existing tags via `mergeTagArrays` (`src/utils/tag-utils.ts`), and forces `starred` to `true`. Every other field on the existing article — `read`, `saved`, `savedFilePath`, `playbackProgress`, and anything else — is carried forward completely untouched; the merge function never reads or writes them.

`ImportStarredModal.performImport` now routes each selected candidate through `applyStarredImportCandidateToFeed(feed, candidate.item)` instead of unconditionally `push`-ing it, and tracks insert vs. update counts separately for the completion Notice text.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds
- 234-04-map-labels-to-tags

## Acceptance criteria

- [x] Re-importing an unchanged export produces zero duplicate articles.
- [x] Re-importing an export where a previously-imported item gained a new label results in that label being merged into the existing article's tags, without removing tags the user added locally.
- [x] Re-importing never overwrites `read`, `saved`, `savedFilePath`, or other locally-edited fields on an already-imported article.
- [x] Merge-function tests cover: brand-new item insertion, unchanged re-import (no-op), and re-import with an additional label/newly-starred state.

## Implementation notes

- Identity matching intentionally does not reuse `feed-parser-class.ts`'s `convertToAbsoluteUrl` step: starred-import candidates already carry absolute `guid`/`link` values sourced directly from the Google-Reader-API export (see [234-01](234-01-import-starred-items-for-existing-feeds.md)), so there is no feed-relative URL to resolve. `canonicalizeItemIdentityUrl` is applied identically otherwise.
- `findMatchingFeedItem` treats two items that both have an empty guid and an empty link as non-matching (an empty identity key never matches, including against itself), to avoid false-positive matches when identity data is missing.
- Auto-creating missing source feeds (234-02), surfacing unimportable entries (234-03), and full-content fetching (234-06) remain unbuilt; this ticket only changes what happens to a candidate whose target feed already exists locally, per 234-01's original constraint.
- New module `src/services/starred-import-merge.ts` is separate from the existing `src/services/starred-import-mapper.ts`: the mapper stays feed/tag-shape-only and unaware of any feed's existing items, while the merge module owns identity matching and update-vs-insert decisions. `starred-import-mapper.ts` imports nothing from Obsidian; `starred-import-merge.ts` imports `mergeTagArrays` from `src/utils/tag-utils.ts`, which does import `obsidian` (for other exports in that file) — acceptable here since this module was never documented as Obsidian-dependency-free, unlike the mapper.
