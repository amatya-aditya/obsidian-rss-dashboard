## TDD Refactor: Extract Reader Format UI + Make `ReaderView` an Orchestrator

### Summary

Start by confirming the repo is green (unit tests + build). Then, TDD-first: improve test stubs, write failing tests for an extracted reader-format portal utility, implement the utility, refactor `ReaderView` to use it, and add `onClose()` cleanup.

### Baseline Verification (must be first)

- Run `npm run test:unit` to confirm the current unit suite is green.
- Run `npm run build` (eslint + `tsc -noEmit` + esbuild) to confirm the current build is green.
- If either fails: record failing tests/errors and stop refactor work until we decide whether to (a) fix only failures caused by the refactor work, or (b) repair pre-existing failures separately.

### Baseline + Expected Size Change (measured/estimated)

- **Before (measured):** `src/views/reader-view.ts` = **1643 LOC**
- **Extraction target (measured block):** lines **1264–1572** = **272 LOC** (reader-format toggle + portal + close)
- **After Stage 1 (estimated):**
  - `src/views/reader-view.ts`: **~1643 → ~1360** (≈ **-280 LOC**)
  - New `src/utils/reader-format-portal.ts`: **~0 → ~240–320 LOC**
  - New/updated tests + stub support: **~+120–220 LOC**
  - **Net repo LOC:** roughly **flat to -50 LOC**

### Key Design (decision-complete)

1. **New utility module (portal factory)**
   - Add `src/utils/reader-format-portal.ts` exporting:
     - `ReaderFormatPortalOptions`:
       - `anchor: HTMLElement`
       - `format: ReaderFormatSettings` (mutable object reference owned by caller)
       - `defaults: ReaderFormatSettings` (for reset)
       - `applyFormat: () => void` (caller updates CSS vars / datasets)
       - `scheduleSave: () => void` (caller debounced persistence)
       - `flushSave: () => Promise<void> | void` (caller immediate persistence)
       - `onClosed?: () => void`
     - `createReaderFormatPortal(options): { close: (flush: boolean) => void }`
   - Utility owns DOM + listeners for: desktop positioning, outside click close, mobile sheet/backdrop, mobile viewport resizing.

2. **`ReaderView` becomes coordinator**
   - Replace portal fields with `private readerFormatPortal: { close(flush: boolean): void } | null`.
   - Keep `getReaderFormat()`, `applyReaderFormat()`, and save logic in `ReaderView`.

3. **Lifecycle safety**
   - Implement/override `onClose()` in `ReaderView` to always: close tags dropdown, close reader format portal (flush), clear pending timeouts, destroy podcast/video players.

### TDD-First Steps (tests before implementation)

1. **Stub improvements (to enable UI-driven tests)**
   - Update `test_files/stubs/obsidian.ts` so `Setting.addDropdown()` and `Setting.addButton()` provide minimal controllable components (including a test-only method to trigger `onChange` / `onClick`).

2. **New failing tests**
   - Add `test_files/unit/reader-format-portal.test.ts` asserting:
     - Portal/backdrop creation (desktop vs mobile via `window.matchMedia`)
     - Dropdown change triggers `applyFormat()` + `scheduleSave()`
     - `close(true)` removes DOM + calls `flushSave()`

3. **Cleanup test**
   - Add `test_files/unit/reader-view-onclose-cleanup.test.ts` verifying `ReaderView.onClose()` reliably tears down portal/listeners and destroys players.

### Implementation Steps (after tests fail)

- Implement `src/utils/reader-format-portal.ts`.
- Refactor `src/views/reader-view.ts` to use the utility and delete the extracted portal code.
- Add `ReaderView.onClose()` cleanup.

### Acceptance Criteria

- `npm run test:unit` passes before and after.
- `npm run build` passes before and after.
- Reader settings UI behavior unchanged (desktop + mobile sheet).
- Leaf closure always cleans up DOM/listeners and players.
