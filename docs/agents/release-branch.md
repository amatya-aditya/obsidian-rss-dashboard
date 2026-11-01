# Work that targets a release branch

Read this before cherry-picking onto, or opening a PR against, `release/x.y.z`.
The steps for cutting, bumping, tagging and shipping are in
[CONTRIBUTING.md](../../CONTRIBUTING.md#release-process); this file holds the
method those steps leave out.

## Integrate with cherry-picks

- Pick each PR by its squash SHA on `dev`, in merge order: `git cherry-pick -x <sha>`. The `-x`
  trailer keeps the dev SHA, so you can later tell what the release already has.
- Integrate through a branch cut from `origin/release/x.y.z`, a PR into the release branch, and
  **Create a merge commit** (never squash), so each pick stays one revertable commit.
- The release milestone defines scope. A refactor that is not milestoned ships only when a milestoned
  PR cannot apply without it; name those prerequisites in the PR body.

## Expect these conflicts

- `scripts/eslint-suppressions.json` conflicts on most refactor picks. Drop the entries the pick
  retires, then run `npm run lint`, which also fails on suppressions left that no longer occur.
- `dev` splits files that the release branch still has whole. `git status` shows the file as
  deleted-by-us (`DU`); the fix then belongs in the release branch's file. Port the change by hand,
  with its test, instead of aborting for good.
- `CHANGELOG.md` conflict context can show lines for PRs you did not pick. Keep only the lines for
  PRs that are on the branch.
- A pick can apply cleanly and still land in the wrong place. Run the gate after each batch.

## Gate before the PR

`npm run format:check`, `npm run lint`, `npm run check:test-types`,
`npm exec -- tsc --noEmit --skipLibCheck`, `npm run check:platform`, `npm run test:unit`,
`npm run build`. Keep each step's output (tee it to the scratchpad); a failure you cannot name is
not a flake.

## Bump PR

`npm run check:release-ready -- <version>`, then `npm version <version> --no-git-tag-version`,
commit the four files (`manifest.json`, `package.json`, `package-lock.json`, `versions.json`),
and update `src/release-notes/notes/<major.minor>.md`. Tag only after the bump PR has merged and
the user says go.
