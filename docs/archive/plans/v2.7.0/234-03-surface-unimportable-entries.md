---
status: implemented
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
implementation: ""
---

# Surface unimportable entries with reasons

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

Extended the [234-01](234-01-import-starred-items-for-existing-feeds.md) mapper (`src/services/starred-import-mapper.ts`) so `mapStarredExportToCandidates` returns `{ candidates, unimportable }` instead of a bare candidate array. Entries that can never produce a candidate — no `origin.streamId` at all (`no_source_feed`), or neither a `canonical` nor an `alternate` href (`no_article_url`) — are classified into `unimportable`, each entry carrying its raw `id`, `title` (if present), and the specific reason. `no_source_feed` is checked first, so an entry missing both is reported as `no_source_feed`. An entry with a well-formed `origin.streamId` that simply doesn't match a locally-subscribed feed is still excluded from both lists, unchanged from 234-01 — that remains 234-02's "auto-create missing source feeds" concern, not a malformed-entry problem.

`src/modals/import-starred-modal.ts` now renders an "Unable to import (N)" section below the regular grouped preview, listing each unimportable entry's title (or id) and a human-readable reason, using the existing Obsidian DOM-helper/`setIcon` conventions from the rest of the preview. The section renders whenever there is at least one unimportable entry, independent of whether any candidates matched — including when a file has zero matching candidates but has unimportable entries, in which case the importer shell's "no items" error path is skipped so the unimportable list is still shown instead of being hidden behind a generic error.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [x] The mapper returns an `unimportable` list alongside its candidates, each entry carrying enough identifying info (title if present, raw id) and a specific reason (`no_source_feed` / `no_article_url`).
- [x] The import preview/results UI renders an "unable to import" section listing these with their reasons — never a silent drop.
- [x] Mapper tests cover both cases against synthetic entries derived from the real exported fixture's shape.

## Implementation notes

- Added `test_files/fixtures/starred/starred-unimportable.json`, a small synthetic fixture (no real personal data) with three entries derived from the real fixture's field shape: no `origin` at all, an `origin.streamId` with no `canonical`/`alternate`, and an entry missing both (to pin the `no_source_feed`-checked-first precedence).
- `StarredImportPreviewModel`'s constructor and public surface are unchanged — it still only knows about candidates. The modal owns the `unimportable` list directly (reset alongside `previewModel` on each file selection) rather than threading it through the preview model, since the preview model's responsibility is candidate selection state, not reporting.
