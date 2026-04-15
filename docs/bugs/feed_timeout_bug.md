# Discover "Add all..." YouTube Feed Timeout Bug

## Summary

Some YouTube feeds added from Discover via `Add all...` were appearing in the dashboard without their initial items until the user manually refreshed them.

Two contributing issues were identified:

1. The Discover bulk-ingestion path was dropping the discover feed type before queueing background hydration, so YouTube and podcast feeds were entering the pipeline as generic article placeholders.
2. Background hydration used a strict 15 second timeout with no retry and four parallel workers, which made slower YouTube feed fetches more likely to land in a `timed_out` state.

## Confirmed Root Causes

### Root cause 1: Discover bulk add lost media type information

- File: `src/views/discover-view.ts`
- Path: `addFilteredFeedsToFolder()`
- Problem: candidates passed into `ingestFeedsForBackgroundImport()` only included `title`, `url`, and `folder`
- Effect: YouTube feeds were not explicitly marked as `video`, and podcast feeds were not explicitly marked as `podcast`

### Root cause 2: Background hydration was too brittle for slower feeds

- File: `src/services/background-import-service.ts`
- Path: `parseFeedWithTimeout()` and `processBackgroundImportQueue()`
- Problem: background hydration used a single 15 second timeout attempt and a worker count of 4
- Effect: transiently slow YouTube responses could fail during bulk hydration even when a later manual refresh succeeded

## TDD Plan

### Phase 0: Red

Goal: start with failing tests that capture the bug and the resilience gap.

Tasks:

1. Add a Discover view unit test that verifies bulk `Add all...` passes derived `mediaType` values into `ingestFeedsForBackgroundImport()`.
2. Add test coverage for three discover feed categories:
   - standard RSS content maps to `article`
   - podcast content maps to `podcast`
   - YouTube content maps to `video`
3. Add a background import service test that expects one retry when parsing fails with `Timed out` once and then succeeds.
4. Add a background import service test that expects a feed to end in `timed_out` status only after timeout retries are exhausted.
5. Run the targeted Vitest command and confirm the new assertions fail before implementation begins.

Status: completed.

### Phase 1: Green for Discover bulk-add classification

Goal: fix the deterministic data-loss bug in the Discover bulk-add path.

Tasks:

1. Update `src/views/discover-view.ts` so bulk-ingestion candidates include a derived `mediaType`.
2. Map discover feed types as follows:
   - `Podcast` -> `podcast`
   - `YouTube`, `Video Series`, `Vlog` -> `video`
   - everything else -> `article`
3. Keep the single-feed add path unchanged so the bulk flow aligns with existing media conventions instead of introducing a second classification model.
4. Re-run the Discover view test file and confirm the bulk-ingestion shape is correct.

Status: completed.

### Phase 2: Green for background import resilience

Goal: make background hydration less fragile for slower YouTube feeds.

Tasks:

1. Replace the single hardcoded timeout constant with named background-import constants in `src/services/feed-timeout.ts`.
2. Increase the background import timeout window to a more forgiving value.
3. Add one bounded retry for timeout failures only.
4. Keep retry behavior narrow so malformed feeds still fail quickly instead of stalling the queue.
5. Lower background-import worker concurrency so bulk hydration is less bursty against slower or more rate-limited feed sources.
6. Re-run the background import service tests and confirm timeout recovery and timeout exhaustion both behave as intended.

Status: completed.

### Phase 3: Regression coverage

Goal: ensure the fix stays covered at the unit level.

Tasks:

1. Update `test_files/unit/views/discover-view.test.ts` to include a YouTube fixture and assert the correct candidate payloads.
2. Update `test_files/unit/services/background-import-service.test.ts` to cover retry success and retry exhaustion.
3. Keep the assertions focused on the discover enqueue contract and the background import timeout contract.
4. Avoid broad refactors in test setup so failures remain easy to interpret.

Status: completed.

### Phase 4: Verification

Goal: confirm the repository still builds and the changed behavior is covered.

Tasks:

1. Run targeted unit tests for Discover view and BackgroundImportService.
2. Run `npm run build`.
3. Manually verify in-app that bulk-adding several Discover YouTube feeds populates initial items without needing a manual refresh.
4. Manually verify podcast and normal RSS bulk adds still behave correctly.

Status: build and targeted unit verification completed. Manual in-app verification still recommended.

## Files Changed

- `src/views/discover-view.ts`
- `src/services/background-import-service.ts`
- `src/services/feed-timeout.ts`
- `test_files/unit/views/discover-view.test.ts`
- `test_files/unit/services/background-import-service.test.ts`

## Implemented Behavior

### Discover bulk add

- Bulk-added discover feeds now carry `mediaType` into background ingestion.
- YouTube feeds are queued as `video` placeholders.
- Podcast feeds are queued as `podcast` placeholders.
- Standard feeds remain `article` placeholders.

### Background import

- Background import now uses named timeout configuration for readability.
- Timeout failures are retried once before the feed is marked `timed_out`.
- Background hydration concurrency is reduced from 4 to 2.
- Timeout cleanup clears pending timers once a parse attempt resolves or rejects.

## Verification Commands

```bash
npm run test:unit -- test_files/unit/views/discover-view.test.ts test_files/unit/services/background-import-service.test.ts
npm run build
```

## Remaining Recommendation

If YouTube feeds still prove flaky after these changes, the next step should be domain-aware throttling for `youtube.com` feed URLs rather than continuing to raise the global timeout.
