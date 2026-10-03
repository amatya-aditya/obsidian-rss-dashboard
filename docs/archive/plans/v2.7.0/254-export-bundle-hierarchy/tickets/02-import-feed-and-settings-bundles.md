# 02: importFeedBundle / importSettingsBundle

**Parent:** #254

**Status:** done

**Blocked by:** 01 — buildFeedBundle / buildSettingsBundle

## What to build

Matching import functions `importFeedBundle(...)` and `importSettingsBundle(...)`, each validating and merging only their own scope without touching the other half of the data. Both follow the same rollback-on-failure pattern as the existing `importPortableDataBundle`: on validation or apply failure, the pre-import state is restored and no partial write is left behind.

`importFeedBundle` must reject/ignore any settings-shaped fields in the input, and `importSettingsBundle` must reject/ignore any feed/folder/tag/article-shaped fields — each import bucket only ever touches its own scope regardless of what the input JSON contains.

Follow Red-Green: write failing tests first for validation, scope isolation, and rollback-on-failure, then implement.

## Acceptance criteria

- [x] `importFeedBundle(input, settings)` validates and applies only feed-bundle fields (feeds, folders, tags, articles, article state); settings are left untouched.
- [x] `importSettingsBundle(input, settings)` validates and applies only settings-bundle fields; feeds/folders/tags/articles are left untouched.
- [x] Both roll back to pre-import state on validation or apply failure, matching `importPortableDataBundle`'s existing rollback behavior.
- [x] A bundle exported by `buildFeedBundle`/`buildSettingsBundle` (ticket 01) round-trips through the matching import function with no data loss.
- [x] Unit tests cover validation failures, scope isolation, and rollback for both functions.
