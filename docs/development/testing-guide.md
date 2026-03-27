# RSS Dashboard Testing Guide

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

## 5. Running Tests

- Run tests in watch mode during development: `npx vitest`
- Run the full suite confidently before a commit: `npm run test:unit`
