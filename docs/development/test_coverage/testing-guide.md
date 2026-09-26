# RSS Dashboard Testing Guide

## 1. Current Test Status

Run `npm run test:unit -- --coverage` for the current test-file/test-pass
counts and coverage percentages. Coverage is enforced via Vitest thresholds in
`vitest.config.mjs` (currently lines `55`, branches `45`, functions `50`) and
should be treated as a ratcheted floor, not just a report — see the Coverage
Gate section in `CONTRIBUTING.md` for the ratchet rules.

## 2. Test-Driven Development (TDD)

This project relies heavily on **Test-Driven Development (TDD)** to maintain stability, especially when integrating with Obsidian's DOM and managing complex background parsing.

We follow the standard TDD cycle:

1. **Red**: Write a failing test first. If fixing a bug, write a test that reproduces the bug.
2. **Green**: Write the minimum amount of code necessary to make the test pass.
3. **Refactor**: Clean up and optimize the implementation, secure in the knowledge that your tests will catch regressions.

## 3. Test Organization and Structure

Our tests live in the `test_files/unit/` directory. Historically, tests were kept in a flat directory structure. **Moving forward, all tests should be organized into folders mirroring the `src/` directory**.

### Recommended Folder Structure:

- `test_files/unit/services/`: For core business logic (e.g., parsers, state managers, background sync).
- `test_files/unit/views/`: For UI tests and DOM interaction logic (e.g., dashboard, podcast-player, reader-view).
- `test_files/unit/utils/`: For standalone helper functions (e.g., date formatting, validation).
- `test_files/unit/components/`: For reusable isolated UI components and Obsidian modals.

_Note: Grouping tests by feature or module makes it much easier to maintain the suite and understand coverage._

### Characterization tests

A test that pins current behavior before a refactor, bugs included, is named `*.characterization.test.ts` and lives in the same folder as the module's other tests. Mark each pinned bug with `// BUG: pinned, see #<issue>`. CI keeps these files read-only on `refactor/*` pull requests; see **Characterization tests** in the [architecture guardrails](../architecture.md#characterization-tests).

## 4. Test Suites Reference

### Core Services

- **Feed Parser (`test_files/unit/services/feed-parser.test.ts`):** Validates RSS/Atom/JSON parsing, encoding detection, and URL conversion.
- **Article Saver (`test_files/unit/services/article-saver.test.ts`):** Validates markdown generation, template variables, and vault persistence.
- **OPML Manager (`test_files/unit/services/opml-manager.test.ts`):** Validates import/export and folder merging.
- **Highlight Service (`test_files/unit/services/highlight-service.test.ts`):** Validates regex generation and DOM-based highlighting.
- **Apple Podcasts Service (`test_files/unit/services/apple-podcasts-service.test.ts`):** Validates URL resolution, cache behavior, guard rails, and error handling for Apple Podcasts lookup.
- **Web Viewer Integration (`test_files/unit/services/web-viewer-integration.test.ts`):** Validates Web Viewer plugin integration, DOM injection, save flows, and helper behavior.

### Views

- **Dashboard View (`test_files/unit/views/dashboard-lifecycle.test.ts`):** Validates main view orchestration, pagination, and multi-filter persistence.
- **Discover View (`test_files/unit/views/discover-view.test.ts`):** Validates feed categorization and filter state persistence.

### Components

- **Sidebar (`test_files/unit/components/sidebar-core.test.ts`):** Validates sidebar rendering, toolbar actions, and tag filters.
- **Modals:** Extensive coverage for feed management, OPML import, and settings modals in `test_files/unit/modals/`.

## 5. Explaining the Purpose of Each Test

Because this is an open-source project, contributors come with varying levels of familiarity with the codebase. To make tests as readable as possible:

1. **Use descriptive `describe` blocks**: Group related functionality.

   ```ts
   describe("FeedParser - OPML Import", () => { ... })
   ```

2. **Write clear `it` statements explaining behavior, not implementation**:
   - ❌ `it("calls the save function when btn is clicked")`
   - ✅ `it("persists the new feed to settings when the user submits the form")`

3. **Comment complex setups**: If your test requires a lot of setup (mocking Obsidian APIs, polyfills, or complex settings objects), add a one-line comment explaining _why_ the setup is necessary.
   ```ts
   // Polyfill the MediaElement API so the Podcast Player can simulate playback
   installMediaElementPolyfills();
   ```

## 6. Writing Fast Integration Tests

Many of our tests go beyond strict unit testing (testing a pure function) and test the integration of our components with the DOM.
We use `jsdom` alongside custom polyfills (`test_files/unit/test-dom-polyfills.ts`) to simulate the Obsidian environment. This yields high confidence without the massive overhead of end-to-end (E2E) browser tests.

- Always clean up the DOM between tests with `document.body.empty()`.
- Mock file system and external network calls (e.g., using `vi.spyOn(obsidian, "requestUrl")`).

## 7. Best Practices

1. **Mocking Obsidian APIs**: Use the stubs in `test_files/stubs/obsidian.ts`. If a required API is missing, expand the stub.
2. **Environment**: Ensure `environment: 'jsdom'` is set in the test file or config if testing DOM-reliant code.
3. **Fixtures**: Keep large XML/JSON fixtures in dedicated `fixtures/` files (e.g., `test_files/unit/fixtures/`).
4. **Cleanup**: Always use `document.body.empty()` or `vi.clearAllMocks()` in `afterEach` to ensure test independence.
5. **Descriptive Naming**: Write clear `it` statements explaining _behavior_, not implementation (e.g., `it("persists the new feed...")` not `it("calls the save function...")`).

## 8. Running Tests

- **Run all tests**: `npm run test:unit`
- **Watch mode**: `npx vitest`
- **Coverage report**: `npm run test:unit -- --coverage`
- **Tests affected by a change**: `npx vitest related --run <changed files>`

`vitest related` runs every test file whose imports reach the files you name,
including What's New notes and repository scripts. A change to a widely
imported utility can select most of the suite.

The pre-commit hook runs only the tests related to the staged files; the
pre-push hook and CI run the whole suite. See **Git Hooks** in
[CONTRIBUTING.md](../../../CONTRIBUTING.md#git-hooks).
