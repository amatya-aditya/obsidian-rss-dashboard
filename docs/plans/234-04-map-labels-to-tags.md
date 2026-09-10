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

# Map Inoreader labels to tags

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

Extend the mapper from [234-01](../archive/plans/unreleased/234-01-import-starred-items-for-existing-feeds.md) to translate each starred item's `categories[]` into plugin tags: entries matching `.../label/X` become a `{name, color}` tag on the imported `FeedItem`; `.../state/com.google/starred` and `.../state/com.google/read` continue to only set the `starred`/`read` booleans (already handled in 234-01) and are never turned into tags; `.../state/com.google/reading-list` is ignored entirely. Any label name not already present in `settings.availableTags` is added there, using the same default-color assignment logic already used when a user creates a tag manually, so it appears immediately in the normal tag-filter UI.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [ ] `label/X` categories on a starred item become `Tag` entries on the resulting `FeedItem`.
- [ ] System-state categories (`starred`, `read`, `reading-list`) never produce tags.
- [ ] A label not already in `settings.availableTags` is added there with a color chosen via the plugin's existing default-tag-color logic (same as manual tag creation), not a hardcoded fixed color.
- [ ] Mapper tests cover: an item with multiple labels, an item with no labels, and a label that already exists in `availableTags` (no duplicate palette entry created).
