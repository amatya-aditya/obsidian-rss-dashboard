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
- No tracked filename contains a space, bracket, backtick, em- or en-dash, or
  a character Windows rejects. These break unquoted shell and glob use, and an
  em-dash is indistinguishable from a hyphen in a terminal while matching
  nothing. Use kebab-case.
- No tracked file is also matched by `.gitignore`. Git honours the index over
  `.gitignore`, so such a file keeps working while a *new* file beside it
  silently fails to stage — a contradiction that stays invisible until it
  costs someone an afternoon.
- Every plan under `docs/archive/plans/` appears in the catalog in
  `docs/archive/README.md`. Coordination roadmaps (`public-roadmap.md`,
  `release-v<x.y.z>-roadmap.md`) are exempt: `docs/archive/document-inventory.md`
  records them as living documents rather than archived implementation
  records.
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
  valid `major.minor.md` or non-zero `major.minor.patch.md` filename, a
  top-level heading, and only HTTPS images with alt text.

`check:compliance` also runs `npm run check:doc-links`, which resolves every
relative Markdown link in the tracked docs and fails on one that points at a
file that does not exist. Historical records under `docs/archive/` are
excluded: they describe the repository as it was, and their links were written
against a layout that has since moved, so rewriting them would falsify the
record.

## Release mode

```bash
npm run check:pre-release -- --release
```

One rule is off by default: that the version in `manifest.json`, when it is a
major/minor release, has a curated note for its release line. It asks whether
the working version is fit to ship, which is only meaningful when something is
shipping. Running it on every build forced `dev` to carry a note for a version
that had not been released, and made it impossible for `dev` to sit at the
last shipped version whenever that version predates the curated-notes feature.

`--release` turns it on. The release workflow passes it on tag push, where the
tagged commit is the version actually shipping, so a release cannot publish
with an empty popup. `check:release-ready` covers the same ground locally
before the bump, against the version you are about to ship.

Non-lifecycle documents in `docs/plans/` (for example `public-roadmap.md`,
which carries no frontmatter by design) are left alone.

## Manual

These are either about local/working-tree state (which CI can't see, and
which would false-positive on ordinary WIP if automated into
`check:compliance`) or require judgment the script can't apply:

- [ ] `git status --porcelain` is clean on the branch you're about to cut
      from — no forgotten untracked files, no uncommitted changes.
- [ ] No catalog entry in `docs/archive/README.md` points at a moved or
      renamed file. (The reverse direction — an archived plan missing from the
      catalog — is now automated above.)
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
