# Fix Saved Article Access from Toolbar

The goal is to enable users to open saved articles, podcasts, and videos directly from the reader and player toolbars, similar to how it works in the dashboard card.

## Proposed Changes (TDD Approach)

To follow a Test-Driven Development (TDD) approach, we will author failing tests first, then implement the changes in `reader-view.ts` to make those tests pass.

### 1. Unit Tests

#### [NEW] [test_files/unit/reader-view-save-button.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/reader-view-save-button.test.ts)

Create unit tests to verify the behavior of the save button in the reader view header.
- **Mock Setup**: Instantiate `ReaderView` with mocked `App`, `WorkspaceLeaf`, `RssDashboardSettings`, `ArticleSaver`, and handler callbacks. Call `view.onOpen()` to initialize the UI.
- **Test 1 (Initial State Unsaved)**: Pass a `FeedItem` with `saved: false` to `displayItem`. Verify the save button lacks the `saved` CSS class and the title is "Save article".
- **Test 2 (Initial State Saved)**: Pass a `FeedItem` with `saved: true`. Verify the save button has the `saved` CSS class and the title is "View saved note".
- **Test 3 (Click Behavior Unsaved)**: Click the save button on an unsaved item. Verify `showSaveOptions` is triggered (can mock `Menu` to verify it opens).
- **Test 4 (Click Behavior Saved)**: Click the save button on a saved item. Verify `app.workspace.getLeaf().openFile` is called with the mocked `TFile` corresponding to the item's saved file path, and `showSaveOptions` is *not* called.
- **Test 5 (Dynamic Update)**: Call `updateSavedLabel(true)` (or simulate saving) and verify the button's DOM updates immediately to the saved state.

### 2. Integration Tests

#### [NEW] [test_files/unit/reader-view-integration.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/reader-view-integration.test.ts)

Create an integration test to verify the full flow of saving and then opening the file.
- **Test Flow**:
  1. Initialize `ReaderView` with a real or partially-mocked `ArticleSaver` and a mock `App` holding an in-memory `Vault`.
  2. Display an unsaved `FeedItem` (works for articles, podcasts, or videos since `ReaderView` wraps all of them).
  3. Simulate clicking the save button and selecting "Save with default settings".
  4. Verify the `ArticleSaver` creates a simulated file in the mock vault.
  5. Verify the save button state transitions to "saved" visually.
  6. Simulate a second click on the save button and verify it attempts to open the newly created file in the workspace.

### 3. Implementation

#### [MODIFY] [reader-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts)

Once tests are failing as expected, implement the fix:
- Add `private saveButton: HTMLElement | null = null;` to the [ReaderView](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts#33-1701) class.
- Update `onOpen` to store the save button reference: `this.saveButton = actions.createDiv(...)`.
- Implement `private updateSaveButtonState(): void`:
    - Toggle the `saved` class on `this.saveButton` based on `this.currentItem.saved`.
    - Update `this.saveButton.title` to "View saved note" if saved, otherwise "Save article".
- Call `this.updateSaveButtonState()` at the end of `displayItem` and inside `updateSavedLabel`.
- Modify the save button's click handler:
    - If `this.currentItem.saved` is true, resolve the file using `this.app.vault.getAbstractFileByPath(...)` based on the item title/folder or `savedFilePath`. If found, open it via `this.app.workspace.getLeaf().openFile(file)`.
    - If not saved, fallback to `this.showSaveOptions(event, this.currentItem)`.
- Optionally modify `showSaveOptions()` to include a "View saved note" menu item if `item.saved` is true as a secondary trigger.

## Verification Plan

### Automated Tests
Run the newly created unit and integration tests using Vitest:
`npm run test` or `npx vitest run test_files/unit/reader-view-save-button.test.ts` and `npx vitest run test_files/unit/reader-view-integration.test.ts`.
Ensure all tests transition from failing (Red) to passing (Green) after the implementation.

### Manual Verification
1. **Open an article** in the reader view.
2. **Save the article** using the save button in the header.
3. Verify the **save icon turns purple** (i.e., gets the `saved` class).
4. **Click the save icon** and verify it opens the saved note in Obsidian.
5. Verify that **right-clicking (or clicking) the save icon** shows "View saved note" in the dropdown menu.
6. Verify the same exact flow while playing a **podcast** and a **video** (since the toolbar in `ReaderView` handles all media types).
