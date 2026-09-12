# 01: buildFeedBundle / buildSettingsBundle

**Parent:** #254

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

## What to build

Two new export builders in `feed-storage-repository.ts` — `buildFeedBundle(settings)` and `buildSettingsBundle(settings)` — that each produce one half of today's combined portable data bundle:

- **Feed bundle**: feeds, folders, tags, articles, and per-article state (read/starred/tags/saved/playback progress). No app settings.
- **Settings bundle**: app preferences only (display, retention, storage config, auto-backup, etc.). No feeds, folders, tags, or articles.

`buildPortableDataBundle` is refactored to compose its output from these two builders (`{ ...feedBundle, ...settingsBundle }`-equivalent) rather than assembling the full shape independently, so the combined bundle's content stays byte-for-byte unchanged.

Follow the Red-Green shape from the plan doc: write the field-subset tests first (they should fail against the current implementation), then implement.

## Acceptance criteria

- [ ] `buildFeedBundle(settings)` returns feeds, folders, tags, articles, and article state; contains no app-preference fields.
- [ ] `buildSettingsBundle(settings)` returns app preferences only; contains no feeds, folders, tags, or article data.
- [ ] `buildPortableDataBundle(settings)` is refactored to compose from `buildFeedBundle` + `buildSettingsBundle`, and its output is unchanged from before this ticket (regression-covered).
- [ ] Unit tests cover the field subsets for all three builders, mirrored under `test_files/unit/services/`.
