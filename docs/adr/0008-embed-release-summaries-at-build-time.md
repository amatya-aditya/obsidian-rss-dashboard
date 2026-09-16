# Embed release summaries at build time for the What's New popup

## Status

accepted

## Decision

`CHANGELOG.md` is never shipped to installed users — `release.yml` attaches
only `main.js`, `manifest.json`, and `styles.css` to a release, and the
installed plugin folder never contains the changelog file. So the What's New
popup cannot read it at runtime.

Instead, a build-time script extracts the current version's `### Features`
bullets from `CHANGELOG.md`, matched by exact version heading (not "whatever
heading is on top"), and generates a small embedded module bundled into
`main.js`. Matching by exact version guards against the one manual step in
the release process: renaming `CHANGELOG.md`'s `## Unreleased` heading to the
real version number is a developer-done pre-tag edit, not automated by
`version-bump.mjs` or `release.yml`, so it could in principle happen after
tagging.

The full changelog entry (Features, Fixes, and Development/compliance) is
never embedded — only the Features bullets are. Anyone wanting the rest is
sent to `CHANGELOG.md` on GitHub. The About tab's "What's new" link reopens
the same embedded summary rather than fetching or linking out, so revisiting
it needs no network access.

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

## Consequences

Adds one new build step that must run before or alongside `esbuild` to
regenerate the embedded module from `CHANGELOG.md`. A version whose changelog
entry has no `### Features` subsection embeds nothing, and the What's New
popup is skipped for that release rather than shown empty.
