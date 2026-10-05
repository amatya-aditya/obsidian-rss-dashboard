---
status: in-progress
created: 2026-10-03
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/646"
milestone: ""
owner: unassigned
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Adopt Prettier as the enforced formatter

## Resolution

Adopt the Prettier version already in `devDependencies` as the repository's
formatter and enforce it after the current refactor and pull-request backlog
settles. Format the existing supported files in one dedicated, mechanical
commit, then require clean formatting in the contributor hook and CI. Do not
make the rollout wait for future pull requests indefinitely: recheck the
current backlog at scheduling time, announce a short merge window, and ask any
remaining branches to rebase after the formatter commit lands.

The agreed policy decisions are:

- Format every tracked, hand-maintained file type supported by Prettier,
  including archived documentation. Exclude generated and build output with a
  small, explicit `.prettierignore`; do not exclude `docs/archive/`.
- Keep `.prettierrc` at two-space indentation with spaces and align
  `.editorconfig` to it. Keep LF line endings and final newlines.
- Provide separate `format` and `format:check` commands. The write command
  formats the repository; the check command reports differences without
  changing files.
- Use `lint-staged` to format staged files before the full compliance check.
  It must preserve unstaged edits in partially staged files. Add it as a
  development dependency and commit its lockfile changes.
- Make `CONTRIBUTING.md` the canonical contributor policy. Add a short command
  and link in `AGENTS.md` rather than duplicating the full policy.
- Add the whole-repository format check to `check:compliance` after the initial
  formatting commit. The existing build, pre-commit compliance hook, and CI
  already invoke this gate.
- Keep the formatter commit distinct and record its final commit SHA in
  `.git-blame-ignore-revs`. Merge the rollout PR with a merge commit so that
  the dedicated formatter commit keeps its identity.

## Baseline

Measured on `origin/dev` at `2089ad93cde1f26feb1cde0d2e96ce487458107a` on
2026-10-03 with locked Prettier 3.9.9:

```text
prettier --list-different .
823 files differ
```

The area breakdown was:

| Area                        |   Files |
| --------------------------- | ------: |
| `src/`                      |     247 |
| `test_files/`               |     351 |
| `docs/` outside the archive |      83 |
| `docs/archive/`             |      93 |
| `scripts/`                  |      18 |
| `.github/`                  |      10 |
| `.agents/`                  |       4 |
| Repository root             |      17 |
| **Total**                   | **823** |

The extension breakdown was 530 TypeScript, 194 Markdown, 36 CSS, 35 JSON,
19 MJS, 6 YAML, 1 JavaScript, 1 YML, and 1 `.prettierrc` file. This is the
Prettier CLI's supported-file scan from the repository root; no
`.prettierignore` currently narrows its scope.

Prettier is already declared as `^3.9.9` and resolves to 3.9.9 in the lockfile.
There is no `format` or `format:check` script and no Prettier gate in lint,
compliance, build, the Git hooks, or CI. `.prettierrc` specifies two spaces;
`.editorconfig` currently specifies tabs and width 4.

The worktree had no usable local Prettier installation. `npm ci` could not
complete in the managed Windows environment because it failed with `spawn
EPERM`. To measure the baseline without changing source files or borrowing the
main checkout's dependency tree, the check used that checkout's standalone
Prettier CLI after verifying that its version was exactly 3.9.9. The local
lockfiles differ, so its other dependencies were not used. The result above is
from a read-only scan of this worktree.

### Rerun before the formatting commit (2026-10-05)

Rerunning on `origin/dev` at `cef6455e` found two problems with the baseline
above, and the rollout accounts for both:

- **Line endings inflated the count.** Git for Windows with
  `core.autocrlf=true` checks files out as CRLF, so the Prettier CLI (LF by
  default) flagged almost every file. The true count with LF checkouts is
  **462 files**. Add `.gitattributes` with `* text=auto eol=lf` so Windows
  contributors get LF and `format:check` agrees with CI. Existing checkouts
  need `git rm --cached -r . && git reset --hard` once to re-check files out.
- **Prettier 3.9.9 is not idempotent on a few files.** One pass left three
  files (a Markdown checklist and two TypeScript files) that a second pass
  changed. Run `npm run format` until `npm run format:check` passes, and do
  not rely on a single pass. The acceptance criterion below means the
  committed tree is stable.

`package-lock.json` is the only addition to `.prettierignore`: npm rewrites it
on every install, so formatting it would only be undone. Fixture-vault JSON
stays in scope.

Formatting also exposed three follow-on failures, fixed in commits _before_
the formatting commit so that commit stays mechanical:

- Wrapped lines pushed `renderAboutTab` and `attachEventListeners` over the
  150-line `max-lines-per-function` limit. Each lost one small helper, with no
  suppression.
- `version-bump.mjs` wrote `manifest.json` and `versions.json` with tabs. It
  now writes two spaces and a final newline.
- Prettier wraps long CSS selectors, which broke an exact-match selector
  helper in `reader-custom-save-modal.test.ts`. The helper now collapses
  whitespace.

## Repository and hook constraints

