# Branch and worktree naming

## Branches

```
<type>/<issue-number>-<short-slug>
```

- **type** — `feat`, `fix`, `docs`, `chore`, `refactor`, or `test`.
- **issue-number** — the GitHub issue number, no `#`.
- **short-slug** — 2-5 kebab-case words distilled from the issue title, not
  the full title.

Examples: `feat/231-inoreader-starred-import`, `fix/283-first-seen-date-opt-in`.

Work with no tracking issue is rare, since intake is issue-first (see
`docs/agents/issue-tracker.md`), but when it happens, drop the number:
`chore/eslint-config-bump`.

Always branch off `origin/dev`, never `master`. See **Base branch** in
`AGENTS.md`.

## Worktrees

Name the worktree directory after the branch, replacing `/` with `-` so it
stays a valid path and keeps a 1:1 mapping back to the branch:

```
git worktree add ../worktrees/feat-231-inoreader-starred-import -b feat/231-inoreader-starred-import origin/dev
```

Do not invent a different slug for the worktree than the one used in the
branch name — an agent or contributor should be able to derive one from the
other without checking.
