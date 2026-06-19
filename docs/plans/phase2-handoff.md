# Refactoring Handoff: Phase 3

## Context
We are sequentially refactoring the monolithic `main.ts` file of the Obsidian RSS Dashboard plugin into a clean, modular architecture. 
You can find the master roadmap at `docs/plans/main-refactoring-roadmap.md`.

## Work Completed (Phase 1 & 2)
- **Phase 1**: Extracted `SettingsManager` service and added facades in `main.ts`. Tests pass.
- **Phase 2**: Extracted `ViewOrchestrator` and `UriProtocolHandler`. We added passing unit test suites using strict TDD, and applied the facade pattern to `main.ts` so no existing consumers broke.

## Your Task (Phase 3)
Your objective is to execute **Phase 3: Feed Orchestration & Business Logic**.

**Target Methods in `main.ts`:**
- `refreshFeeds()`
- `applyFeedLimitsToAllFeeds()`
- `startBackgroundImport()`
- `addYouTubeFeed()`
- `importOpml()`, `exportOpml()` (OPML wrappers, if any remain in `main.ts`)
- Other feed lifecycle methods.

**Instructions:**
1. **Adhere to TDD**: Before writing any implementation code, create failing test suites (the "Red Phase") for the new `FeedOrchestrationService` (and any specific domain controllers you extract) in `test_files/unit/services/`.
2. **Isolate Logic**: Extract the target methods into the new services. 
3. **Facade Pattern**: Keep `main.ts` fully backward compatible. Do not delete the methods from `main.ts` entirely; instead, convert them into pass-through delegates (facades) to your new services.
4. **Testing Standards**: All tests must strictly adhere to the guidelines in `docs/development/test_coverage/testing-guide.md`.
5. **Verify**: Ensure the test suite remains green - ask user to manually run tests.
6. Upon completion of Phase 3, update the roadmap with work completed then provide a handoff doc for Phase 4 for new context window.

Please review `main.ts` and begin by writing the failing test suites for the new Phase 3 services.
