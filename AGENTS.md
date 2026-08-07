# RSS Dashboard Codex Instructions

## Mandatory guidance

Before making or reviewing a code or test change, read these files in full:

1. `.instructions.md`
2. `eslint.config.mjs`
3. `docs/development/test_coverage/testing-guide.md`

`eslint.config.mjs` is the authoritative source for implementation and platform-compatibility rules. Do not knowingly introduce, retain, or suppress a violation. Refactor the code to comply; do not add an `eslint-disable` or weaken a rule unless the user explicitly authorizes that policy change.

For popout-sensitive UI code, use the owning document/window or `activeDocument`/`activeWindow` as required by the lint rules. Do not use global browser objects when they would break popout-window compatibility.

## Tests

Follow the testing guide for every test change:

- Put tests under the matching `test_files/unit/` directory.
- Use jsdom for DOM behavior, mock Obsidian APIs through `test_files/stubs/obsidian.ts`, and clean up DOM and mocks between tests.
- Write regression tests that describe observable behavior rather than implementation details.

## Required validation

Before handing off a code change, run the relevant checks and report their results:

- Run ESLint for every changed TypeScript file, or `npm run lint` when practical.
- Run `npm run check:platform` whenever a `src/` TypeScript file changes.
- Run the focused unit tests covering the change; run `npm run test:unit` when the change has broad impact.
- Run TypeScript type-checking for TypeScript changes.

If a required check cannot run, report the exact reason and do not claim compliance.
