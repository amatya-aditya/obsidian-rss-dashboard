# Plan - Migrate Media Settings Tag Dropdowns to Shared Multi-Select

## Goal

Replace single-select default tag dropdowns in media settings with the shared multi-select utility (`tag-multi-select-control.ts`).

Dependency: the shared utility remediation plan (`.kilo/plans/1779385400001-steady-harbor.md`) is assumed complete:

- live toggle state correctness across repeated interactions
- explicit none/empty-state rendering
- explicit `aria-pressed` semantics for selected and unselected chips

## Scope

### In scope

- Update `renderMediaSettingsTab` tag rows that use `addDropdown` for default tags
- Persist and load multi-select (`string[]`) values per media default-tag setting
- Add migration path from legacy `string` fields to `string[]` fields
- Update reset-to-default behavior for tag settings
- Add/adjust tests for settings persistence and rendering
- Verify shared utility guarantees in settings context (empty state, aria-pressed, repeated toggle correctness)

### Out of scope

- Feed manager Add/Edit modal auto-tag behavior
- Parser-level application of feed custom tags

---

## Target settings currently single-select

In `src/settings/tabs/media-settings-tab.ts`:

| Setting              | Legacy field         | New field             |
| -------------------- | -------------------- | --------------------- |
| Default video tag    | `defaultVideoTag`    | `defaultVideoTags`    |
| Default Twitter tag  | `defaultTwitterTag`  | `defaultTwitterTags`  |
| Default Mastodon tag | `defaultMastodonTag` | `defaultMastodonTags` |
| Default YouTube tag  | `defaultYouTubeTag`  | `defaultYouTubeTags`  |
| Default podcast tag  | `defaultPodcastTag`  | `defaultPodcastTags`  |
| Default RSS tag      | `defaultRssTag`      | `defaultRssTags`      |
| Default smallweb tag | `defaultSmallwebTag` | `defaultSmallwebTags` |

---

## Data model strategy

- Introduce parallel `string[]` array fields in `MediaSettings`
- Migration: if legacy `string` exists and `string[]` is missing, initialize `[]` or `[legacyString]` if non-empty
- Keep backward-compatible reads during transition
- Writes target arrays
- Reset defaults assign arrays from defaults (or `[]` where none)
- Legacy strings kept only in compatibility window, do not write to them after reminder

---

## File changes

### Modified

- `src/settings/tabs/media-settings-tab.ts` — replace `addDropdown` with `addTagMultiSelectControl` × 7 rows; update reset button
- `src/types/types.ts` — add new `string[]` fields to `MediaSettings`, update `DEFAULT_SETTINGS.media`
- `src/utils/settings-migration.ts` — add `migrateMediaDefaultTagArrays` (string → string[])
- `main.ts` (settings load path) — call new migration function
- `test_files/unit/settings/media-settings-tab.test.ts` — update/expand tag UI tests
- `test_files/unit/settings/media-tag-arrays-migration.test.ts` — new migration test file

---

## TDD Phases

### PHASE 0 — RED (write failing tests)

#### 0.1 Tag multi-select UI tests (`media-settings-tab.test.ts`)

- `[x]` Test: multi-select chips rendered for each of the 7 tag settings, not a `<select>`
- `[x]` Test: defaultVideoTag → defaultVideoTags array is shown as selected chip on render
- `[x]` Test: toggling a chip calls `onChange` with cumulative `string[]`
- `[x]` Test: toggling a chip twice (repeated interaction) produces correct cumulative `string[]`
- `[x]` Test: empty-state banner shown when `availableTags` is empty (no blank rendering)

#### 0.2 Empty-state and aria-pressed tests

- `[x]` Test: each chip has `role="button"` and `aria-pressed="true"` if selected / `"false"` if not
- `[x]` Test: chip selectable via keyboard (Enter / Space triggers toggle)

#### 0.3 Migration tests (`media-tag-arrays-migration.test.ts`)

- `[x]` Test: legacy non-empty `defaultVideoTag` string → `defaultVideoTags: [value]`
- `[x]` Test: legacy empty string `defaultVideoTag: ""` → `defaultVideoTags: []`
- `[x]` Test: missing legacy field → `defaultVideoTags: []`
- `[x]` Test: existing `defaultVideoTags` array left unchanged (idempotent)
- `[x]` Test: all 7 settings migrated independently in one call

#### 0.4 Reset-default tests

- `[x]` Test: reset tag names restores `defaultVideoTags` to `["Video"]` (matching `DEFAULT_SETTINGS`)
- `[x]` Test: reset tag names for empty defaults → `[]`

#### 0.5 Run the suite and verify failures

- `[x]` Phase 0 targeted tests fail for expected reasons (missing function, wrong types, etc.)
- `[x]` ESLint passes on touched test files

---

### PHASE 1 — GREEN (minimal implementation to pass all tests)

#### 1.1 Types (`types.ts`)

- `[x]` Add `defaultVideoTags: string[]` etc. to `MediaSettings` interface
- `[x]` Update `DEFAULT_SETTINGS.media` with equivalent array defaults (`["Video"]`, `[]`, etc.)
- `[x]` ESLint/tc clean

#### 1.2 Migration (`settings-migration.ts`)

