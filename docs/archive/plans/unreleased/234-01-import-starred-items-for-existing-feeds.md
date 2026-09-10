---
status: implemented
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
implementation: ""
---

# Import starred.json for feeds you already subscribe to

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

The base "Import Starred Articles" flow, built on the shared importer shell from [233-opml-importer-shell-refactor](../../../plans/233-opml-importer-shell-refactor.md), living as a sibling entry point next to "Import OPML" in the Import/Export settings tab. A user picks an exported `starred.json` (Inoreader/Google-Reader-API "Read later"/starred format); a pure mapper (`src/services/starred-import-mapper.ts`) reads `items[]` and keeps only starred items whose source feed (`origin.streamId`, matched by URL after stripping the `feed/` stream-id prefix) already exists locally. The preview (`src/services/starred-import-preview-model.ts`, rendered by `src/modals/import-starred-modal.ts`) groups these by source feed with per-article and per-feed-group checkboxes and collapsible group headers. On execute, each selected item is inserted as a `FeedItem` built directly from the export's own fields (title, `canonical`/`alternate` href as link, `summary.content` as content/description, author, published date, `id` as guid) — never from a live feed re-fetch — with `starred: true` set unconditionally and `read` passed through from the export's `.../state/com.google/read` category.

Items whose feed does not yet exist locally were excluded from this ticket's import; that gap is closed by [234-02](234-02-auto-create-missing-source-feeds.md). Surfacing entries that can never be imported (no source feed, no article URL) was completed in [234-03](234-03-surface-unimportable-entries.md), and label-to-tag mapping was completed in [234-04](234-04-map-labels-to-tags.md). No full-content fetch (deferred to [234-06](../../../plans/234-06-opt-in-full-content-fetch.md)) happens yet.

## Blocked by

- 233-opml-importer-shell-refactor (merged and manually confirmed; PR #236, issue #233 closed)

## Acceptance criteria

- [x] "Import Starred Articles" is discoverable next to "Import OPML" and opens a modal built on the shared importer shell.
- [x] A pure mapper function/class turns a parsed `starred.json` into candidate `FeedItem`s (for feeds already present, matched by URL) with no network or Obsidian API dependency, tested against a synthetic fixture mirroring the real exported field shape (`test_files/fixtures/starred/starred.json`; the maintainer's real personal export was read once for shape only and never committed).
- [x] The preview groups candidate items by source feed under collapsible headers with per-article selection.
- [x] Executing the import inserts selected items into their feed's `items`, with `starred` (and `read`, when applicable) set from the export's category state.
- [x] Items whose source feed doesn't exist locally are simply not shown/selectable in this ticket (no error needed yet — that's handled by later tickets).

## Implementation notes

- Persistence seam: direct mutation of the matched `Feed.items` array followed by `plugin.saveSettings()` — the same seam `BackgroundImportService` uses (`saveSettingsWithMode` → `this.saveSettings()`). This repository checkout has no separate `data-sync-lease` module; `plugin.saveSettings()` (routed through `feedStorageRepository.persistSettings`) is the only settings-persistence seam in the codebase, so it is also the correct one for this direct, non-fetch insertion.
- `StarredImportPreviewModel` is a new, article-shaped model (parallel to `OpmlImportPreviewModel`'s public surface where the shell requires it, i.e. `getStats()`) — `OpmlImportPreviewModel` itself was not touched or generalized, per the #233 decision.
- No re-import dedup at the time this ticket was built: selected items were appended to the target feed's `items` array unconditionally. Idempotent re-import dedup/merge was completed in [234-05](234-05-idempotent-reimport-dedup-merge.md).
