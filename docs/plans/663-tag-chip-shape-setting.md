---
status: in-progress
created: 2026-10-08
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/663"
milestone: ""
owner: unassigned
workstream: "tags"
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Tag Chip Shape Setting Plan

This plan covers [issue #663](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/663): one shared, user-selectable corner shape for every colored tag chip the plugin renders. It records the acceptance criteria (AC), decisions (DEC) and test seams (TEST) so the work can be traced end to end. The issue refers to this design as `TAGCHIP-DESIGN-v1`.

## Acceptance criteria

- **AC-001 Default and persistence.** New installs and legacy settings without a shape preference use Pill (`999px`). The selected or custom value survives reload; factory reset restores Pill.
- **AC-002 Presets.** The Tags tab shows Rectangle (`0px`), Squircle (`10px`) and Pill (`999px`) as labeled tag previews. Choosing one applies immediately. The active choice has an accent outline and a non-color selected indicator; **Reset to Pill** restores the default.
- **AC-003 Custom value.** A valid CSS `border-radius` value previews, persists and applies immediately. Invalid input is identified accessibly and does not replace the last valid saved and applied value. A custom value has a live sample; a value matching a preset selects that preset.
- **AC-004 Shared rendering.** Every plugin-rendered colored tag chip uses the shared radius across dashboard card, list and feed views, the Reader, tag popovers and dropdowns, podcast and episode rows, previews, inherited-tag displays, import previews, modals, and overflow chips.
- **AC-005 Live propagation.** Changing the preference updates already-open views, including popouts, without a reload. The value is restored after Obsidian restarts.
- **AC-006 Accessibility.** Preset selection is keyboard-operable and exposes selection to assistive technology. Focus styling is visibly distinct from selected styling.
- **AC-007 Bundle round-trip.** Settings bundle export and import preserve the selected preset or custom radius.
- **AC-008 Scope boundaries.** Feed-category chips, color swatches and dots, and non-tag controls keep their existing shapes. Tag colors, text, spacing, layout and behavior do not change as a side effect.

## Decisions

| ID      | Status                  | Decision                                                                                                                                                                                                                                                                    |
| ------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 | Settled (issue)         | One shared radius preference. Presets are Rectangle `0px`, Squircle `10px`, Pill `999px`; default Pill. Standard `border-radius` only, no `corner-shape`.                                                                                                                   |
| DEC-002 | Settled (issue)         | A custom value is allowed: lengths, percentages and multi-corner shorthand. Validate before applying or saving; keep the last valid value on invalid input; offer **Reset to Pill**.                                                                                        |
| DEC-003 | Settled (issue)         | One RSS Dashboard-namespaced CSS custom property, `--rss-dashboard-tag-chip-radius`. Consolidate duplicate chip rules rather than adding late overrides. No `!important`, no lint suppressions.                                                                             |
| DEC-004 | Settled (issue)         | Excluded: feed-category chips, color swatches and dots, and non-tag controls.                                                                                                                                                                                               |
| DEC-005 | Settled (issue)         | Legacy, missing or invalid persisted values normalize to `999px`, through settings save and load, factory reset, and bundle export and import.                                                                                                                              |
| DEC-006 | Assumption, needs Marc  | The field lives at `settings.display.tagChipRadius` (a string), next to the other display options. `settings-import-applier.ts` merges `display` shallowly, so normalization after import must backfill it.                                                                 |
| DEC-007 | Assumption, needs Marc  | Validation is a pure grammar check (one to four non-negative length or percentage tokens, optionally `/` and one to four more; CSS-wide keywords and `var()` rejected), not a DOM probe, so the loader, bundle import and Tags tab share one validator that jsdom can test. |
| DEC-008 | Confirmed by Marc       | Kagi Small Web domain and age labels reuse `.rss-discover-card-tag` but are metadata, not tags. They keep their 12px radius through the `rss-smallweb-meta-tag` modifier class.                                                                                             |
| DEC-009 | Confirmed by Marc       | The `+N` overflow chips (`.rss-dashboard-tag-overflow`, `.podcast-tag-more`, `.episode-list-row-tag-more`) are in scope, because the issue lists overflow chips.                                                                                                            |
| DEC-010 | Confirmed by Marc (FYI) | The default is Pill, so chips that are less rounded today (Reader and feed preview tags at 4px, article tag menu labels at 3px) change shape on upgrade. This is the intent of the issue and is called out in the changelog.                                                |

## Test seams

- **TEST-001 Persistence and bundle** (AC-001, AC-007, DEC-005). Unit tests at `loadAndNormalizeSettings`, `migrateSettings`, `buildFactoryResetSettings` and the bundle build, parse and apply path: a missing, invalid or valid value; factory reset returns `999px`; export then import round-trips `0px`, `10px`, `999px` and `12px 4px / 2px`.
- **TEST-002 Tags tab control** (AC-002, AC-003, AC-006). jsdom tests of `renderTagsSettingsTab`: a preset click saves and emits, `aria-checked` and the selected indicator, arrow-key, Enter and Space operation, invalid input sets `aria-invalid` with a described error and does not save, a matching custom value selects its preset, **Reset to Pill**.
- **TEST-003 Stylesheet contract** (AC-004, AC-008). `test_files/unit/styles/tag-chip-radius.test.ts` parses `src/styles/*.css` in `index.css` import order and asserts that each included chip selector has exactly one radius declaration, `var(--rss-dashboard-tag-chip-radius, 999px)`, that each excluded selector keeps its radius, and that no tag chip radius uses `!important`.
- **TEST-004 End to end** (AC-004, AC-005, AC-008). Run in the fixture vault in real Obsidian (see [the fixture vault guide](../development/fixture-vault.md)): every surface against each preset, a custom value and an invalid value; popout live update; restart persistence; bundle round-trip; narrow and mobile layout.

## Chip inventory

Included, all driven by the shared variable with one declaration each:

| Selector                      | Surface                                                         | Effective radius before |
| ----------------------------- | --------------------------------------------------------------- | ----------------------- |
| `.rss-dashboard-tag-badge`    | Card, list and feed views, inherited tags, import preview chips | 12px (three rules)      |
| `.rss-dashboard-tag-overflow` | `+N` overflow chip in the article list                          | 12px                    |
| `.rss-dashboard-tag-label`    | Article tag menu labels                                         | 3px                     |
| `.rss-discover-card-tag`      | Discover card tags                                              | 12px (two rules)        |
| `.podcast-tag`                | Podcast player tags, with `.podcast-tag-more`                   | 12px                    |
| `.episode-list-row-tag`       | Episode row tags, with `.episode-list-row-tag-more`             | 12px                    |
| `.rss-reader-tag`             | Reader tags                                                     | 4px                     |
| `.feed-preview-tag`           | Feed preview modal tags                                         | 4px                     |

Excluded and unchanged: `.feed-preview-category` (4px), `.rss-discover-card-category`, the tag color dots and swatches, color pickers, the tags toggle, dropdown and mobile sheet, tag action buttons and inline inputs, sidebar tag counts and add-tag controls, the tag multi-select control, and Kagi Small Web `.rss-smallweb-meta-tag` labels (12px).

## Work breakdown

1. **Setting, validator and persistence.** Add `settings.display.tagChipRadius` with default `999px`, the shared validator, preset table and constants, and make load, migrate, factory reset and bundle import and export preserve or repair it. Covers AC-001 and AC-007 (TEST-001).
2. **CSS consolidation.** Move every included chip onto the shared variable with one declaration per class, split the feed preview category rule, and add the Kagi modifier class. Covers AC-004 (CSS half) and AC-008 (TEST-003).
3. **Live application.** A small service sets the property on each open document's `body`, including popouts and portals, on load, on a change event and when a window opens, and removes it on unload. Covers AC-005.
4. **Tags tab control.** Preset previews as a radio group, a custom input with a live sample and accessible errors, and **Reset to Pill**. Covers AC-002, AC-003 and AC-006 (TEST-002).
5. **Integration verification.** Run TEST-004 in the fixture vault and file any bug as its own issue.
6. **Docs.** The changelog entry (DEC-010 included) and this plan.

## Out of scope

Tag colors, typography, padding, spacing and layout; feed-category chips; color swatches and dots; and any change to tag behavior.
