# RSS Dashboard Testing Guide

## 1. Current Test Status (as of 2026-03-30)

- **Total Tests:** 701
- **Passing:** 701 (100%)
- **Line Coverage:** 46.2%
- **Branch Coverage:** 35.96%
- **Function Coverage:** 40.0%

*Note: Coverage is enforced via Vitest thresholds in `vitest.config.mjs` and ratcheted up as we improve the suite.*


## 1. Test-Driven Development (TDD)

This project relies heavily on **Test-Driven Development (TDD)** to maintain stability, especially when integrating with Obsidian's DOM and managing complex background parsing.

We follow the standard TDD cycle:
1. **Red**: Write a failing test first. If fixing a bug, write a test that reproduces the bug.
2. **Green**: Write the minimum amount of code necessary to make the test pass.
3. **Refactor**: Clean up and optimize the implementation, secure in the knowledge that your tests will catch regressions.

## 2. Test Organization and Structure

Our tests live in the `test_files/unit/` directory. Historically, tests were kept in a flat directory structure. **Moving forward, all tests should be organized into folders mirroring the `src/` directory**.

### Recommended Folder Structure:
- `test_files/unit/services/`: For core business logic (e.g., parsers, state managers, background sync).
- `test_files/unit/views/`: For UI tests and DOM interaction logic (e.g., dashboard, podcast-player, reader-view).
- `test_files/unit/utils/`: For standalone helper functions (e.g., date formatting, validation).
- `test_files/unit/components/`: For reusable isolated UI components and Obsidian modals.

*Note: Grouping tests by feature or module makes it much easier to maintain the suite and understand coverage.*

## 3. Test Suites Reference

### Core Services
- **Feed Parser (`test_files/unit/feed-parser.test.ts`):** Validates RSS/Atom/JSON parsing, encoding detection, and URL conversion.
- **Article Saver (`test_files/unit/services/article-saver.test.ts`):** Validates markdown generation, template variables, and vault persistence.
- **OPML Manager (`test_files/unit/services/opml-manager.test.ts`):** Validates import/export and folder merging.
- **Highlight Service (`test_files/unit/services/highlight-service.test.ts`):** Validates regex generation and DOM-based highlighting.

### Views
- **Dashboard View (`test_files/unit/views/dashboard-lifecycle.test.ts`):** Validates main view orchestration, pagination, and multi-filter persistence.
- **Discover View (`test_files/unit/views/discover-view.test.ts`):** Validates feed categorization and filter state persistence.

### Components
- **Sidebar (`test_files/unit/components/sidebar-core.test.ts`):** Validates sidebar rendering, toolbar actions, and tag filters.
- **Modals:** Extensive coverage for feed management, OPML import, and settings modals in `test_files/unit/modals/`.


## 3. Explaining the Purpose of Each Test

Because this is an open-source project, contributors come with varying levels of familiarity with the codebase. To make tests as readable as possible:

1. **Use descriptive `describe` blocks**: Group related functionality.
   ```ts
   describe("FeedParser - OPML Import", () => { ... })
   ```

2. **Write clear `it` statements explaining behavior, not implementation**:
   - ❌ `it("calls the save function when btn is clicked")`
   - ✅ `it("persists the new feed to settings when the user submits the form")`

3. **Comment complex setups**: If your test requires a lot of setup (mocking Obsidian APIs, polyfills, or complex settings objects), add a one-line comment explaining *why* the setup is necessary.
   ```ts
   // Polyfill the MediaElement API so the Podcast Player can simulate playback
   installMediaElementPolyfills();
   ```

## 4. Writing Fast Integration Tests

Many of our tests go beyond strict unit testing (testing a pure function) and test the integration of our components with the DOM.
We use `jsdom` alongside custom polyfills (`test_files/unit/test-dom-polyfills.ts`) to simulate the Obsidian environment. This yields high confidence without the massive overhead of end-to-end (E2E) browser tests.

- Always clean up the DOM between tests with `document.body.empty()`.
- Mock file system and external network calls (e.g., using `vi.spyOn(obsidian, "requestUrl")`).

## 6. Best Practices

1. **Mocking Obsidian APIs**: Use the stubs in `test_files/stubs/obsidian.ts`. If a required API is missing, expand the stub.
2. **Environment**: Ensure `environment: 'jsdom'` is set in the test file or config if testing DOM-reliant code.
3. **Fixtures**: Keep large XML/JSON fixtures in dedicated `fixtures/` files (e.g., `test_files/unit/fixtures/`).
4. **Cleanup**: Always use `document.body.empty()` or `vi.clearAllMocks()` in `afterEach` to ensure test independence.
5. **Descriptive Naming**: Write clear `it` statements explaining *behavior*, not implementation (e.g., `it("persists the new feed...")` not `it("calls the save function...")`).

## 7. Running Tests

- **Run all tests**: `npm run test:unit`
- **Watch mode**: `npx vitest`
- **Coverage report**: `npm run test:unit -- --coverage`

