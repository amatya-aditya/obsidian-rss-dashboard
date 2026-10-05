# ADR 0018: Generate Safe Article Filenames from Template Patterns

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-05

## Context and problem

Saved article notes currently use the article title as their filename. Users
may want filenames based on the same metadata and dates available in their note
templates. Generated names must also respect vault filename limits and avoid
replacing an unrelated note. Resaving an article must continue to update the
existing note, even when its template or folder settings later change.

## User stories

1. As a user, I want a saved template to define a filename pattern, so that
   notes created with it follow a consistent naming scheme.
2. As a user, I want filename collisions to produce a new available name, so
   that a different note is never silently replaced.
3. As a user, I want a resaved article to stay at its existing path, so that
   changing a pattern or folder does not unexpectedly move my note.

For the complete acceptance criteria, see [GitHub Issue #763](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/763)
and the saved-template editor requirements in [Issue #762](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/762).

## Decision

We will support an optional filename pattern on each saved template. It uses
the existing article-template placeholders for metadata, dates, and images,
but excludes `{{content}}` because a full Markdown body is not suitable as a
filename. The pattern produces a filename stem, and the plugin appends `.md`.
The settings field is labeled “Filename pattern” and shows this helper text:

> Leave blank to use the article title. The .md extension is added automatically.

An unset or unusable pattern falls back to the article title, then to
`Untitled Article`. The existing filename sanitization policy applies, with a
100-character maximum stem. A numeric collision suffix counts toward that
limit. When a different note already occupies the generated path, use the
first available suffix (`name 2.md`, `name 3.md`, and so on); never silently
replace that note.

Apply this filename behavior to all article-saving paths, including Web
Viewer. When the same saved article is identified, update its existing note at
its recorded path. A changed folder or filename pattern does not automatically
move that note. If an older title-based note can be found, continue updating it
in place without automatic migration.

The filename field must be keyboard-operable, visibly focused, and expose its
purpose and current value to assistive technology. Verify the changed flow
against the accessibility scope in issue #762 and the project reference in
[ADR 0016](0016-wcag-22-aa-accessibility-reference.md), without treating this
as a product-wide conformance claim.

## Consequences

### Benefits

- Users can name notes using article metadata while keeping the filename
  separate from the note body.
- Collisions preserve unrelated notes and produce predictable alternative
  names.
- Resaving preserves the path of an identified note, including notes created
  before filename patterns existed.

### Trade-offs

- Collision suffixes can make the saved filename differ from the requested
  pattern.
- The 100-character stem limit may truncate a long generated name or its
  collision suffix.
- Changing a template's folder or pattern does not reorganize notes already
  saved with that template.

### Existing users and data

- Templates without a filename pattern continue to use article-title-based
  filenames, followed by `Untitled Article` when sanitization leaves no usable
  name.
- A note already associated with an article continues to be updated at its
  recorded path; pattern changes do not migrate it.
- A title-based note found for an older article remains in place and continues
  to be updated there.
- A different note at the generated path is preserved; new saves use the first
  available numeric suffix instead of replacing it.

## Considered options

### Require users to enter a complete filename

Requiring an extension and a non-empty pattern would add friction and make
simple title-based saving harder. An optional stem pattern preserves the
current default while letting interested users customize names.

### Replace a colliding note

Replacing the current file would risk destroying unrelated user content,
especially when two articles produce the same title or pattern. Numeric
suffixes preserve both notes.

### Move existing notes when settings change

Moving notes could keep the library consistent with new settings, but it could
also disrupt links and user organization. Existing identified notes therefore
stay at their recorded paths.

## Related

- [ADR 0017 — Select Saved Article Templates by Feed, Then Global Default](0017-select-saved-article-templates-by-feed-then-global-default.md)
- [GitHub Issue #763 — Customize filenames for saved articles](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/763)
- [GitHub Issue #762 — Manage saved templates in Article Saving settings](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/762)
- [GitHub Issue #757 — Article saving: coordinate save fixes and template customization](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/757)
