# ADR 0009: Curated What's New release notes

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-21

## Context and problem

The What's New popup needs content that a user will actually read. Extracting the `### Features` bullets from `CHANGELOG.md` at build time produces long, technical, uneven text, cannot show an image, and silently ships an empty popup when the manual "rename `## Unreleased`, then regenerate" release-prep step is forgotten.

This replaces the earlier build-time extraction proposal from issue [#288](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/288), which was never merged into the repository's current ADR history.

## User stories

The decision is intended to preserve these core user expectations:

1. As a user who just updated to a new major or minor release, I want a short summary of what changed, so that I learn about new capabilities without reading a changelog.
2. As a user, I want the summary to be a few readable sections rather than a wall of bullets, so that I can skim it in seconds.
3. As a user, I want a screenshot-style image beside a feature description, so that I can see what the feature looks like.
4. As a user offline, I want the popup text to still appear if the image cannot load, so that a network problem never breaks the message.

For a complete list of all 33 user stories that were identified, visit [GitHub Issue #314](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/314).

## Decision

What's New content is a short, hand-authored note written for users, separate from the technical changelog, and bundled with the plugin so it displays without a network connection.

- **One hand-authored markdown note per release line** (`major.minor`), under `src/release-notes/notes/<major.minor>.md`, plus optional standalone notes for meaningful patch releases at `src/release-notes/notes/<major.minor>.<patch>.md`. Exact patch notes are self-contained and override their release-line note for that version. Release-line notes are required for major/minor releases; patch notes are opt-in. Each note is a heading, an introductory line, titled sections that may contain an image, and an "Also improved" list. Authors write the heading including the version.
- **The note text is embedded into the bundle at build time** through esbuild's `text` loader, so the popup renders offline with no runtime fetch. Images stay remote and are referenced by HTTPS URL. There is no committed generated module and no generate step: adding a note means adding the file and its explicit catalog import.
- **Automatic display is release-aware.** A major/minor release shows its release-line note once. A patch release shows an exact patch note only when one was intentionally authored; a patch without one does not interrupt the user or advance the automatic-popup marker. A user who skips a release line still receives that line's note when updating directly to a patch. The About button always reopens the most specific available note, falling back to the release-line note when no exact patch note exists.
- **The pre-release check enforces the content and names.** A major/minor release with no note for its release line fails `npm run check:pre-release` (and therefore `npm run build`). Every note must use either a `major.minor.md` or non-zero `major.minor.patch.md` filename, have a top-level heading, and use HTTPS images with alt text. Patch notes remain optional.
- **Images render in the existing reader lightbox**, created against the modal's own document so popped-out windows work, and lifted above the modal layer. A remote image that fails to load is removed rather than shown broken.

## Consequences

- Adding a release note is authoring one markdown file and registering its explicit import in the release-note catalog; there is no separate generation command to forget.
- A malformed note fails the build instead of shipping an empty popup, and a missing note for a major/minor release fails it too.
- The popup makes remote requests for the note's images when it opens. That network use is disclosed in the project's [security and privacy policy](../SECURITY.md#network-security) (originally documented in the README's network-use section).
- `docs/releases/<version>.md` remains the consolidated public release summary written at release-cut time; it is not the same file as the popup note.

## Considered options

### Keep extracting `CHANGELOG.md` Features bullets at build time

Rejected. The output is written for contributors, not users, cannot carry images, and its silent-empty failure mode depends on a manual rename step.

### Fetch the note from GitHub at runtime

Rejected. It adds a network dependency and a failure mode to a startup popup that can be fully local, and the text would be unavailable offline.

### Embed the images in the bundle or ship them as release assets

Rejected. The plugin's release assets are exactly `main.js`, `manifest.json`, and `styles.css`, and screenshots change independently of code. Remote URLs keep the asset set unchanged.

### Commit a generated TypeScript module built from the notes

Rejected. It has the same generated-file drift the previous approach had. A build-time text loader needs no committed artifact and no release-prep step.

## Related

- [GitHub Issue #314](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/314) — curated What's New release notes with remote images and lightbox
- [GitHub Issue #288](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/288) — original What's New popup and build-time extraction proposal
- [ADR 0001 — Full-resolution reader lightbox](0001-reader-full-resolution-lightbox.md) — the lightbox reused for note images
- [Release notes workflow](../development/release-notes-workflow.md) — how What's New notes, release summaries, and the changelog are authored
