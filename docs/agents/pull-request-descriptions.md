# GitHub pull request descriptions

Moved from `AGENTS.md`; read this before writing or editing a PR body.

Use `.github/PULL_REQUEST_TEMPLATE.md` as the source for PR body structure.
Fill its related-issues section with each relevant issue once; use `Fixes #NNN`
when the PR should close an issue on merge, or `Refs #NNN` when it should link
without closing it. Include exactly one issue-closing reference for each issue
being closed.

Run the applicable manual-test-checklist before writing the PR body when the
change has manual testing steps. Append its checklist and results in the
template's final **Manual test checklist** section, marking whether it was
completed. If it was not completed, state why and list the remaining steps;
never present unchecked steps as passed. Mark it not applicable with a reason
when no manual checklist applies.

When creating or editing a pull request from PowerShell, preserve Markdown
literally: use a UTF-8 `--body-file` rather than a double-quoted `--body`
argument. Before handoff, read the stored body with `gh pr view --json body`
and confirm it follows the template, includes the manual-test-checklist status
and results, and contains the intended headings, list items, inline code, and
issue-closing reference exactly once.
