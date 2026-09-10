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

# New-feed metadata refresh toggle

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What was built

An "Options" panel (`renderOptionsPanel`, class `import-options-panel`) in the
Import Starred Articles modal (`src/modals/import-starred-modal.ts`),
rendered above the "Preview" section. It contains a `Setting`/`addToggle`
row (class `import-option-setting`) labeled "New-feed metadata refresh",
off by default (`newFeedMetadataRefreshEnabled`). The panel's structure and
heading are written to accommodate more than one option row, since the
tag-import toggle (234-11) joins the same panel in a later ticket.

`performImport`'s existing feed-creation loop is unchanged and unconditional:
a new feed is always created immediately from the export's own
`origin.title`/`origin.htmlUrl` via `buildNewFeedRecord`, and its historical
starred item(s) are always inserted, regardless of the toggle. Only the
fire-and-forget `fetchNewlyCreatedFeed` call — the single background
`feedParser.refreshFeed` per newly created feed that populates its live
title/site URL/icon/current items — is now gated behind
`this.newFeedMetadataRefreshEnabled`. When on, that call happens exactly as
it did before this ticket (unchanged, non-blocking, one call per created
feed). When off, `fetchNewlyCreatedFeed` is never invoked, so
`feedParser.refreshFeed` makes zero calls for any newly created feed; the
feed keeps only its export-derived placeholder data until its next normal
scheduled or manual refresh.

The toggle's own description text (`setting-item-description`) dims via a
scoped CSS class, `import-option-description--disabled` (opacity 0.5,
`src/styles/import-starred-modal.css`), applied whenever the toggle is off
and removed when turned on — no `!important`, no other row's styling is
affected.

## Blocked by

None.

## Acceptance criteria

- [x] An "Options" panel renders above "Preview" in the import modal.
- [x] It contains a toggle for new-feed metadata refresh, off by default.
- [x] When off, no live feed-refresh call happens for any newly created feed during import.
- [x] When on, exactly one live feed-refresh call happens per newly created feed, as today.
- [x] The new feed's source (subscription) is created regardless of the toggle's state.
- [x] The toggle's description text is visibly dimmed via a disabled-state style when off.
- [x] Existing tests for the current (unconditional) fetch behavior are updated to reflect the toggle-gated behavior; new tests cover both toggle states.

## Implementation notes

- Tested at the existing `ImportStarredModal` DOM-level seam
  (`test_files/unit/modals/import-starred-modal.test.ts`), following the
  same construction-and-assertion pattern used throughout the shipped
  234-01..234-06 feature: mock plugin object, `handleFileSelection`, query
  the rendered preview DOM, click the toggle, assert resulting settings
  mutations and refresh-call counts. No new test seam was introduced.
- The pre-existing test asserting the unconditional live fetch for a newly
  created feed was updated to turn the toggle on first (that behavior now
  requires it); a new test covers the toggle-off case (feed still created
  from export-only data, zero `refreshFeed` calls), and two more cover the
  Options panel's placement/default state and the description-dimming
  CSS toggle.
