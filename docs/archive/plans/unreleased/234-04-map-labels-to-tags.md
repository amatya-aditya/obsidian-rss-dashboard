---
status: implemented
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
implementation: ""
---

# Map Inoreader labels to tags

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

Extended the mapper from [234-01](234-01-import-starred-items-for-existing-feeds.md) (`src/services/starred-import-mapper.ts`) to translate each starred item's `categories[]` into `Tag`s on the resulting candidate `FeedItem`: entries matching `.../label/X` become a `{name, color}` tag, reusing an existing `settings.availableTags` entry's color on a case-insensitive name match, or `DEFAULT_LABEL_TAG_COLOR` (`#3498db`, matching the fixed default color offered when a user manually creates a tag elsewhere in the plugin) when the label is new. `.../state/com.google/starred` and `.../state/com.google/read` continue to only set the `starred`/`read` booleans, and `.../state/com.google/reading-list` is ignored entirely — neither ever produces a tag.

The mapper itself stays pure (no Obsidian API/plugin-state dependency) and never mutates `availableTags`; it only decides each label's `{name, color}`. `ImportStarredModal.performImport` (the execute step) is the seam that actually persists a brand-new label into `settings.availableTags`, reusing the exact `{name, color}` object the mapper already assigned rather than re-deciding a color.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [x] `label/X` categories on a starred item become `Tag` entries on the resulting `FeedItem`.
- [x] System-state categories (`starred`, `read`, `reading-list`) never produce tags.
- [x] A label not already in `settings.availableTags` is added there with a color chosen via the plugin's existing default-tag-color logic (same as manual tag creation), not a hardcoded fixed color.
- [x] Mapper tests cover: an item with multiple labels, an item with no labels, and a label that already exists in `availableTags` (no duplicate palette entry created).

## Implementation notes

- `mapStarredExportToCandidates` gained a third, optional `availableTags: readonly Tag[]` parameter (defaults to `[]`); its return type is unchanged (`StarredImportCandidate[]`), so callers that don't need label mapping are unaffected.
- Within one `mapStarredExportToCandidates` call, two items referencing the same brand-new label share the identical `Tag` object (and therefore color) via a locally-scoped `newTagsByLowerName` map, so a single import batch never produces two differently-colored entries for what will become one palette tag.
- `ImportStarredModal.ensureAvailableTagsForSelection` re-checks `settings.availableTags` at execute time (not just at preview-build time) before pushing a new tag, matching case-insensitively, so a tag manually added by the user between opening the preview and clicking Import is not duplicated.
- [234-05](234-05-idempotent-reimport-dedup-merge.md) (idempotent re-import) built on this: the label→tag shape is `candidate.item.tags?: Tag[]`, and was merged directly with `mergeTagArrays` in `src/utils/tag-utils.ts`.
