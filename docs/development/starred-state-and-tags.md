# Starred State and Tags

Starred state and tags are independent article properties. See
[ADR 0011](../adr/0011-decouple-starred-state-from-tags.md) for the decision
record and rationale; this page is the short practical reference for
developers and for anyone integrating with import/export.

## The model

- `starred` is a boolean on an article. It is toggled only by the star
  action (dashboard star button, reader star button, hotkey).
- `tags` is an array on an article. It is changed only by tag actions (the
  tag menu, tag portal, per-article tag chips, or import label mapping).
- Neither field is derived from the other. A tag named "Favorite" or
  "Starred" has no special meaning to the plugin — it is an ordinary tag.

All article-update paths (dashboard actions, reader actions, background
import) funnel through `applyAutomaticArticleTags` in
[`src/utils/tag-utils.ts`](../../src/utils/tag-utils.ts), which is the single
seam where automatic tag behavior is applied. It no longer branches on
`starred`; the only automatic tag behavior left there is the independently
configured Saved-tag convenience (`articleSaving.addSavedTag`), which is
unrelated to starring.

## Valid combinations

| | Untagged | Tagged |
| --- | --- | --- |
| **Starred** | Valid: a keep/revisit marker, no classification. | Valid: both persist and change independently. |
| **Unstarred** | Valid: the default state. | Valid: classified without implying read-later intent. |

## Import mapping (Inoreader / Google Reader-compatible)

The starred-import mapper (`src/services/starred-import-mapper.ts`) follows
the same separation: a Google Reader system-star category
(`user/-/state/com.google/starred`) sets `starred`, and label categories
become tags. Import must not manufacture a "Favorite" tag from starred
state, and re-importing the same export stays idempotent for both fields
independently. See the
[Starred-import guide](../starred-import-guide.md) for
the user-facing behavior of that feature, and
[docs/starred-import-compatibility.md](../starred-import-compatibility.md)
for the parser contract and which exporters (Inoreader, FreshRSS) are
actually confirmed compatible. [ADR 0003](../adr/0003-generalize-starred-import-to-google-reader-compatible-naming.md)
covers the move from Inoreader-only naming to generic Google
Reader-compatible naming.

## Migration note

No migration runs against already-persisted data. A vault's existing
"Favorite" tag, on articles or in the tag palette, is left exactly as it is
— there is no reliable way to tell a tag the old code generated from one the
user assigned by hand. Only `DEFAULT_SETTINGS.availableTags` (the palette
seeded for a fresh install) dropped "Favorite"; existing vaults are
unaffected.

## Test coverage of the boundary

The independence described above is proven at three layers, not just
asserted:

- **Import mapping**: `test_files/unit/services/starred-import-mapper.test.ts`
  covers that Google Reader/Inoreader system-star state maps to `starred`
  without ever producing a "Favorite"/"Starred" tag, and that label
  categories map to tags independently of starred state.
- **Re-import idempotency**: `test_files/unit/services/starred-import-merge.test.ts`
  covers that re-running the same import repeatedly leaves an
  already-imported article's `starred` and `tags` unchanged, and never
  manufactures a tag from starred state on merge either.
- **Shard v2 reload**: `test_files/unit/services/feed-storage-repository.test.ts`
  (describe block "shard storage v2 user-state.json persistence") covers
  that a real `persistSettings` → restart → `hydrateSettings` cycle preserves
  `starred` and `tags` as independent values — tagging an article never
  stars it, and starring/unstarring never touches its tags.
