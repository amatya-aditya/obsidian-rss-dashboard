# Curated What's New release notes

The What's New popup needs content that a user will actually read. Extracting
the `### Features` bullets from `CHANGELOG.md` at build time produces long,
technical, uneven text, cannot show an image, and silently ships an empty popup
when the manual "rename `## Unreleased`, then regenerate" release-prep step is
forgotten. This supersedes the build-time extraction recorded as ADR 0008 on
the `feat/288-whats-new-popup` branch; that branch's popup shell and trigger
gating are kept, its content mechanism is not.

## Status

accepted

## Decision

- **One hand-authored markdown note per release line** (`major.minor`), under
  `src/release-notes/notes/<major.minor>.md`. The note is a heading, an
  introductory line, titled sections that may contain an image, and an "Also
  improved" list. Authors write the heading including the version.
- **The note text is embedded into the bundle at build time** through esbuild's
  `text` loader, so the popup renders offline with no runtime fetch. Images
  stay remote and are referenced by HTTPS URL. There is no committed generated
  module and no generate step: adding a note is just adding the file, and the
  build reads it.
- **The unit is the release line, not the full version.** The popup shows the
  running release line's note once, when that line is newer than the last line
  recorded. A patch release never shows the popup and writes nothing, so a
  bug-fix release cannot interrupt users, and a user who skips a release line
  still sees its note.
- **The pre-release check enforces the content.** A major/minor release with no
  note for its release line fails `npm run check:pre-release` (and therefore
  `npm run build`). Every note must have a top-level heading, and every image
  must use HTTPS and carry alt text. Patch releases need no note.
- **Images render in the existing reader lightbox**, created against the
  modal's own document so popped-out windows work, and lifted above the modal
  layer. A remote image that fails to load is removed rather than shown broken.

## Considered Options

- **Keep extracting `CHANGELOG.md` Features bullets at build time.** Rejected:
  the output is written for contributors, not users, cannot carry images, and
  its silent-empty failure mode depends on a manual rename step.
- **Fetch the note from GitHub at runtime.** Rejected: adds a network
  dependency and a failure mode to a startup popup that can be fully local,
  and the text would be unavailable offline.
- **Embed the images in the bundle or ship them as release assets.** Rejected:
  the plugin's release assets are exactly `main.js`, `manifest.json`, and
  `styles.css`, and screenshots change independently of code. Remote URLs keep
  the asset set unchanged.
- **Commit a generated TypeScript module built from the notes.** Rejected: the
  same generated-file drift the previous approach had. A build-time text loader
  needs no committed artifact and no release-prep step.

## Consequences

- Adding a release note is authoring one markdown file; there is no separate
  generation command to forget.
- A malformed note fails the build instead of shipping an empty popup, and a
  missing note for a major/minor release fails it too.
- The popup makes one remote request, for the note's images, when it opens.
  That is documented in the README's network-use section.
- `docs/releases/<version>.md` remains the consolidated public release summary
  written at release-cut time; it is not the same file as the popup note.
