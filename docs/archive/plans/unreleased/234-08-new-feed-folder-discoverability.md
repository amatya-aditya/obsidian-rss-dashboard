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

# New-feed folder-assignment discoverability

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

The existing per-new-feed-group folder-edit control
(`renderNewFeedFolderControl` in
`src/modals/import-starred-modal.ts`) now leads with a "folder" icon
(class `import-preview-folder-icon`, `setIcon(..., "folder")`) placed before
the "Folder: X" text, reusing the exact icon `ImportOpmlModal` already uses
for its folder rows. The control's structure, position (inline on the
new-feed group's row), and click-to-edit-inline interaction — click the
pencil, edit inline, commit on Enter/blur, validate via `isValidFolderName`
— are all unchanged; the pencil edit affordance is still present alongside
the new folder icon.

The Import Starred Articles preview also gains brief helper text (paragraph,
class `import-preview-helper`) rendered above the "Fetch full article
content" toggle, whenever the preview contains at least one new-feed group
(`stats.newFeedGroups > 0`): "New feeds are imported into an editable target
folder. Use the folder icon on a new feed's row to change it before
importing."

Both additions are purely presentational/discoverability — no change to
`StarredImportPreviewModel`, folder validation, or import execution.

## Blocked by

None.

## Acceptance criteria

- [x] The folder-edit control on a new-feed group's row displays a folder icon, visually distinguishing it from a generic rename action.
- [x] The import modal displays helper text explaining that new feeds are placed in an editable target folder.
- [x] The existing click-to-edit-inline, validate, and commit behavior for the folder field is unchanged.
- [x] Existing tests for the folder-edit control continue to pass; a new test asserts the folder icon and helper text are present.

## Implementation notes

- Styling for the new folder icon (`--icon-size: 14px`, `flex-shrink: 0`) and
  the helper text (`--text-muted`, `--font-ui-small`) lives in
  `src/styles/import-starred-modal.css`, scoped with class-compound
  selectors (no `!important`) so the icon-size override wins over the
  shared `.import-preview-icon` rule from `import-opml-modal.css` regardless
  of stylesheet load order.
- Tested at the existing `ImportStarredModal` DOM-level seam
  (`test_files/unit/modals/import-starred-modal.test.ts`), following the
  same construction-and-assertion pattern used throughout the shipped
  234-01..234-07 feature: mock plugin object, `handleFileSelection`, query
  the rendered preview DOM. A new test asserts the folder icon's
  `dataset.icon === "folder"` and that the helper text is present and
  mentions an editable target folder. No new test seam was introduced.
