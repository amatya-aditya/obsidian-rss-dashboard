# Test scenarios from a diff

Shared reference for `/manual-test-checklist`, `/test-drive`, and
`/test-drive-and-fix`: how to turn
a diff into a short, risk-ordered list of scenarios that catch what automated
tests (unit, type-check, lint) structurally miss: real rendering, real click
targets, focus, app chrome, whole flows across callers.

## Find the diff

Cover everything the user would think of as "the work":

1. Uncommitted changes: `git status --short` and `git diff HEAD`.
2. Commits on the branch but not on its base: `git log --oneline <base>..HEAD`
   and `git diff <base>...HEAD`. The base comes from the repo's instructions
   (for example `origin/dev`); otherwise use the default branch's remote ref.

State the scope in one line ("covers the 2 branch commits plus uncommitted
edits"). When the diff mixes in mechanical noise (formatting, renames),
focus on the substantive change and say so in one line.

## Read the diff like a reviewer

Understand _what behavior changed_, then design the smallest scenarios that
would catch it being subtly wrong. Hunt for:

- **The motivating bug**: the commit message, PR body, or linked issue names
  it. It becomes item one.
- **New or changed UI**: buttons, states, popups, layout, anything a
  screenshot shows and a unit test cannot (spacing, icon, truncation).
- **Branches in the changed logic**: empty, zero/one/many, error path,
  especially the ones the diff was written to handle.
- **Shared code**: for every changed function, component, or modal, grep its
  other callers and add one regression item per sibling caller.
- **What the tests already prove**: skim the test diff and drop items an
  assertion already nails down; keep what jsdom cannot see.

## Tailor to the project

**Obsidian plugin** (`manifest.json` with plugin `id`/`minAppVersion`, entry
`main.ts`): start with a rebuild plus plugin reload. When the diff touches:

- CSS or DOM structure: check light and dark themes.
- A view, modal, or popup: check it in a popout window too (separate
  `document`/`window`; a historically buggy seam).
- Anything user-facing with `isDesktopOnly: false`: a mobile-viewport item of
  its own.

**Other stacks**: infer the context: a frontend means the browser, a CLI means
real arguments and the actual output, a service means a real request.

## Item rules

- Each item is **action → expected result**, both concrete ("click X",
  "run `cmd` with Y"). When you cannot state what "working" looks like, go
  back into the diff until you can.
- Order by risk, motivating bug first.
- Aim for 5-12 items. For a huge diff, say so and cover the highest-risk
  slice.
- Close with one line naming what you deliberately left to the automated
  tests, so the omission reads as judged rather than missed.
- Group under `Functional`, `Visual`, `Edge cases`, `Regression (shared code
also touched)`, using only the groups that have items.
