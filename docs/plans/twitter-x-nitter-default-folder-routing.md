# Plan: Twitter/X/Nitter Default Folder Routing (TDD-First)

Last updated: 2026-05-18

This plan defines the work to add a new Media setting for Twitter/X/Nitter feeds with a default folder value of `Twitter`, and to make Add/Edit Feed modals honor that setting when auto-assigning folders.

The execution order follows the project testing guidance: **Red -> Green -> Refactor**.

## Scope

- Add setting: `media.defaultTwitterFolder` (default: `Twitter`)
- Add settings UI control in Media tab
- Update Add Feed modal auto-folder logic for Twitter/X/Nitter URLs
- Update Edit Feed modal auto-folder logic for Twitter/X/Nitter URLs
- Preserve user-custom folder choices in Edit modal and Add modal (only auto-assign when folder is empty, `Uncategorized`, or previously auto-assigned)

## Non-Goals

- No production implementation in this plan phase
- No background import service behavior changes unless later required by separate parity decision
- No additional feature expansion (for example, a Twitter tag setting)

## Constraints from Development Docs

### Testing Guide Alignment

- Start with failing tests first for each behavior change (Red)
- Implement only enough code to pass tests (Green)
- Refactor after passing tests while keeping all tests green (Refactor)
- Keep tests in `test_files/unit/` and prefer structure mirroring `src/`
- Use descriptive behavior-driven test names
- Clean DOM/mocks between tests to keep isolation

### Development README Alignment

- Keep this plan under `docs/plans/`
- Treat this file as the canonical implementation plan for this feature
- Keep release and development docs separate from implementation changes

## Execution Plan (Strict Red -> Green -> Refactor)

### Phase 1: RED - Add Failing Tests First

1. Add migration tests that fail when `media.defaultTwitterFolder` is missing and not backfilled.
2. Add Media settings tab tests that fail because the new Twitter folder control does not exist or does not persist.
3. Add Add Feed modal tests that fail because Twitter/X/Nitter URL detection does not auto-route to configured `defaultTwitterFolder`.
4. Add Edit Feed modal tests that fail because Twitter/X/Nitter URL detection does not apply the guarded auto-assignment rule.
5. Add preservation tests that fail if a user-custom folder is overridden.

Planned test targets:

- `test_files/unit/utils/settings-migration*.test.ts` (existing migration suite extension)
- `test_files/unit/settings/media-settings-tab*.test.ts` (or existing settings tab suite extension)
- `test_files/unit/modals/feed-manager/add-feed-modal*.test.ts` (new or existing suite extension)
- `test_files/unit/modals/feed-manager/edit-feed-modal*.test.ts` (new or existing suite extension)

### Phase 2: GREEN - Minimum Production Changes to Pass

1. Update `src/types/types.ts`
   - Add `defaultTwitterFolder: string` to media settings type
   - Add default value `defaultTwitterFolder: "Twitter"` in defaults
2. Update `src/utils/settings-migration.ts`
   - Backfill missing/invalid `media.defaultTwitterFolder`
3. Update `src/settings/tabs/media-settings-tab.ts`
   - Add UI setting control for Default Twitter folder with same normalize/save behavior used by existing folder settings
4. Update `src/modals/feed-manager/add-feed-modal.ts`
   - Auto-assign folder to configured `defaultTwitterFolder` when URL resolves to Twitter/X/Nitter and folder is eligible for auto-assignment
5. Update `src/modals/feed-manager/edit-feed-modal.ts`
   - Apply the same guarded auto-assignment rule (do not force overwrite user-custom folder)

### Phase 3: REFACTOR - Cleanup with Tests Staying Green

1. Consolidate repeated auto-assignment eligibility checks into a small helper if duplication exists.
2. Ensure URL detection is reused from existing helpers and not duplicated.
3. Improve naming and comments only where clarity is needed for maintenance.

## Verification Checklist

### Automated

1. Run targeted tests for changed suites.
2. Run full unit suite: `npm run test:unit`.
3. If coverage is run in CI or locally for this change, ensure thresholds remain above configured floor.

### Manual

1. In Media settings, set Default Twitter folder to a custom value and verify persistence.
2. In Add Feed modal, test URLs for `twitter.com`, `x.com`, and supported Nitter profile/feed forms.
3. Confirm folder auto-populates to configured Twitter folder only when eligible.
4. Confirm user-custom folders are not overwritten.
5. Repeat behavior checks in Edit Feed modal.
6. Spot-check YouTube/Podcast/RSS auto-folder behavior to ensure no regressions.

## File Change Map (for implementation phase)

- `src/types/types.ts`
- `src/utils/settings-migration.ts`
- `src/settings/tabs/media-settings-tab.ts`
- `src/modals/feed-manager/add-feed-modal.ts`
- `src/modals/feed-manager/edit-feed-modal.ts`
- Relevant test files under `test_files/unit/`

## Ready-to-Start Definition

Implementation may begin only after:

1. The new failing tests are committed or staged as the Red baseline.
2. The failing tests clearly encode expected behavior for Twitter/X/Nitter routing and folder-preservation rules.
3. No production files are changed before Red is established.
