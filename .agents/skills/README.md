# Agent skills

Skills for working on this repository. Each folder holds a `SKILL.md`, and some
bundle `references/`, `templates/`, or `scripts/` alongside it.

`AGENTS.md`, `.instructions.md`, and [the project context](../project-context.md)
remain authoritative for repository policy. These skills describe how to do the
work, not what the rules are.

## Change workflow

- **[work-on-rss-dashboard-change](./work-on-rss-dashboard-change/SKILL.md)** —
  Plan and implement user-visible features, bug fixes, and GitHub issues: intake,
  risk classification, TDD, conditional Obsidian audit gates, staged validation,
  changelog linking, and manual testing.
- **[code-review](./code-review/SKILL.md)** — Review a change or a pull request URL
  against the original acceptance contracts and repository standards, with
  independent evidence and explicit verification gaps.

## Verification

Three skills run the same risk-ordered checklist against the real app. They differ
in who does the work, not in what gets checked.

- **[test-drive-and-fix](./test-drive-and-fix/SKILL.md)** — Drives the app, fixes
  in-scope failures with a regression test and a commit, and parks product
  decisions for the user. Use it when the change is yours to make.
- **[test-drive](./test-drive/SKILL.md)** — The read-only sibling: drives the app
  and reports failures as a change request, never editing, committing, or
  pushing. Use it for a change you did not write.
- **[manual-test-checklist](./manual-test-checklist/SKILL.md)** — Prints the same
  checklist for the user to click through by hand; the chat reply is the whole
  deliverable.

The scenarios come from
[test-scenarios.md](../../docs/development/test_coverage/test-scenarios.md), and
the routes, evidence rules, statuses, and report format from
[test-execution.md](../../docs/development/test_coverage/test-execution.md).

## Pull requests

- **[pr](./pr/SKILL.md)** — The shape a pull request body should take: a summary as
  the smallest visual that makes the change clear, before/after evidence that it
  works, and a merge-danger call (one-way or two-way door, plus blast radius). It
  fills the repository's own
  [pull request template](../../.github/PULL_REQUEST_TEMPLATE.md).
- **[pr-screenshots](./pr-screenshots/SKILL.md)** — Turns before/after captures
  into a `Case | Before | After` table in a pull request body, then publishes the
  images with `gh --attach` instead of committing them.

`pr` reuses captures taken by `test-drive-and-fix`, which writes
`.agent/test-evidence/<branch>/<NN>-<slug>-before.png` and `-after.png`;
`pr-screenshots` consumes those pairs. Neither skill posts anything to GitHub
without explicit approval for that action.
