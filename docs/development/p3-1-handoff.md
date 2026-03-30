# P3-1: Modals + Settings Coverage Push + Fixtures - Handoff (post P2-6)

## Status

P3-1 is **complete** (implemented 2026-03-29).

### Baseline (before P3-1) (2026-03-29)

From `npm run test:unit -- --coverage` (see `coverage/coverage-final.json`):

- Global: Lines **35.19%** | Branches **29.98%** | Functions **29.17%**
- Thresholds (`vitest.config.mjs`): Lines **35** | Branches **29** | Functions **29**

Category callouts (measured):

- Modals: Lines **3.89%** (dominant gap)
- Settings: Lines **27.48%** (very low branch coverage)

### New snapshot (after P3-1) (2026-03-29)

From `npm run test:unit -- --coverage`:

- Global: Lines **39.71%** | Branches **31.57%** | Functions **32.95%**
- Thresholds (`vitest.config.mjs`): Lines **35** | Branches **29** | Functions **29** (unchanged)

## Context

This continues the coverage improvement roadmap in:

- `docs/development/test-coverage-improvement-plan.md`
- Latest coverage include expansion is complete (P2-6): `coverage.include` now includes `main.ts`.

Why P3-1: the biggest remaining risk/coverage holes are **modal-driven user flows** (feed management, OPML import) and **settings tabs** (branchy UI/config logic). These are also high ROI for moving global totals.

## Task (P3-1)

### Constraints

- No new test dependencies in this phase (Vitest + jsdom + existing Obsidian stubs).
- Keep global thresholds unchanged while expanding the tested surface area.
- Prefer behavior assertions (DOM + side effects) over snapshots.

### Deliverables

1. Add fixtures for OPML parsing/import flows:

- Create `test_files/fixtures/opml/`
- Add 3 fixtures:
  - `single-feed.opml`
  - `nested-folders.opml`
  - `invalid.opml` (malformed XML)

2. Add unit tests (jsdom) targeting the highest ROI files first:

- `src/modals/import-opml-modal.ts`
- `src/modals/feed-manager/feed-manager-modal.ts`
- `src/modals/feed-manager/add-feed-modal.ts`
- `src/modals/feed-manager/edit-feed-modal.ts`
- `src/settings/tabs/media-settings-tab.ts` (currently ~0% lines)
- `src/settings/tabs/tags-settings-tab.ts` (currently ~0% lines)

3. Expand Obsidian stubs only as needed:

- If modal tests require additional Modal/App/Vault/Workspace behavior beyond `test_files/stubs/obsidian.ts`, add the minimum surface area needed and document it in the PR description.

### Implementation notes (what was added)

- Fixtures:
  - `test_files/fixtures/opml/single-feed.opml`
  - `test_files/fixtures/opml/nested-folders.opml`
  - `test_files/fixtures/opml/invalid.opml`
- New unit tests:
  - `test_files/unit/modals/import-opml-modal.test.ts`
  - `test_files/unit/modals/feed-manager-modal.test.ts`
  - `test_files/unit/modals/add-feed-modal.test.ts`
  - `test_files/unit/modals/edit-feed-modal.test.ts`
  - `test_files/unit/settings/media-settings-tab.test.ts`
  - `test_files/unit/settings/tags-settings-tab.test.ts`
- Stub + polyfill expansion (minimal):
  - `test_files/stubs/obsidian.ts`: more complete `Modal` surface (`modalEl`, `contentEl`, `open/close`), `Setting.components`, `ColorPicker.getValue()`, and `workspace.revealLeaf()`
  - `test_files/unit/test-dom-polyfills.ts`: add `HTMLElement.addClasses()` used by modals
- Coverage reporting:
  - `vitest.config.mjs`: add `json-summary` reporter and explicitly set `reportsDirectory: "coverage"`

## What to Test (decision-complete scenarios)

### OPML Import Modal (`import-opml-modal`)

- Empty input: shows validation error and does not import.
- Invalid OPML (`invalid.opml`): shows an error and does not import.
- Valid OPML (`single-feed.opml`):
  - Parses expected feed entries
  - Populates preview model/state
  - Confirm import triggers the expected persistence pathway (settings/vault updates)
- Nested folders (`nested-folders.opml`):
  - Preserves folder structure (or the repo’s current intended behavior)
  - Imports feeds into the correct groupings
- Cancel: closes without side effects.

### Feed Manager Modals (`feed-manager-modal`, `add-feed-modal`, `edit-feed-modal`)

- Baseline render: list shows existing feeds (from plugin settings input).
- Add feed:
  - Rejects duplicates by URL
  - Validates required fields
  - Persist callback invoked exactly once on successful submit
- Edit feed:
  - Pre-fills existing values
  - Updates persist correctly
  - Cancel does not persist
- Delete feed:
  - Removes from list/state
  - Persist callback invoked exactly once

### Settings Tabs (`media-settings-tab`, `tags-settings-tab`)

- Initial render reflects current setting values.
- Toggle/text/dropdown changes:
  - Update settings in memory
  - Trigger save/persist exactly once per user action
- Invalid inputs:
  - Do not throw
  - Maintain safe defaults / previous value (match current behavior)

## Verification

- `npm run test:unit`
- `npm run test:unit -- --coverage` must exit 0 and produce `coverage/coverage-final.json`
- Record the new global snapshot (Lines/Branches/Functions) in the PR description.

## Ratchet checkpoint (post P2-6)

Next bump gate (threshold + 0.75%):

- Lines >= **35.75%**
- Branches >= **29.75%**
- Functions >= **29.75%**

Once all three are met, bump to: Lines **36** | Branches **30** | Functions **30** (in a dedicated PR without coverage-surface expansion).

**P3-1 note:** The new snapshot (Lines 39.71% | Branches 31.57% | Functions 32.95%) exceeds the bump gate; proceed with the dedicated threshold bump PR when ready.
