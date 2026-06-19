# Refactoring Handoff: Phase 5

## Context
We have sequentially refactored the monolithic `main.ts` file of the Obsidian RSS Dashboard plugin into a clean, modular architecture.
You can find the master roadmap at `docs/plans/main-refactoring-roadmap.md`.

## Work Completed (Phase 1-4)
- **Phase 1**: Extracted `SettingsManager` service and added facades in `main.ts`.
- **Phase 2**: Extracted `ViewOrchestrator` and `UriProtocolHandler`.
- **Phase 3**: Extracted `FeedOrchestrationService` and other background sync logic.
- **Phase 4**: Isolated utility and pure functions (e.g., `decodeUriFeedUrl`, `getAllArticles`, type guards) into `src/utils/`.

## Your Task (Phase 5)
Your objective is to execute **Phase 5: Plugin Lifecycle (Thin Entry Point)**.

**Target Methods in `main.ts`:**
- `onload()`
- `onunload()`
- Any remaining timer or event registration logic.

**Instructions:**
1. **Adhere to TDD**: Ensure you maintain robust test coverage for any extracted setup/teardown coordination logic.
2. **Thin Entry Point**: Refactor `main.ts` so that it only handles Dependency Injection (DI) wiring and Obsidian event registration. All business logic, initialization sequences, and teardown logic should be delegated to appropriate services (or a dedicated `PluginLifecycleManager`).
3. **Remove Facades**: If any temporary facades were left in `main.ts` during Phases 1-4 for backward compatibility and all views/services have now been updated to use constructor injection or direct imports, you may safely remove those facades from `main.ts`.
4. **Testing Standards**: All tests must strictly adhere to the guidelines in `docs/development/test_coverage/testing-guide.md`.
5. **Verify**: Ensure the test suite remains green - ask the user to manually run tests.

Please review `main.ts` and begin by writing failing test suites for any new lifecycle manager or service, then execute the refactor.
