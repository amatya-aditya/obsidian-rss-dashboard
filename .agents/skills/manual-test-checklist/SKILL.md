---
name: manual-test-checklist
description: Print a manual QA checklist for the current work that the user will click through themselves.
disable-model-invocation: true
---

# Manual Test Checklist

A disposable checklist the **user** works through by hand. (For Claude to run
the checks itself and fix what fails, the user invokes `/test-checklist`.)

1. Read `docs/development/test_coverage/test-scenarios.md` in full and
   build the scenario list from it. Done when every item is action → expected
   result and the list is risk-ordered.
2. Print it inline in chat as markdown checkboxes; the chat reply is the whole
   deliverable, with no Artifact or file:

   ```markdown
   ## Manual test checklist: <one-line description of the change>

   ### Functional

   - [ ] <concrete action> → <expected result>

   ### Visual

   - [ ] <concrete action> → <what it should look like>

   ### Edge cases

   - [ ] <boundary/empty/error case> → <expected result>

   ### Regression (shared code also touched)

   - [ ] <sibling caller or feature> → <expected result>
   ```

3. Precede the list with one sentence naming the diff scope and why the list
   is shaped this way ("covers the 2 branch commits; the unit tests lock in
   the counts, so these are flow and visual checks"). Follow it with the
   one-line note on what was left to automated tests.
