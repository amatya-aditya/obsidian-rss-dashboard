# Pre-Release Checklist

Run this before CONTRIBUTING.md's Release Process
[Step 2 — Cut the Release Branch](../../CONTRIBUTING.md#step-2--cut-the-release-branch).
It catches repo-hygiene drift that `npm run build` does not: stray files and
plans that never got a status or never got archived.

## Automated

```bash
npm run check:pre-release
```

This runs as part of `npm run check:compliance` (and therefore `npm run
build`), so it already gates every PR — not only release cuts. It checks
tracked files only (nothing that only exists in your local working tree), so
it is safe to run in CI and on a normal dev machine mid-feature:

- No `.bak`, `.orig`, `.swp`/`.swo`, `~`-suffixed, `.DS_Store`, or `Thumbs.db`
  file is tracked in the repo.
- Every file under `docs/plans/` whose name matches the Plan Filename
  Convention (`<issue-number>-<slug>.md` or `draft-YYYYMMDD-<slug>.md`, see
  [docs/development/README.md](README.md#plan-filename-convention)) has a
  `status` in frontmatter, and that status is one of `idea`, `proposed`,
  `accepted`, `blocked`, `in-progress` — i.e. still active work. A plan with
  `status: implemented` (or `rejected`/`superseded`) should already have moved
  to `docs/archive/plans/` per the
  [Plan Lifecycle and Archive](README.md#plan-lifecycle-and-archive) policy;
  the script flags one left behind instead.
- Every curated What's New note under `src/release-notes/notes/` has a
  top-level heading and uses only HTTPS images with alt text, and the version
  in `manifest.json` — when it is a major/minor release — has a note for its
  release line. A missing note fails the build instead of shipping an empty
  popup.

Non-lifecycle documents in `docs/plans/` (for example `public-roadmap.md`,
which carries no frontmatter by design) are left alone.

## Manual

These are either about local/working-tree state (which CI can't see, and
which would false-positive on ordinary WIP if automated into
`check:compliance`) or require judgment the script can't apply:

- [ ] `git status --porcelain` is clean on the branch you're about to cut
      from — no forgotten untracked files, no uncommitted changes.
- [ ] `docs/archive/README.md`'s catalog matches what's actually under
      `docs/archive/plans/` (no archived plan missing an entry, no entry
      pointing at a moved/renamed file).
- [ ] `CHANGELOG.md`'s `Unreleased` section reflects every user-visible merged
      PR since the last release (`gh pr list --state merged`, filtered to
      merge dates after the previous tag — see
      [release-notes-workflow.md](release-notes-workflow.md)).
- [ ] `npm run build` passes clean on the branch you're about to cut from.

## Why the untracked-file check isn't automated

`npm run check:compliance` runs on every `npm run build`, including mid-PR,
where a developer's working tree routinely has legitimate untracked scratch
files. Failing the build gate on that would be noise, not signal. The
tracked-files-only checks above are safe at any time; the working-tree
cleanliness check belongs at the point you're about to cut a release branch,
which is what this document's manual section is for.
