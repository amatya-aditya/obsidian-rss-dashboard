---
status: implemented
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
implementation: ""
---

# Auto-create missing source feeds during import

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

Extended [234-01](234-01-import-starred-items-for-existing-feeds.md) so starred items whose source feed (`origin.streamId`/`origin.title`/`origin.htmlUrl`) is not already in the user's feed list are no longer excluded. `mapStarredExportToCandidates` (`src/services/starred-import-mapper.ts`) now returns a candidate for every item that has an `origin.streamId`: candidates matching an existing feed carry `isNewFeed: false` as before, and candidates whose stream id has no local match carry `isNewFeed: true` plus `feedSiteUrl` (from `origin.htmlUrl`), grouped by the normalized stream id so multiple starred items for the same unknown source share one new-feed group. A new `buildNewFeedRecord()` helper builds the actual candidate `Feed` record once a target folder is chosen.

`StarredImportPreviewModel` tracks, per new-feed group, an editable target folder (`getNewFeedFolder`/`setNewFeedFolder`, defaulting to `"Uncategorized"`, validated through `isValidFolderName` exactly like `OpmlImportPreviewModel`'s folder-rename path) and exposes `getSelectedNewFeedGroups()` for groups with at least one selected article. `ImportStarredModal` renders each new-feed group with a "New feed" badge and the same inline click-pencil-to-edit folder control OPML's importer uses for renaming a folder segment (`renderNewFeedFolderControl`, mirroring `ImportOpmlModal`'s `renderFolderNode` interaction).

On execute, `performImport` creates a `Feed` record for each selected new-feed group (skipping creation if that URL was added locally by another path in the meantime), calls `ensureFolderExists` for its folder, and pushes it into `settings.feeds` — then inserts every selected candidate's `FeedItem` (existing-feed and new-feed alike) and calls `saveSettings()` in the same synchronous flow as before, so the historical starred item is starred/read immediately. Only afterward, `fetchNewlyCreatedFeed()` fires an un-awaited `feedParser.refreshFeed(feed)` per newly created feed; when it resolves it replaces that feed's settings entry and saves again, but a failure is non-fatal (`refreshFeed` already catches and records `lastFetchError` rather than throwing) and never blocks or removes the already-inserted starred item.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds (merged into this branch's base; PR #238 open, not yet merged to `dev`)

## Acceptance criteria

- [x] The mapper also emits candidate `Feed` records for source feeds not already present locally (matched by URL).
- [x] The preview shows these new feeds grouped with their starred items and lets the user edit the target folder per new feed before import.
- [x] Executing the import creates the new feed(s), triggers one feed-fetch/refresh for metadata/current items, and inserts the historical starred item(s) regardless of what that live fetch returns.
- [x] A starred item for a brand-new feed is starred (and read, if applicable) immediately after import, without waiting on the feed-fetch to complete.

## Implementation notes

- The 234-01 mapper test asserting that unmatched-feed items were *excluded*, and the modal test asserting a "no items matched an existing feed" error for an all-unmatched fixture, tested exactly the behavior this ticket supersedes. Both were rewritten (not left in place) to assert the new `isNewFeed` contract; the fixture (`test_files/fixtures/starred/starred.json`) was not changed since it already contained an unmatched-source item.
- Duplicate-URL guard: if a new-feed candidate's URL already exists in `settings.feeds` by the time `performImport` runs (e.g. added through another path while the preview was open), the existing feed is reused instead of creating a second `Feed` row with the same URL. This is basic correctness, not the re-import dedup/merge ticket (234-05).
- No re-import dedup for the historical item itself either, consistent with 234-01: selected items are appended to the target feed's `items` array unconditionally.
