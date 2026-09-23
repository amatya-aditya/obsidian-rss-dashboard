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

# Remove the import-time full-content-fetch toggle

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

The "Fetch full article content" toggle and its eager, at-import-time fetch
pipeline (234-06) were removed from `src/modals/import-starred-modal.ts`
entirely:

- The toggle's `Setting`/`addToggle` UI block in `renderPreview`, its
  backing `fetchFullContentEnabled` field, and its class
  (`import-fetch-full-content-setting`) are gone.
- `performImport`'s eager call site — `await
  this.fetchFullContentForItems(importedItems)` gated on
  `fetchFullContentEnabled`, plus the second `saveSettings()` call that
  persisted its results — is gone. The `importedItems` tracking array (and
  the now-unused `findMatchingFeedItem` import it required) was removed
  along with it, since nothing downstream needs the actual post-merge
  `FeedItem` references anymore.
- The `fetchFullContentForItems` method itself, the `FullContentFetchFailure`
  interface, the `fullContentFailures` field, and the
  `renderFullContentResultsSummary` results screen it fed (previously shown
  after `close()` whenever at least one fetch failed) are all removed.
  `performImport` now always calls `this.close()` once the notice is shown —
  the failure-summary branch is gone, not merely unreachable.
- The `fetchFullArticleContentWithOutcome` import was removed from this
  file (the modal no longer calls it), but the function itself was left
  untouched in `src/utils/full-article-fetch.ts` — `ReaderView`'s
  `handleStarredImportFetchNow` (234-09) and its automatic fetch-on-open
  path still depend on it.
- No plugin-settings-level default was tied to this toggle (it was
  component-local modal state, not persisted in `settings`), so there was
  nothing to remove from `src/types/types.ts` or the settings tabs.
- No CSS was scoped to the removed toggle or failure-summary UI — both
  reused generic `.import-preview-*`/`.setting-item` classes that remain in
  use elsewhere in the modal, so `src/styles/import-starred-modal.css` was
  left unchanged.

Imported articles now always start in the `"unfetched"` content state
stamped by `toFeedItem` in `src/services/starred-import-mapper.ts` (234-09,
untouched by this ticket), relying solely on the reader's manual "Fetch now"
banner (234-09) for anything beyond the export's own content.

## Blocked by

- [234-09](234-09-manual-full-content-fetch-in-reader.md) — the reader-side
  replacement already existed and worked before this eager import-time path
  was removed, so there was no window where starred articles had no way to
  ever get full content.

## Acceptance criteria

- [x] The "Fetch full article content" toggle and its description no longer appear in the import modal.
- [x] No full-content fetch call happens during import, regardless of any setting.
- [x] The import-time failure-summary screen this toggle used to trigger is removed (or confirmed unreachable) along with it.
- [x] Existing tests asserting the old toggle's presence/behavior are removed or rewritten; a test confirms zero fetch calls occur during import.

## Implementation notes

- `test_files/unit/modals/import-starred-modal.test.ts`: removed the three
  tests exercising the old toggle (fetch-off, fetch-on success, fetch-on
  partial failure) and the `getFullContentToggle` helper they used, and
  replaced them with a single test asserting: the toggle and its label text
  are absent from the rendered modal, `fetchFullArticleContentWithOutcome`
  is never called during import even when mocked to resolve successfully,
  every imported article keeps its export-provided content and
  `"unfetched"` `starredImportContentState`, and the failure-summary DOM
  (`.import-fetch-full-content-failures`) never appears.
- Full quality gate run from the worktree root: `npm run test:unit` (202
  files / 1872 tests passed), `npm run lint`, `npm run check:compliance`,
  `npx tsc -noEmit -skipLibCheck`, and `npm run build` all passed with no
  suppressions added.
