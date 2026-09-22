# Starred State Is Independent from Tags

## Status

accepted

## Decision

Starred state and tags are orthogonal. A star action changes only an
article's `starred` boolean. A tag action changes only an article's `tags`.
Neither is derived from the other, and no tag name carries reserved or
system semantics.

Concretely:

- Starring or unstarring an article never adds, removes, or renames any tag,
  including one named "Favorite".
- Adding, removing, renaming, recoloring, or deleting a "Favorite" (or
  "Starred") tag never changes `starred`.
- The filled star remains the sole visual starred indicator. There is no
  accompanying auto-generated tag chip.
- The tag menu shows only tags actually assigned to the article; a checked
  "Favorite" entry means the user assigned that tag, not that the article is
  starred.
- `applyAutomaticArticleTags` (the shared article-update normalization seam
  used by both the dashboard and reader mutation paths) no longer branches on
  `updates.starred`. It still supports the independently configured
  Saved-tag convenience, which is unrelated to this decision and out of
  scope.
- Fresh installs no longer seed "Favorite" into the default tag palette. This
  applies only to `DEFAULT_SETTINGS.availableTags`; it does not touch any
  already-persisted vault.
- Existing "Favorite" tags on articles, and any existing "Favorite" entry in
  a vault's tag palette, are left exactly as they are. No migration runs.
  There is no reliable way to distinguish a tag the old code generated from
  one the user typed themselves, so any attempt to "clean up" generated
  Favorite tags risks deleting a tag the user actually created or relies on.
  The conservative choice is to change future behavior only.
- The starred-import mapper is unaffected by this ADR: it already maps
  Google Reader/Inoreader system starred state to `starred` and label
  categories to tags separately (see
  [ADR 0003](0003-generalize-starred-import-to-google-reader-compatible-naming.md)), and it
  must not manufacture a Favorite tag from starred state either.
- Starred-based retention protection and starred-status filtering continue
  to read `starred` directly; tag filtering continues to read `tags`
  directly. Both were already independent inputs and combine as any other
  status filter and tag filter do.

### Valid star/tag combinations

An article's starred state and its tags vary independently. All four
combinations are valid and meaningful:

| | Untagged | Tagged |
| --- | --- | --- |
| **Starred** | A lightweight keep/revisit marker with no classification. | Starred and classified; both persist and can be changed independently. |
| **Unstarred** | The default: no state, no classification. | Classified but not marked for revisit — tags do not imply starred, or read-later, intent. |

## Considered Options

- **Keep starring generate/remove a "Favorite" tag (status quo).** Rejected:
  it duplicates UI (a filled star plus a Favorite chip for the same fact),
  pollutes the ordinary tag menu with a checkbox the user did not check, and
  makes un-starring destructive to a tag the user may have created or relied
  on for their own organization. It also conflicts with the Google
  Reader/Inoreader import model this project already follows for starred
  import, where a star is system state and labels are user classification.
- **Reserve the tag name "Favorite" (disallow renaming/deleting it, or treat
  it specially in the UI).** Rejected: it keeps starred and tags coupled in
  spirit even if not in storage, still confuses "Favorite" with starred for
  users, and adds special-casing that the rest of the tag system (edit,
  delete, filter, chip rendering) would need to route around.
- **Migrate existing data by stripping "Favorite" tags that match a starred
  article, or by treating any starred article's "Favorite" tag as
  auto-generated.** Rejected: stored data has no provenance field
  distinguishing a tag the old code generated from one the user assigned by
  hand. A starred article with a manually added "Favorite" tag is
  indistinguishable from one with an auto-generated one. Any heuristic risks
  silently deleting user data, which is worse than leaving stale generated
  tags in place.
- **Decouple starred from tags going forward, leave existing data untouched
  (chosen).** Existing "Favorite" tags and palette entries are preserved
  exactly as persisted. This is a behavior correction for how new star/tag
  operations behave, not a data cleanup, and it never destroys something
  that might be a user's own tag.

## Consequences

A star action and a tag action are now fully independent inputs to article
state, matching the Inoreader/Google Reader-compatible import model already
used elsewhere in this project (ADR 0003) and the composable status/tag
filtering the sidebar already supports.

Users who starred articles before this change keep their existing
"Favorite" tags and their "Favorite" palette entry; nothing is removed on
upgrade. New stars no longer add that tag, so over time the correlation
between "starred" and "has a Favorite tag" weakens for anyone who continues
to star articles — this is intended, not a bug, since the two are no longer
the same fact.

Because no migration runs, a vault's "Favorite" tag (if present) is an
ordinary user tag from this point forward: renaming, recoloring, or deleting
it behaves exactly like any other tag and never touches `starred` on any
article.

This decision does not change Saved-tag behavior, retention protection
semantics, or the starred-import mapping; those already treated starred and
tags as independent inputs and are unaffected.
