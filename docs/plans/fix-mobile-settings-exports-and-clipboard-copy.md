## Export + Implement: Mobile Settings Exports + Clipboard Copy

### Summary
1) Export this plan into a new `docs/plans` markdown file.  
2) Fix Settings export buttons on Obsidian Mobile (iOS/Android) so they open the native share/save menu and always show a toast.  
3) Add a copy-to-clipboard icon next to each export button to copy the corresponding file contents (with toast).  
4) Add Vitest unit tests for the new export/copy helpers.

### Plan Export (first action)
1. Create new file: `docs/plans/fix-mobile-settings-exports-and-clipboard-copy.md`.
2. Paste this full plan into that file (match style of `docs/plans/feature-sidebar-padding-controls.md`).

### Public API / Interface Changes
- Add new public methods on the plugin (`main.ts`):
  - `exportDataJson(): Promise<void>`
  - `copyDataJsonToClipboard(): Promise<void>`
  - `copyUserSettingsJsonToClipboard(): Promise<void>`
  - `copyOpmlToClipboard(): Promise<void>`
- Update existing exports to route through shared helper + consistent toasts:
  - `exportUserSettingsJson(): Promise<void>` (updated behavior)
  - `exportOpml(): void` (updated behavior; mobile uses share sheet, not “iOS copy-only”)

### Implementation Details
#### 1. Add pure helper module (testable)
- New file: `src/utils/export-utils.ts`
- Implement:
  - `exportBlob({ blob, filename, isMobile }): Promise<"shared" | "downloaded" | "opened" | "canceled" | "failed">`
    - If `isMobile` and `navigator.share` supports `files`: create `File([blob], filename, { type: blob.type })` and call `navigator.share({ files: [file], title: filename })`.
    - If share throws an abort/cancel (e.g. `AbortError`): return `"canceled"`.
    - If share isn’t available/supported or fails: fallback to `window.open(blobUrl, "_blank")` and return `"opened"` (or `"failed"` if that also errors).
    - If not mobile: `<a href=blobUrl download=filename>` + `.click()` and return `"downloaded"`.
    - Revoke object URLs via `setTimeout(() => URL.revokeObjectURL(url), 1000)`.
  - `copyTextToClipboard(text): Promise<"copied" | "failed">`
    - Prefer `navigator.clipboard.writeText`.
    - Fallback: hidden `<textarea>` + selection + `document.execCommand("copy")`.

#### 2. Plugin wiring + toasts
- File: `main.ts`
- Implement `exportDataJson()` (pretty JSON, filename `data.json`) using `exportBlob`.
- Update `exportUserSettingsJson()` to use `exportBlob` (pretty JSON, filename `usersettings.json`).
- Update `exportOpml()` to always export OPML via `exportBlob` (filename `feeds.opml`), removing the current iOS-only clipboard/export split.
- Add `copy*ToClipboard()` methods that call `copyTextToClipboard(...)`.
- Standardize `Notice` messages:
  - Export results:
    - `"shared"` / `"opened"`: “Opened save menu for <filename>”
    - `"downloaded"`: “Downloading <filename>”
    - `"canceled"`: “Export canceled”
    - `"failed"`: “Unable to export <filename>”
  - Copy results:
    - `"copied"`: “Copied <filename> to clipboard”
    - `"failed"`: “Unable to copy <filename>”

#### 3. Settings UI changes
- File: `src/settings/settings-tab.ts`
- Data.json section:
  - Replace inline anchor blob download with `void this.plugin.exportDataJson()`.
  - Add an icon-only `copy` button next to Export (tooltip: “Copy data.json to clipboard”) calling `void this.plugin.copyDataJsonToClipboard()`.
- Usersettings section:
  - Ensure export uses `void this.plugin.exportUserSettingsJson()`.
  - Add `copy` icon button calling `void this.plugin.copyUserSettingsJsonToClipboard()`.
- OPML section:
  - Keep export button calling `void this.plugin.exportOpml()` (no missing `void`).
  - Add `copy` icon button calling `void this.plugin.copyOpmlToClipboard()`.

### Unit Tests (after implementation)
- New file: `test_files/unit/export-utils.test.ts`
- Cover `exportBlob`:
  - Mobile share success: mock `navigator.share`, assert called with `{ files: [File] }`, returns `"shared"`.
  - Mobile cancel: `navigator.share` rejects with `{ name: "AbortError" }`, returns `"canceled"`.
  - Mobile share missing/unsupported: mock `window.open`, returns `"opened"`.
  - Desktop download: stub anchor `.click`, assert `download` set, returns `"downloaded"`.
  - Object URL lifecycle: stub `URL.createObjectURL`/`URL.revokeObjectURL`, use fake timers to assert delayed revoke.
- Cover `copyTextToClipboard`:
  - Clipboard API path: mock `navigator.clipboard.writeText`, returns `"copied"`.
  - Fallback path: remove/throw clipboard API, mock `document.execCommand("copy")`, returns `"copied"`; returns `"failed"` when execCommand false/throws.

### Acceptance checks
- On iOS + Android: tapping each Export opens share/save UI and shows a toast.
- On desktop: exports still download and show a toast.
- Each copy icon copies correct contents and shows a toast.
- `npm run test:unit` passes.
- `npm run build` passes.