At the baseline, #436 was still open and these five pull requests were open
against `dev`: #716, #710, #691, #683, and #561. On 2026-10-05 the refactor
program was far enough along, and the contributor backlog small enough
(#691 and #683 remained), that the rollout no longer waits on #436. Recheck
open pull requests before merging and announce the cut so remaining
contributors rebase once.

The existing `.githooks/pre-commit` runs `check:compliance` before
`scripts/run-staged-checks.mjs`. The staged-check script selects paths for
ESLint and related tests but does not format files or preserve partially staged
content. Put `lint-staged`'s formatting step before `check:compliance`, so the
full-repository check sees the formatted staged contents. Validate that a
partially staged file keeps its unstaged edits out of the commit.

## Rollout

1. **Agree the cut.** Refresh the open PR list from `origin/dev`, choose a
   short merge window, and tell contributors when to pause merges and when to
   rebase.
2. **Prepare the formatter.** Reconfirm the locked Prettier version; align
   `.editorconfig`; add `.prettierignore` entries only for generated or build
   artifacts; add `format` and `format:check`; configure `lint-staged`; and
   update the pre-commit order. Since this adds a dependency, read
   `docs/development/architecture.md` and complete its architecture preflight
   before implementation. Keep the full-repository gate out of
   `check:compliance` until the tree is formatted.
3. **Write the policy.** Add the contributor rule to `CONTRIBUTING.md` and a
   concise command/link in `AGENTS.md`. Proposed policy text:

   > Prettier is required for every tracked, hand-maintained file type
   > supported by the repository configuration. Run `npm run format` before
   > opening a pull request. The pre-commit hook formats staged files, and
   > `npm run format:check` verifies the full repository. Generated build
   > outputs are excluded by `.prettierignore`; archived documentation remains
   > in scope.

4. **Create one formatting-only commit.** Run the formatter across the agreed
   scope and inspect that the commit contains formatting changes only. Do not
   combine behavior changes with it.
5. **Enable the gate.** In a following commit, add the formatter commit SHA to
   `.git-blame-ignore-revs` and add `npm run format:check` to
   `check:compliance`. This makes the check part of `npm run build`, the
   existing pre-commit compliance step, and CI. Merge with a merge commit so
   the recorded formatter SHA remains valid. If `dev` moves before the merge,
   do not rebase the formatting commit: replay the commits before it, rerun
   the formatter, and update the recorded SHA.
6. **Communicate and close out.** Publish the new contributor command and
   remind remaining branch owners to rebase. Update issue #646 with the final
   baseline, checks, formatter commit SHA, and links to the merged policy and
   enforcement changes. Do not close the issue until the enforcement gate is
   active on `dev`.

## Validation and acceptance

- `npm run format:check` passes on the complete agreed repository scope.
- Running `npm run format` a second time produces no further changes.
- A staged-file hook check confirms that formatting is staged and unrelated
  unstaged edits remain unstaged.
- The `check:compliance` path, `npm run build`, and CI all run the formatter
  check and pass.
- The formatting-only commit is isolated, appears in `.git-blame-ignore-revs`,
  and retains the same SHA after merge.
- Contributor policy in `CONTRIBUTING.md` and the pointer in `AGENTS.md` name
  the same commands and scope.

## Reference review

Research checked the repositories below on 2026-10-03. These are examples of
maintainer choices, not standards that override this repository's decisions.

### Obsidian Dataview

Dataview defines separate `format` and `check-format` scripts, runs a distinct
formatting job in CI, and tells contributors to format only if the check
reports a problem. Its check covers `src/`.

- References: [package scripts](https://github.com/blacksmithgu/obsidian-dataview/blob/master/package.json), [CI workflow](https://github.com/blacksmithgu/obsidian-dataview/blob/master/.github/workflows/test.yml), and [contributor guide](https://github.com/blacksmithgu/obsidian-dataview/blob/master/README.md).
- **Adopt** the separate write/check commands and visible CI gate; these make formatting checks clear and non-mutating.
- **Do not adopt** the `src/`-only scope; this policy includes all tracked, hand-maintained supported files, including tests and documentation.

### Kepano's Minimal Theme and Minimal Theme Settings

Neither package declares Prettier or a formatting check. Both `.editorconfig`
files use tabs and width 4; the theme config also uses CRLF.

- References: [Minimal Theme package scripts](https://github.com/kepano/obsidian-minimal/blob/master/package.json), [Minimal Theme `.editorconfig`](https://github.com/kepano/obsidian-minimal/blob/master/.editorconfig), [Minimal Theme Settings package scripts](https://github.com/kepano/obsidian-minimal-settings/blob/main/package.json), and [Minimal Theme Settings `.editorconfig`](https://github.com/kepano/obsidian-minimal-settings/blob/main/.editorconfig).
- **Do not adopt** their indentation or line endings, or infer a formatter policy from them. They offer no Prettier enforcement to reuse, and their settings conflict with this repository's existing `.prettierrc` and the approved two-space/LF policy.

### Obsidian Excalidraw

Excalidraw declares Prettier and a config. Its `lint:fix` script formats TS/TSX
source files and then runs ESLint autofix; it does not expose a separate
`format:check` script.

- References: [package scripts and dependencies](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/package.json) and [Prettier config](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/.prettierrc).
- **Do not adopt** the combined write/fix command. A dedicated check gives CI a clear formatting result, and staged formatting remains separate from lint autofix.

### Obsidian Templater

Its current package scripts do not expose a Prettier command or declare
Prettier. Its ignore file excludes docs, changelog, README, and generated or
resource paths.

- References: [package scripts](https://github.com/SilentVoid13/Templater/blob/master/package.json) and [`.prettierignore`](https://github.com/SilentVoid13/Templater/blob/master/.prettierignore).
- **Do not copy** its documentation exclusions. This rollout includes archived and active Markdown so the repository has one consistent supported-file scope.

The only adopted external pattern is separate format and check commands with a
visible CI gate. The approved whole-repository scope, two-space indentation,
staged auto-formatting, contributor policy location, rollout timing, and
history-preserving merge are specific to RSS Dashboard.
