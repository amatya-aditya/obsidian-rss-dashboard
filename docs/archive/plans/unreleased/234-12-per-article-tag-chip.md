---
status: implemented
created: 2026-09-10
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 3
depends_on: ["234-11-tag-import-toggle-and-confirmation"]
release_requirement: ""
implementation: ""
---

# Per-article tag chip, replaces Read/Unread

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

Each article row in `src/modals/import-starred-modal.ts`'s preview
(`renderItemRow`) now shows the article's assigned tags as chips instead of
the old "Read"/"Unread" text. The chip control (`renderItemTagsControl`)
reuses the exact chip renderer already used on dashboard cards,
`renderSingleRowCardTagChips` (`src/components/article-list/utils/tag-layout-utils.ts`)
— one or more visible chips plus a "+N" overflow chip — rather than
introducing a second chip renderer. An article with no tags shows a small
tag-icon placeholder instead of an empty control, so the row stays a
consistent, clickable target either way.

Clicking the control opens `createTagsDropdownPortal`
(`src/utils/tags-dropdown-portal.ts`) — the same tag-editing portal already
used from the article list and reader view — wired against `candidateItem`,
the live `FeedItem` backing that row. A new `StarredImportPreviewModel`
method, `getCandidateItem(guid)`, returns that live reference (not the
`StarredImportPreviewItemSnapshot` copy `getGroups()`/`renderItemRow` already
used for the rest of the row), so the portal's `onTagAssignmentChange`
callback mutates `candidateItem.tags` in place. Because `performImport` later
reads tags from that same object via `getSelectedCandidates()`, an edit made
in the preview — add, remove, or create a tag — carries through to the
actual imported item with no separate sync step.

To keep the palette-mutation step confined to the single confirmation path
234-11 established, the portal is not handed `this.plugin.settings` directly.
Instead, `showItemTagsDropdown` builds a shallow settings view whose
`availableTags` is the real palette plus every tag `computeNewTags` (234-11)
currently considers pending — i.e. already assigned to some selected
candidate but not yet in the real palette. This lets the portal's own
duplicate-name check and tag list work normally, including reusing an ad hoc
tag created from a different row, without the portal's existing
`submitInlineTag` (which pushes directly into whatever `availableTags` array
it's given) ever touching the real `settings.availableTags` from inside the
preview. The real palette is only ever mutated where it already was —
`performImport`'s `ensureAvailableTagsForSelection` step, at execute time.

After every tag change, the row's chips and the "New tags (N)" section
(234-11's `renderNewTagsSection`) are refreshed in place
(`refreshNewTagsSection`, which removes and re-renders just that section)
rather than via a full `renderPreview()`, so the open portal's anchor element
survives the update and the dropdown stays open for further edits. Since
`computeNewTags` already reads live from every selected candidate's tags,
a tag created on the fly through the chip appears there automatically with
no second confirmation path.

The Options panel, the preview list's grid layout, and the pure mapper
(`starred-import-mapper.ts`) are all unchanged. `StarredImportPreviewItemSnapshot`
still carries `read` (an existing model-level test asserts it), only the
modal's rendering of it was removed.

## Blocked by

- [234-11](234-11-tag-import-toggle-and-confirmation.md) — ad hoc tags
  created here must feed the same confirmation section that ticket
  establishes, not a separate one. (Already shipped on this branch.)

## Acceptance criteria

- [x] Each article row displays its assigned tags as chips using the existing dashboard-card chip renderer.
- [x] Clicking a chip opens the existing tag-editing portal, pre-populated with that article's current tags.
- [x] Adding, removing, or creating a tag through the portal updates the underlying candidate article's tags, which carry through to the actual imported item.
- [x] A tag created on the fly through this control appears in the "New tags (N)" confirmation section — there is exactly one confirmation path, not two.
- [x] The "Read"/"Unread" text no longer appears anywhere on the article row.
- [x] New tests assert: chip rendering reflects an article's tags; clicking a chip invokes the portal with the expected article reference (the portal's own internals are not newly tested); tags added via the chip surface in the confirmation section.

## Implementation notes

- `createTagsDropdownPortal` is mocked at the module level
  (`vi.mock("../../../src/utils/tags-dropdown-portal", ...)`) in
  `test_files/unit/modals/import-starred-modal.test.ts`, per the spec's
  testing decision that the portal's own internals get no new coverage.
  Tests instead capture the mock's call arguments and invoke
  `onTagAssignmentChange` directly to simulate a user editing tags through
  it.
- New tests (in a `per-article tag chip (234-12)` describe block) cover:
  chip rendering for a labeled and an unlabeled article, the absence of
  "Read"/"Unread" text on every row, the portal being invoked with the
  clicked row's own live candidate reference, adding a tag persisting
  through to the imported item, removing a tag, and an ad hoc created tag
  surfacing in the "New tags (N)" section.
- CSS additions are scoped to `.import-preview-tags-control.rss-dashboard-tag-container`
  (two-class specificity, no `!important`) to override the shared
  `.rss-dashboard-tag-container` dashboard rule's wrapping/margin so the
  single-row chip renderer's own "+N" overflow behavior — not CSS line
  wrapping — decides what's visible in this row's fixed-width column.
