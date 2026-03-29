# P1-4: Keyword Filter Editor UI Tests - Handoff (post P1-3)

## Status

P1-4 is complete (delivered on 2026-03-29).

- Added: `test_files/unit/components/keyword-filter-editor.test.ts`
- Verified: `npm run test:unit` is green (71 files / 525 tests)
- Next recommended phase: P1-5 Article Saving Settings Tab tests: `docs/development/p1-5-handoff.md`

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P1-3 (Discover View tests) is complete as of 2026-03-29. The next recommended phase is P1-4: unit tests for `src/components/keyword-filter-editor.ts`.

## Task (P1-4)

Add unit tests for the keyword filter editor UI component.

- Create: `test_files/unit/components/keyword-filter-editor.test.ts`
- Target: `src/components/keyword-filter-editor.ts`
- Target coverage: 70%
- Risk: High (filter edits directly impact content visibility)

## What to Test

### Rendering + initial state

- Renders an existing set of rules (enabled/disabled, include/exclude, match mode, applyTo flags).
- Displays the correct empty state when there are no rules.

### Add/remove rule flows

- Clicking "Add rule" creates a new rule with sane defaults and makes it editable.
- Removing a rule updates the underlying rules array and UI immediately.

### Editing + validation

- Editing keyword text updates the rule model.
- Toggling enabled/include/exclude updates the rule model.
- Switching match mode (partial/exact/regex if supported) updates the rule model.
- Invalid inputs:
  - blank keyword is rejected/marked invalid
  - invalid regex (if regex mode exists) is rejected/marked invalid

### Persist-to-settings contract

- Confirms the component calls its provided callbacks (or mutates the passed-in settings object, depending on implementation) when rules change.
- Ensures changes survive a re-render (i.e., the UI reflects the updated model after edits).

## Testing Notes

- Prefer using jsdom and interacting via DOM events (click/input/change) rather than calling private methods.
- Keep assertions resilient: verify key selectors/values rather than brittle HTML snapshots.
- You may need to extend `test_files/stubs/obsidian.ts` for any UI primitives used by `keyword-filter-editor.ts` (e.g., `Setting`, `DropdownComponent`, `TextComponent`, `ToggleComponent`).

## Suggested Minimal Fixtures

- Start with 2-3 rules that cover:
  - include + partial match
  - exclude + exact match
  - regex mode (if present) with both valid and invalid patterns
