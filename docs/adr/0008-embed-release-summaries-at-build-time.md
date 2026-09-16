# Embed release summaries at build time for the What's New popup

## Status

accepted

## Decision

`CHANGELOG.md` is never shipped to installed users — `release.yml` attaches
only `main.js`, `manifest.json`, and `styles.css` to a release, and the
installed plugin folder never contains the changelog file. So the What's New
popup cannot read it at runtime.

Instead, `scripts/generate-whats-new-content.mjs` extracts the current
version's `### Features` bullets from `CHANGELOG.md`, matched by exact
version heading (not "whatever heading is on top"), and writes them into a
committed, generated module (`src/generated/whats-new-content.ts`) that
`main.js` bundles normally. Matching by exact version guards against the one
manual step in the release process: renaming `CHANGELOG.md`'s `##
Unreleased` heading to the real version number is a developer-done pre-tag
edit, not automated by `version-bump.mjs` or `release.yml`, so it could in
principle happen after tagging.

The full changelog entry (Features, Fixes, and Development/compliance) is
never embedded — only the Features bullets are. Anyone wanting the rest is
sent to `CHANGELOG.md` on GitHub. The About tab's "What's new" link reopens
the same embedded summary rather than fetching or linking out, so revisiting
it needs no network access.

**The generation script is run manually, as a release-prep step — not by
`npm run build` or `npm run dev`.** An earlier version of this decision
wired it into both, on the theory that the release build should always be
self-correcting. In practice this meant *any* build — most of which have
nothing to do with a release — silently rewrote a tracked file to whatever
`CHANGELOG.md`/`manifest.json` happened to say at that moment, which is
almost always mid-cycle noise (`## Unreleased`, not a real version) rather
than a meaningful update. That produced unwanted, confusing diffs on
essentially every `npm run build`/`npm run dev` invocation. Since
`.gitignore`-ing the file isn't an option — `tsc`/vitest need it to exist to
resolve the import — the fix is to stop auto-running the generator at all:
it's now a deliberate step in
[release-notes-workflow.md](../development/release-notes-workflow.md), run
once right after the `Unreleased` → version rename and committed alongside
it, the same way that rename itself is already a manual, once-per-release
edit.

## Considered Options

- **Runtime fetch from GitHub API or Releases.** Rejected: adds a network
  dependency and a failure mode just to show local release metadata, and
  `release.yml` currently creates releases with a generic `"Release $tag"`
  body, so Releases don't reliably carry usable notes anyway.
- **Hand-maintain a separate curated string per release in source.** Rejected:
  duplicates authoring already done in `CHANGELOG.md`, and the two would drift.
- **Ship `CHANGELOG.md` itself as a release asset.** Rejected: changes the
  release asset set to carry the entire project history for a feature that
  only ever needs one version's Features bullets.
- **Run the generator automatically in `npm run build`/`npm run dev`
  (original decision).** Rejected after implementation: caused the
  committed generated file to be silently rewritten on every ordinary build,
  not only release builds — noisy and confusing for no benefit, since the
  content only needs to be correct once, at release-cut time.

## Consequences

A version whose changelog entry has no `### Features` subsection embeds
nothing, and the What's New popup is skipped for that release rather than
shown empty. Forgetting the manual `npm run generate:whats-new` step during
release prep ships that release with an empty popup — a silent, low-harm
degradation (`getWhatsNewFeatures`'s version-match guard skips a stale or
missing entry rather than showing wrong content), not a build failure. The
generator's own console warning (when no heading matches the current version
at all) and the pre-release checklist item are the two safety nets against
forgetting it.
