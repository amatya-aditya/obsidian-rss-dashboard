---
id: module-types
type: submodule-design
status: draft
title: Package — types
parent: architecture
---

# Package — types

## Responsibility

The shared contract catalog: settings and their defaults, `Feed`, `FeedItem`,
article user state, storage modes, discover types, and the small ambient
shims for Obsidian and vault access.

## Boundary

A leaf in practice, with one accepted edge: it imports `DEFAULT_TAG_CHIP_RADIUS`
from `src/utils/tag-chip-radius` to seed `DEFAULT_SETTINGS`. Otherwise it imports
only Obsidian's types. Moving that constant into this package would make it a
true leaf. Every other package may import it, so a change here is a change to
every consumer's contract.

## Invariants

- **`DEFAULT_SETTINGS` is the only default source.** New installations start
  on `storageMode: "vault-shards-v2"`, `metadataStorageMode:
"plugin-default"`, and `storageFolder: ".rss-dashboard-data/feeds"`. A
  feature that adds a setting adds its default here, not at the read site.
- **`FeedStorageMode` is a three-value union** — `legacy-json`,
  `vault-shards`, `vault-shards-v2` — and no code assumes exactly one.
- **`ArticleUserState` is the split state contract** of ADR 0004: read,
  starred, tags, saved, saved path, and playback progress live apart from feed
  content.
- **Stars and tags are independent.** `starred` and `tags` coexist; starring
  never creates, removes, or reserves a tag
  ([ADR 0011](../../docs/adr/0011-decouple-starred-state-from-tags.md)).

## Known gaps

`types.ts` is a large, cohesive catalog (~1,000 lines of declarations). Size
alone is not a reason to split it; split only where a contract is used by a
single area.
