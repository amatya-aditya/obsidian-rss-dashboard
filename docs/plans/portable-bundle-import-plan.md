# Portable Bundle Import Implementation Plan

## Purpose
Complete the missing import side of the portable bundle workflow so users can move storage between devices without rebuilding folders, feed mappings, or shard history by hand.

This plan complements the existing vault-shard work and closes the known gap noted in CHANGELOG.

## Current State (Verified)
Implemented:
- Portable bundle type (`PortableDataBundle`)
- Portable bundle export action and service flow
- Bundle backup output when shard mode is enabled

Missing:
- Import action in settings
- Portable bundle file picker and confirmation flow
- Bundle validation and restore pipeline
- Conflict policy for existing local data
- Rollback and error-recovery guarantees

## Goals
1. Add a safe, deterministic import flow for portable bundles.
2. Preserve feed-to-shard identity (`feedId`) across devices.
3. Restore plugin settings and per-feed history in one operation.
4. Keep behavior explicit so users know whether data is replaced or merged.
5. Provide test coverage equivalent to existing export coverage.

## Non-Goals (Initial Iteration)
- Partial import of selected feeds only
- Cross-version structural migrations beyond same-schema compatibility checks
- Markdown mirror fallback implementation

## Proposed User Experience
1. User opens Settings -> Import/Export.
2. User clicks `Import portable data bundle`.
3. File picker accepts `.json` bundle file.
4. Modal preview shows:
   - export timestamp
   - bundle version
   - source storage mode
   - feed count and shard count
5. User selects conflict behavior:
   - `Replace existing data` (v1 default)
6. User confirms import.
7. Plugin validates bundle, writes data, refreshes runtime, and shows completion notice.

## Import Behavior (v1)
- Strategy: Full replace (no merge in v1).
- Existing feed metadata/settings are replaced by bundle metadata.
- Shards are rewritten from bundle payload to target storage folder.
- `storageMode`, `storageFolder`, and feed configs are restored from bundle metadata.
- Import is all-or-nothing from user perspective.

## Implementation Scope

### 1) Types and Validation
Files:
- `src/types/types.ts`
- `src/services/feed-storage-repository.ts` (or a dedicated validator helper)

Work:
- Add runtime guard/validator for `PortableDataBundle`.
- Validate required fields and primitive shapes.
- Validate shard array structure and `feedId` consistency.
- Reject unsupported bundle version with clear notice.

Acceptance:
- Invalid bundle fails fast before any write.
- Error messages are actionable.

### 2) Repository Import Pipeline
Files:
- `src/services/feed-storage-repository.ts`

Work:
- Add `importPortableDataBundle(bundle: PortableDataBundle): Promise<void>` (or equivalent).
- Normalize/ensure storage folder exists.
- Rebuild metadata settings from bundle.
- Rewrite shard files from bundle payload.
- Ensure feed configs align to shard `feedId` mappings.
- Save settings and rehydrate in-memory feed items.

Acceptance:
- Imported feeds load with correct article history after reload.
- No orphan mapping between feed config and shard files.

### 3) App and Service Integration
Files:
- `main.ts`
- `src/services/import-export-service.ts`

Work:
- Add public plugin method for portable bundle import.
- Add import-export service method:
  - file selection
  - JSON parse
  - validation call
  - repository import call
  - success/failure notices
- Keep storage debug logs under `[RSS Dashboard][Storage]`.

Acceptance:
- Import can be triggered from settings without console errors.

### 4) Settings UI
Files:
- `src/settings/tabs/import-export-settings-tab.ts` (preferred) or current storage action location
- `src/settings/modals/` (new modal if needed)

Work:
- Add `Import portable data bundle` button near export controls.
- Add confirmation modal (destructive replace warning).
- Add lightweight preview of parsed bundle metadata before final confirmation.

Acceptance:
- User cannot run import accidentally.
- UI communicates replacement behavior clearly.

### 5) Failure Safety and Rollback
Files:
- repository/import service layers

Work:
- Pre-import snapshot of current settings and shards (temp backup path).
- If import fails mid-write, restore snapshot and return to prior state.
- Surface failure reason via notice + debug log.

Acceptance:
- Failed import does not leave partially migrated storage state.

### 6) Tests
Files:
- `test_files/unit/services/feed-storage-repository.test.ts`
- `test_files/unit/services/import-export-service.test.ts`
- `test_files/unit/settings/...` (new or existing settings test file)

Add tests for:
- valid import replace path
- malformed JSON and malformed bundle rejection
- unsupported bundle version
- feed/shard mapping integrity after import
- rollback on write failure
- settings button wiring and confirmation flow

Acceptance:
- New tests pass in existing unit harness where stable.
- Build remains green.

## Delivery Phases

### Phase 1: Core import engine
- validator + repository import + service entrypoint
- no UI polish beyond minimal trigger

### Phase 2: UX hardening
- metadata preview modal
- clearer notices and conflict copy
- rollback hardening

### Phase 3: test hardening
- edge cases and failure-injection tests
- docs and changelog updates

## Open Decisions
1. Should v1 support merge mode, or keep replace-only to reduce risk?
2. Should import force `vault-shards` mode when bundle contains shards, even if current local mode differs?
3. Should import always preserve current `storageFolder` or restore bundle folder path as-authored?

## Recommended v1 Defaults
- Replace-only import.
- Preserve bundle `storageMode` and `feedId` mappings.
- Restore to configured local storage folder after normalization (do not trust absolute source paths from another device).

## Definition of Done
- User can export on device A and import on device B.
- Imported instance loads same feeds and historical items without manual shard reconstruction.
- No data corruption on failed import attempts.
- Unit tests cover happy path and key failures.
- CHANGELOG known issue line can be removed or narrowed to any remaining edge case.