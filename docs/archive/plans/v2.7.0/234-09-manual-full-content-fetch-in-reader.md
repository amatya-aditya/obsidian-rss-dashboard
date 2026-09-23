---
status: implemented
created: 2026-09-10
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 1
depends_on: []
release_requirement: ""
implementation: ""
---

# Manual full-content fetch in the reader

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

A new three-state content-state field on `FeedItem`
(`starredImportContentState?: "unfetched" | "failed"`, `src/types/types.ts`),
paired with an import timestamp (`starredImportedAt?: number`, epoch
milliseconds). The state is represented as absent-vs-present: every article
created by the starred-import mapper (`toFeedItem` in
`src/services/starred-import-mapper.ts`) starts as `"unfetched"` with a
`starredImportedAt` timestamp; the field is cleared (set to `undefined`)
once real full content is present, whether that happens via the import-time
opt-in fetch (234-06, in `ImportStarredModal.fetchFullContentForItems`) or
the reader's new manual "Fetch now" action. A failed fetch — at either of
those two sites — sets the state to `"failed"` instead, so the reader can
distinguish "never attempted" from "attempted and failed" on the article's
next open. Articles that never came from a starred import never have this
field at all, so they are unaffected.

In `src/views/reader-view.ts`:

- `shouldSkipFullArticleFetch` gained a new
  `isStarredImportCachedPreview(item)` check (state `"unfetched"` or
  `"failed"`) that skips the automatic fetch-on-open exactly like the
  existing video/preferred-host checks, so `displayItem` never issues a
  network fetch for these articles until the user asks for one.
- `renderArticle`'s existing restricted/video banner `if`/`else if` chain
  gained a third branch, `renderStarredImportBanner`, rendered only when
  neither a restricted-content nor a video-source banner applies. It shows
  wording distinguishing "unfetched" from "failed", the formatted
  `starredImportedAt` timestamp, a **Fetch now** button
  (`rss-reader-starred-import-fetch-now`), and — mirroring the existing
  restricted-banner link — an **Open in Browser** link
  (`rss-reader-starred-import-open-link`) to `item.link`.
- `handleStarredImportFetchNow` (wired to the **Fetch now** button) reuses
  `fetchFullArticleContentWithOutcome` — the same pipeline the automatic
  fetch-on-open and the 234-06 import-time toggle both already use, so no
  second fetch implementation was introduced. On success it replaces
  `item.content`, clears `starredImportContentState`, and — only when
  `item.starred || item.saved` — persists both via the reader's existing
  `onArticleUpdate` settings-save path (the same seam
  `toggleReadStatus`/`toggleStarStatus` already use, which flows through
  `updateArticleStatus` → `plugin.updateArticle` → `saveSettings`). When the
  article is neither starred nor saved, the in-memory `FeedItem` is still
  updated for the current reading session, but nothing is written to disk.
  On failure, the state becomes `"failed"` (persisted under the same
  starred-or-saved condition), a `Notice` is shown, and the banner
  re-renders with the "failed" wording.

CSS for the new banner and its two actions was added to
`src/styles/reader.css`, mirroring the existing
`.rss-reader-paywall-banner`/`.rss-reader-video-banner` patterns (scoped
classes, no `!important`).

## Blocked by

None.

## Acceptance criteria

- [x] Starred-imported articles are tagged with a new content-state field at import time, initially "unfetched."
- [x] Opening an "unfetched" or "failed" article in the reader shows the cached-preview banner with the import date/time.
- [x] The banner includes a "Fetch now" button and the existing "Open in Browser" button.
- [x] The reader's automatic fetch-on-open is skipped for articles in these two states — no fetch happens until "Fetch now" is clicked.
- [x] Clicking "Fetch now" performs the fetch; on success the article's content is replaced, its state becomes "fetched" (represented as the field being cleared), and settings are saved, but only if the article is starred or saved.
- [x] On fetch failure, the article's state becomes "failed," and the banner reflects that distinctly from "never attempted" on the next open.
- [x] Reader behavior for articles without this content-state field (i.e. not from starred import) is unchanged — automatic fetch-on-open continues to work exactly as today.

## Implementation notes

- Tested at the `ReaderView` seam described in the ticket, following the
  same construction-and-mock pattern as the existing restricted-content
  banner tests
  (`test_files/unit/views/reader-view-restricted-banner.test.ts`): a real
  `ReaderView` built with mocked `app`/settings/article-saver dependencies,
  `fetchFullArticleContentWithOutcome` mocked at the module level via
  `vi.mock`, and DOM assertions on the rendered banner and its actions. New
  file: `test_files/unit/views/reader-view-starred-import-banner.test.ts`,
  covering: automatic-fetch skip + banner content/timestamp for
  "unfetched"; distinct wording for "failed"; unaffected automatic-fetch
  behavior when the field is absent; successful "Fetch now" replacing
  content, clearing state, and persisting for a starred article; a
  successful "Fetch now" that does *not* persist for an article that is
  neither starred nor saved; and a failed "Fetch now" moving the article to
  "failed" with the distinct banner wording on re-render.
- `test_files/unit/services/starred-import-mapper.test.ts` gained a test
  asserting every mapped candidate starts `"unfetched"` with a
  `starredImportedAt` timestamp taken during the mapping call.
- `test_files/unit/modals/import-starred-modal.test.ts`'s three existing
  full-content-fetch tests (toggle off, toggle on + success, toggle on +
  one failure among three) were extended with assertions on the resulting
  `starredImportContentState` per article, covering the "unfetched" default,
  the cleared/`"fetched"` success case, and the "failed" case, without
  changing any existing assertion.
