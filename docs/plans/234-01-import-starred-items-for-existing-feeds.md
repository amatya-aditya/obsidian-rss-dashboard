---
status: proposed
created: 2026-09-09
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 2
depends_on: ["233-opml-importer-shell-refactor"]
release_requirement: ""
implementation: ""
---

# Import starred.json for feeds you already subscribe to

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

The base "Import Starred Articles" flow, built on the shared importer shell from [233-opml-importer-shell-refactor](233-opml-importer-shell-refactor.md), living as a sibling entry point next to "Import OPML". A user picks an exported `starred.json` (Inoreader/Google-Reader-API "Read later"/starred format); a pure mapper reads `items[]` and, for this ticket, keeps only starred items whose source feed (`origin.streamId`, matched by URL) already exists locally. The preview groups these by source feed with per-article checkboxes. On execute, each selected item is inserted as a `FeedItem` built directly from the export's own fields (title, `canonical`/`alternate` href as link, `summary.content` as content, author, published date, `id` as guid) — never from a live feed re-fetch, since feeds churn and won't contain older items — with `starred: true` set (and `read: true` if the export marked it read).

Items whose feed does not yet exist locally are excluded from this ticket's import (deferred to [234-02](234-02-auto-create-missing-source-feeds.md)); no tag mapping (deferred to [234-04](234-04-map-labels-to-tags.md)) and no full-content fetch (deferred to [234-06](234-06-opt-in-full-content-fetch.md)) happen yet.

## Blocked by

- 233-opml-importer-shell-refactor (must be merged and manually confirmed)

## Acceptance criteria

- [ ] "Import Starred Articles" is discoverable next to "Import OPML" and opens a modal built on the shared importer shell.
- [ ] A pure mapper function/class turns a parsed `starred.json` into candidate `FeedItem`s (for feeds already present, matched by URL) with no network or Obsidian API dependency, tested against the real exported fixture file.
- [ ] The preview groups candidate items by source feed under collapsible headers with per-article selection.
- [ ] Executing the import inserts selected items into their feed's `items`, with `starred` (and `read`, when applicable) set from the export's category state.
- [ ] Items whose source feed doesn't exist locally are simply not shown/selectable in this ticket (no error needed yet — that's handled by later tickets).
