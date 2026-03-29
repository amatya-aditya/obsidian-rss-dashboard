# P1-5: Article Saving Settings Tab Tests - Handoff (post P1-4)

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P1-4 (Keyword Filter Editor UI tests) is complete as of 2026-03-29. The next recommended phase is P1-5: tests for the extracted article-saving settings tab renderer in `src/settings/tabs/article-saving-settings-tab.ts`.

## Task (P1-5)

Add unit tests for `renderArticleSavingSettingsTab(...)`.

- Create: `test_files/unit/settings/article-saving-settings-tab.test.ts`
- Target: `src/settings/tabs/article-saving-settings-tab.ts`
- Target coverage: 75%
- Risk: High (misconfigured saving can cause data loss/confusion)

## What to Test

### Simple toggles + persistence

Verify that each control updates `plugin.settings.articleSaving.*` and calls `plugin.saveSettings()`:

- Save path text input:
  - changing value writes `defaultFolder` via `normalizePath(...)`
  - triggers `saveSettings()`
- Add "saved" tag toggle (`addSavedTag`)
- Save full content toggle (`saveFullContent`)
- Fetch timeout slider:
  - writes `fetchTimeout` (default fallback path: `|| 10`)
  - triggers `saveSettings()`

### Default template editor

- Textarea change updates `defaultTemplate` and calls `saveSettings()`.
- Reset button:
  - sets textarea + `defaultTemplate` back to `DEFAULT_SETTINGS.articleSaving.defaultTemplate`
  - calls `saveSettings()`
  - shows a `Notice("Template reset to default")`

### Save as template flow (modal + refresh)

- Clicking "Save as template" opens `TemplateNameModal`.
- When modal resolves with a name:
  - appends a new `SavedTemplate` to `plugin.settings.articleSaving.savedTemplates` (initializes array if missing)
  - calls `saveSettings()`
  - calls `onRefresh()` so the list re-renders
  - shows `Notice(\`Template \"<name>\" saved\`)`
- When modal resolves with empty/null, does nothing.

### Saved templates list actions

When `savedTemplates` is non-empty:

- Load:
  - sets textarea + `defaultTemplate` to selected template content
  - calls `saveSettings()`
  - shows Notice loaded message
- Update:
  - writes back from current editor content to the saved template entry
  - calls `saveSettings()`
  - shows Notice updated message
- Delete:
  - removes template from array
  - calls `saveSettings()`
  - calls `onRefresh()`
  - shows Notice deleted message

## Testing Notes

- `renderArticleSavingSettingsTab` uses Obsidian UI primitives (`Setting`, `Notice`) and helper classes (`VaultFolderSuggest`, `TemplateNameModal`).
- For deterministic unit tests:
  - mock `TemplateNameModal` so `waitForClose()` returns a controlled value
  - mock `VaultFolderSuggest` (or allow it to construct if it is side-effect free in the stub environment)
  - spy on `plugin.saveSettings` and on `Notice` construction (console output is fine, but tests should assert the message)
- The Obsidian stubs in `test_files/stubs/obsidian.ts` already include `Setting` and basic input components, but you may need to extend:
  - `Setting.addSlider` and `Setting.addButton` behaviors if not fully implemented for this tab

