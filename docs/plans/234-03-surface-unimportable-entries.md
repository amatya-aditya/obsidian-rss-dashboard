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

# Surface unimportable entries with reasons

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

Some `starred.json` entries can't be imported at all: missing `origin.streamId` (no identifiable source feed) or missing both `canonical` and `alternate` href (no article URL). Rather than silently dropping these, the mapper from [234-01](234-01-import-starred-items-for-existing-feeds.md) classifies them into an `unimportable` list with a specific reason per entry, and the import UI shows an "unable to import" section listing each one with its title (if available) and reason.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [ ] The mapper returns an `unimportable` list alongside its candidates, each entry carrying enough identifying info (title if present, raw id) and a specific reason (`no_source_feed` / `no_article_url`).
- [ ] The import preview/results UI renders an "unable to import" section listing these with their reasons — never a silent drop.
- [ ] Mapper tests cover both cases against synthetic entries derived from the real exported fixture's shape.
