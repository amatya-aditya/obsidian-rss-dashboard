---
status: proposed
created: 2026-09-09
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 3
depends_on: ["234-01-import-starred-items-for-existing-feeds"]
release_requirement: ""
implementation: ""
---

# Auto-create missing source feeds during import

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

Extend [234-01](../archive/plans/unreleased/234-01-import-starred-items-for-existing-feeds.md) so starred items whose source feed (`origin.streamId`/`origin.title`/`origin.htmlUrl`) is not already in the user's feed list are no longer excluded. The mapper produces candidate `Feed` records for these new sources; the preview lets the user assign/edit each new feed's folder placement (same editable-folder UX pattern as OPML import's preview tree, not a fixed "Imported" folder). On execute, any selected new feed is created and then fetched/refreshed once via the existing feed-fetch pipeline — purely to populate feed metadata (title, siteUrl, icon) and current items — independently of, and not blocking, insertion of the historical starred item itself (which still comes from the export's own data, per 234-01).

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [ ] The mapper also emits candidate `Feed` records for source feeds not already present locally (matched by URL).
- [ ] The preview shows these new feeds grouped with their starred items and lets the user edit the target folder per new feed before import.
- [ ] Executing the import creates the new feed(s), triggers one feed-fetch/refresh for metadata/current items, and inserts the historical starred item(s) regardless of what that live fetch returns.
- [ ] A starred item for a brand-new feed is starred (and read, if applicable) immediately after import, without waiting on the feed-fetch to complete.
