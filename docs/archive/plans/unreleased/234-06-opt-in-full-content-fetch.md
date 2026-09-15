---
status: implemented
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
implementation: ""
---

# Opt-in full article content fetch

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

An off-by-default "Fetch full article content" toggle (`Setting`/`addToggle`, class `import-fetch-full-content-setting`) in the [234-01](234-01-import-starred-items-for-existing-feeds.md) starred-import preview UI (`src/modals/import-starred-modal.ts`), rendered in the preview header above the select-all/select-none toolbar. When enabled, after the base import inserts the selected `FeedItem`s into their matching feeds, `performImport` runs the existing `fetchFullArticleContentWithOutcome` pipeline (`src/utils/full-article-fetch.ts` — the same function `ArticleSaver.saveArticleWithFullContent` and `ReaderView` already call) once per inserted item, keyed off `item.link`, passing the plugin's configured CORS proxy the same way `ReaderView.fetchFullArticleContent` does. No fetch/Readability/Turndown logic was duplicated; the modal only calls the existing function and handles its `FullArticleFetchResult` outcome.

On success, `item.content` is replaced with the fetched HTML in place (the same object reference already pushed into `feed.items`), and a second `plugin.saveSettings()` call after the fetch loop persists it. On failure (empty `result.content`, or a thrown error) the item keeps its export-provided content and is recorded as a `{ title, link }` failure — this never blocks or rolls back the rest of the import. When one or more full-content fetches failed, the modal renders a results-summary screen instead of auto-closing: an "Imported N starred articles" line, a heading naming how many full-content fetches failed, a list of `<a href>` links (title text, linking to the article's original URL) for each failed article, and a note recommending the Obsidian web clipper browser extension as a manual fallback, plus a Close button. There was no pre-existing OPML-import results-summary UI to reuse (checked; none exists), so this summary is new, built from the modal's own `import-preview-*` DOM classes to stay visually consistent. When the toggle is off, `fetchFullContentForItems` is never called, so `fetchFullArticleContentWithOutcome` makes zero requests.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [x] The review UI has an off-by-default "Fetch full article content" toggle.
- [x] When enabled, each selected imported article gets a full-content-fetch attempt via the existing pipeline, without duplicating its fetch/Readability/Turndown internals.
- [x] A per-article fetch failure is non-blocking and appears in a results summary with the article's URL and a note recommending the Obsidian Web Clipper extension.
- [x] When the toggle is off, no full-content fetch requests are made at all.

## Implementation notes

- Mocking seam for tests: `vi.mock("../../../src/utils/full-article-fetch", ...)` replacing `fetchFullArticleContentWithOutcome` with a `vi.fn()`, mirroring the existing pattern in `test_files/unit/views/reader-view-restricted-banner.test.ts` — no `requestUrl`/`robustFetch` mocking needed since the modal calls the already-tested pipeline function directly rather than reimplementing it.
- The lint rule `obsidianmd/ui/sentence-case` does not have "Web Clipper" in its `brands` allowlist (only `"Obsidian"` is listed in `eslint.config.mjs`), so the user-facing recommendation text uses lowercase "web clipper" rather than expanding the shared lint config for a single string.
