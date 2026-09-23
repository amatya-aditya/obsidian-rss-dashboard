---
status: implemented
created: 2026-09-10
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 2
depends_on: ["234-07-new-feed-metadata-refresh-toggle"]
release_requirement: ""
implementation: ""
---

# Tag-import toggle and unified confirmation

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

A second `Setting`/`addToggle` row (class `import-option-setting`,
`import-tag-import-setting`), labeled "Import labels as tags", added to the
Options panel established by
[234-07](234-07-new-feed-metadata-refresh-toggle.md) in
`src/modals/import-starred-modal.ts`'s `renderOptionsPanel`. It defaults on
(`tagImportEnabled = true`) and dims its own description via the existing
`import-option-description--disabled` class when off, matching the
metadata-refresh toggle's behavior.

The pure mapper (`mapStarredExportToCandidates`) still assigns every
candidate's `label/X` categories to `item.tags` unconditionally — it has no
plugin-settings dependency to gate against. A new private helper,
`getEffectiveTags`, is the single seam every consumer now reads through
instead of `item.tags` directly: it returns `item.tags` when the toggle is on
and `undefined` when it is off. `ensureAvailableTagsForSelection` (the
palette-mutation step) is only called at all when the toggle is on, and
`performImport` strips tags from the item actually persisted
(`applyStarredImportCandidateToFeed`) when the toggle is off, so an
imported/re-imported article carries no label-derived tags and the palette
gets no new entries in that case. When the toggle is on, behavior is
unchanged from the shipped 234-04 mapping.

A new inline "New tags (N)" section (`renderNewTagsSection`, classes
`import-new-tags-section`/`-heading`/`-list`/`-row`/`-icon`/`-name`) is
rendered in `renderPreview`, immediately visually matching the existing
"Unable to import (N)" section's DOM shape and CSS (row icon + name, hover
highlight, same heading/border treatment) rather than introducing a new
visual pattern. Its data source, `computeNewTags`, reads
`model.getSelectedCandidates()`, resolves each candidate's tags through
`getEffectiveTags`, and returns every distinct tag (case-insensitive name)
not already present in `settings.availableTags` — deliberately "every
currently-selected candidate's effective tags," not "only the bulk label
mapping," so a later ad hoc per-article tagging ticket (234-12) can add tags
to the same selected-candidate data this section already reads, without
restructuring it. The section is omitted entirely when there is nothing new
to report (e.g. every label already exists in the palette, or the toggle is
off). It recomputes on every `renderPreview` call, so it updates live as
articles are (de)selected, the tag-import toggle is switched, or (in the
future) an ad hoc tag is added to a candidate.

## Blocked by

- [234-07](234-07-new-feed-metadata-refresh-toggle.md) — needed the Options
  panel to add its toggle to. (Already shipped on this branch.)

## Acceptance criteria

- [x] The Options panel contains a tag-import toggle, on by default.
- [x] When off, imported articles carry no tags derived from Inoreader labels, and no new entries are added to the tag palette.
- [x] When on, behavior matches today's shipped label-to-tag mapping (234-04).
- [x] Before execute, an inline "New tags (N)" section lists every tag not already in the palette that will be added, in the same visual pattern as "Unable to import (N)".
- [x] The section updates live as articles/labels are selected or deselected in the preview.
- [x] Existing tag-mapping tests are updated to reflect the toggle; new tests cover both toggle states and the confirmation section's content.

## Implementation notes

- Tested at the existing `ImportStarredModal` DOM-level seam
  (`test_files/unit/modals/import-starred-modal.test.ts`), following the same
  construction-and-assertion pattern used throughout the shipped feature: mock
  plugin object, `handleFileSelection`, query the rendered preview DOM, click
  the toggle/checkboxes, assert resulting settings mutations. No new test seam
  was introduced.
- The pure mapper (`starred-import-mapper.ts`) and its existing test suite
  were left unchanged — the toggle only gates how the modal *uses* the tags
  the mapper already assigned, so there was no mapper-level behavior to
  update tests for.
- New modal tests cover: the toggle's presence/default/dimming, the "New
  tags (N)" section's content and live update on deselection, its absence
  when every label-derived tag already exists in the palette, the
  toggle-off path (no palette mutation, no tags on the persisted item), and
  the toggle-on path continuing to match the shipped 234-04 behavior.
