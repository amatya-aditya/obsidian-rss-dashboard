# RSS Dashboard Codex Instructions

## Base branch

Branch and create worktrees off `dev`, never `master`. PRs target `dev`.
`master` takes no direct commits — it receives only merged `release/x.x.x`
branches, and every commit on it is a tagged release. Branch and worktree
naming follows `docs/agents/branch-naming.md`. See also **Branch
Descriptions** in `CONTRIBUTING.md`.

Verify the base before writing code. A local `refs/remotes/origin/HEAD` may still
point at `origin/master`, so a newly created worktree — and the branch an agent session
reports as "main" — default to `master` even when the main checkout is on
`dev`:

    git rev-parse --abbrev-ref HEAD
    git log --oneline --left-right dev...HEAD

If HEAD sits on `master`, move to `dev` before doing anything else. `master`
runs roughly 100 commits behind, and validation there is misleading rather
than merely stale: `manifest.json` declares `minAppVersion` 1.1.0 on `master`
against 1.8.7 on `dev`, so `npm run lint` reports dozens of phantom
`obsidianmd/no-unsupported-api` errors, `npm run build` fails at lint, and the
pre-commit hook refuses to commit at all. All of that is clean on `dev`. Do
not record those errors as a pre-existing backlog; they are an artifact of the
wrong base.

To move work already written on the wrong base, save it and replay it:

    git diff --cached --binary master > ../work.patch
    git reset --hard dev
    git apply -3 ../work.patch

### Branch from the pushed base

Rebase onto `origin/dev`, not a local `dev` that may be ahead of it. GitHub
diffs a pull request against the remote base, so every unpushed commit beneath
your branch appears in the PR as if it were yours — including another
session's in-flight work. Before opening a pull request, confirm only your own
commits are there:

    git log --oneline origin/dev..HEAD

### Worktree dependencies

A new worktree has no `node_modules`, and the build, tests, lint and git hooks
all need it. If the branch's `package-lock.json` matches the main checkout's,
link the main checkout's `node_modules` instead of running `npm ci`:

    # In the main checkout: exit code 0 means the lockfiles match
    git diff --quiet <branch> -- package-lock.json

    # PowerShell
    New-Item -ItemType Junction -Path <worktree>\node_modules -Target <main-checkout>\node_modules

Run `npm ci` in the worktree only when the branch changes `package.json` or
`package-lock.json`, and remove the junction first: `npm ci` through a link
rewrites the main checkout's packages.

`git worktree remove` leaves the junction behind. Unlink it with a plain `rm`
(or `cmd /c rmdir` without `/s`) on the link itself, then remove the empty
folder. Never `rm -rf` or `Remove-Item -Recurse` it: that deletes the main
checkout's packages through the link.

### Closing issues

`dev` is the repository's default branch, so `Fixes #NNN` in a pull request
description closes the issue when the PR merges. Confirm the issue closed after
merging.

## Mandatory guidance

Before making or reviewing a code or test change, read these files in full:

1. `.instructions.md`
2. `eslint.config.mjs`
3. `docs/development/test_coverage/testing-guide.md`
4. `docs/agents/branch-naming.md`

Before scoping or implementing a feature or bug fix, also read
`.agents/project-context.md` for the repository map and change workflow.

Before completing work driven by a file under `docs/plans/`, or cutting a
release that contains archived plans, read **Plan Lifecycle and Archive** in
`docs/development/README.md`. That section is the source of truth for plan
draft and issue-number naming, metadata, GitHub intake, archival destinations,
catalog updates, and release-time moves.

`eslint.config.mjs` is the authoritative source for implementation and platform-compatibility rules. Do not knowingly introduce, retain, or suppress a violation. Refactor the code to comply; do not add an `eslint-disable` or weaken a rule unless the user explicitly authorizes that policy change.

For popout-sensitive UI code, use the owning document/window APIs required by
the lint and platform checks. Use `activeDocument` instead of global
`document`, and use `window.setTimeout`/`window.clearTimeout` and the other
`window.*` timer APIs instead of `activeWindow.*` or bare timers. Do not use
`globalThis` in production UI paths.

Do not add `!important` declarations. Resolve CSS conflicts with a scoped,
higher-specificity selector built from an existing plugin root, component, and
state or element selector. `audit-ok` comments do not create an exception.

## Tests

Follow the testing guide for every test change:

- Put tests under the matching `test_files/unit/` directory.
- Use jsdom for DOM behavior, mock Obsidian APIs through `test_files/stubs/obsidian.ts`, and clean up DOM and mocks between tests.
- Write regression tests that describe observable behavior rather than implementation details.

## Required validation

Before handing off a code change, run the relevant checks and report their results:

- Run ESLint for every changed TypeScript file, or `npm run lint` when practical.
- Run `npm run check:platform` whenever a `src/` TypeScript file changes.
- Run the focused unit tests covering the change (`npm exec -- vitest related --run <changed files>` selects them from the import graph); run `npm run test:unit` when the change has broad impact.
- The pre-commit hook lints only staged files and runs only their related tests; the pre-push hook runs `npm run build` and the full unit suite. A passing commit hook is not full validation. See **Git Hooks** in `CONTRIBUTING.md`.
- Run TypeScript type-checking for TypeScript changes.
- Use `npm run build` for the repository's complete validation, or invoke the compiler directly as `tsc --noEmit --skipLibCheck`.
- If using `npm exec`, separate forwarded compiler arguments with `--` (for example, `npm exec -- tsc --noEmit --skipLibCheck`); never use `npm exec tsc --noEmit ...` because npm may consume the flags and allow TypeScript to emit generated `.js` files into `src/`.
- After validation commands, run `git status --short` and confirm no unexpected generated files were created. Remove only verified artifacts generated by the command before handoff.

If a required check cannot run, report the exact reason and do not claim compliance.

## Bug report format

When reporting a diagnosed/fixed bug, use this exact Markdown structure per
bug, no extra prose before or after:

```
**Bug 1: <one-line description>**
- **Status:** ✅ Fixed | 🔴 Open
- **Cause:** <one-line root cause>
- **Fix:** <one-line what changed, file(s) if useful>
- **Test:** <manual steps the user should do to confirm it's resolved>
```

Number every bug (`Bug 1:`, `Bug 2:`), even a single one — keeps numbering
stable if the user refers back to "bug 2" later. Blank line between bugs.

## GitHub pull request descriptions

When creating or editing a pull request from PowerShell, preserve Markdown
literally: use a UTF-8 `--body-file` rather than a double-quoted `--body`
argument. Before handoff, read the stored body with `gh pr view --json body`
and confirm it contains the intended headings, list items, inline code, and
issue-closing reference exactly once.
