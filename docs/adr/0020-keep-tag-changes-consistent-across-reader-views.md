# ADR 0020: Keep tag changes consistent across Reader views

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-06

## Context and problem

RSS Dashboard lets users manage tags from both the dashboard sidebar and the
Tags settings tab. Those controls do not currently have the same deletion
behavior: deleting a tag in the sidebar removes its assignments from articles,
while deleting it in settings removes only the available-tag entry. An article
can therefore retain a tag after the user has deleted it.

Open article-reading presentations also need to reflect tag changes. Issue
[#821](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/821)
records that deleting a tag can leave its chip visible in the inline Reader
view. The same visible tag information should stay current after a rename or
recolor, and this should apply to articles opened inline through either the
regular article or saved-article path.

The general term **Reader view** includes both dedicated Reader views and the
inline article-reading presentation inside the dashboard. Location-qualified
terms are used when the specific presentation matters; see the [domain
glossary](../../CONTEXT.md#reader-view).

## User stories

1. As a reader, I want deleting a tag to remove it from every article, so that
   a deleted tag does not remain in my reading or organization views.
2. As a reader, I want an open article to reflect tag renames, recolors, and
   deletions, so that its displayed tags match the current article state.
3. As a reader, I want an inline tag update not to rebuild the article, so that
   I can keep my place while reading.

## Decision

Deleting a tag definition from any tag-management control removes that
definition and all of its assignments from every article. Removing a tag from
one article remains a per-article action: it removes only that article's
assignment and leaves the definition and other assignments intact.

Open Reader views reflect tag renames, recolors, and deletions. The inline
Reader view updates its tag chip without re-rendering the article body.

## Consequences

### Benefits

- Sidebar and settings deletion have one predictable meaning.
- A deleted tag does not remain assigned to articles or displayed in an open
  Reader view.
- Renaming and recoloring are reflected in the inline Reader view while the
  article remains open.
- Updating the inline chip preserves the rendered article and reading position.

### Trade-offs

- Deleting a tag definition also removes the user's classification from every
  article carrying it, including when deletion starts in Settings.
- Settings deletion changes from palette-only removal to global removal of the
  tag and its article assignments.

### Existing users and data

- There is no automatic cleanup of assignments left behind by Settings
  deletions performed before this behavior is implemented. Stored assignments
  do not record whether they were intentionally retained or left behind by a
  prior deletion, so an automatic cleanup could remove data the user intended
  to keep.
- Future explicit deletion through either tag-management control removes the
  definition and its assignments together. No other existing assignments are
  migrated or rewritten.

## Considered options

### Keep settings deletion palette-only

Rejected. This preserves the current settings behavior, but allows a deleted
tag to remain on articles and gives the two tag-management controls different
meanings.

### Delete the definition and every article assignment from either control

Chosen. Both controls express deletion of the tag itself, and the article
assignments are uses of that definition. A per-article untag action remains
available when the user wants to remove only one assignment.

### Automatically clean all assignments without a matching definition on update

Rejected. Existing data does not identify why an assignment lacks a current
definition. Removing every such assignment could erase tags the user still
intends to keep.

## Related

- [ADR 0011 — Starred state is independent from tags](0011-decouple-starred-state-from-tags.md)
- [GitHub Issue #821](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/821) — inline Reader view keeps a deleted tag chip
- [Domain glossary](../../CONTEXT.md#reader-view)