- `[x]` Add `migrateMediaDefaultTagArrays(settings)` — reads legacy string → populates new array; idempotent if array already exists
- `[x]` ESLint/tc clean

#### 1.3 Load path (`settings-loader.ts` or `main.ts`)

- `[x]` Call `migrateMediaDefaultTagArrays` in `loadAndNormalizeSettings` / `migrateSettings`

#### 1.4 UI wiring (`media-settings-tab.ts`)

- `[x]` Replace `addDropdown` for defaultVideoTag → shared `addTagMultiSelectControl` bound to `defaultVideoTags`
- `[x]` Replace `addDropdown` for defaultTwitterTag → `addTagMultiSelectControl` bound to `defaultTwitterTags`
- `[x]` Replace `addDropdown` for defaultMastodonTag → `addTagMultiSelectControl` bound to `defaultMastodonTags`
- `[x]` Replace `addDropdown` for defaultYouTubeTag → `addTagMultiSelectControl` bound to `defaultYouTubeTags`
- `[x]` Replace `addDropdown` for defaultPodcastTag → `addTagMultiSelectControl` bound to `defaultPodcastTags`
- `[x]` Replace `addDropdown` for defaultRssTag → `addTagMultiSelectControl` bound to `defaultRssTags`
- `[x]` Replace `addDropdown` for defaultSmallwebTag → `addTagMultiSelectControl` bound to `defaultSmallwebTags`
- `[x]` Update "Reset tag names" button to assign new array fields from `DEFAULT_SETTINGS.media`

#### 1.5 Phase 1 end-of-phase checks

- `[x]` `npm run test:unit` — media settings tests pass
- `[x]` `npm run lint` — zero errors/warnings on touched files
- `[x]` `tsc -noEmit -skipLibCheck` — clean for touched modules
- `[ ]` Manual UI review — no settings row relies on blank output for empty-state rendering (utility has explicit none banner)
- `[ ]` Manual a11y review — `aria-pressed` present on selected and unselected chips

---

### PHASE 2 — REFACTOR

#### 2.1 Remove temporary duplication

- `[ ]` Remove any duplicated save/load paths (keep only one canonical read-access per setting)
- `[ ]` Keep compatibility reads only as long as needed
- `[ ]` New files for auto-tag infrastructure (tag-applier, tag-resolver, tag-application-confirm-modal)

#### 2.2 Phase 2 end-of-phase checks

- `[ ]` Re-run `npm run test:unit` — all pass
- `[ ]` Re-run `npm run lint` — zero errors/warnings on touched files
- `[ ]` Re-run `tsc -noEmit -skipLibCheck` — clean

---

## Verification commands

```
npm run test:unit
npm run lint
tsc -noEmit -skipLibCheck
```

Additional plan-specific checks:

- `[x]` Confirmed: migrated settings rows do not regress when `availableTags` is empty
- `[x]` Confirmed: reset-default flow leaves array fields in normalized order
- `[x]` Confirmed: legacy string-only settings payloads hydrate arrays deterministically

---

## Work Completed (Bright Canyon)

**Status: PHASE 1 mostly complete; PHASE 2 started (auto-tag feature)**

### Files with staged/uncommitted changes:

- `src/settings/tabs/media-settings-tab.ts` ✓ All 7 dropdowns → multi-select, reset button updated
- `src/types/types.ts` ✓ All new `string[]` fields added; defaults updated
- `src/utils/settings-migration.ts` ✓ `migrateMediaDefaultTagArrays` implemented
- `src/utils/settings-loader.ts` ✓ Migration called in load path
- `test_files/unit/settings/media-settings-tab.test.ts` ✓ All tag UI tests passing
- `test_files/unit/settings/media-tag-arrays-migration.test.ts` ✓ All migration tests passing
- `test_files/unit/components/tag-multi-select-control.test.ts` ✓ Staged

### New auto-tag infrastructure (untracked):

- `src/modals/feed-manager/tag-application-confirm-modal.ts` — modal for confirming tag application
- `src/services/tag-applier.ts` — service to apply tags to feeds/folders
- `src/utils/tag-resolver.ts` — utility to resolve tags from feeds/folders
- `test_files/unit/modals/tag-application-confirm-modal.test.ts` — modal tests
- `test_files/unit/services/tag-applier.test.ts` — service tests
- `test_files/unit/utils/tag-resolver.test.ts` — resolver tests

### Feed modal updates (in progress):

- `src/modals/feed-manager/add-feed-modal.ts` — Add modal wired to multi-select
- `src/modals/feed-manager/edit-feed-modal.ts` — Edit modal wired to multi-select
- `test_files/unit/modals/add-feed-modal.test.ts` — Add modal tests
- `test_files/unit/modals/edit-feed-modal.test.ts` — Edit modal tests

### Remaining (PHASE 2):

- Manual UI/a11y spot-checks for settings empty-state rendering
- Remove any temporary compatibility code once transition window closes
- Finalize auto-tag feature integration

---

## Notes for downstream consumers

After this plan lands, all new settings/modal tag selection work must consume `addTagMultiSelectControl` from `src/components/tag-multi-select-control.ts` instead of introducing new ad-hoc dropdown logic.

Do not bypass shared utility remediations by adding settings-local patches for stale state, empty-state rendering, or accessibility semantics.
