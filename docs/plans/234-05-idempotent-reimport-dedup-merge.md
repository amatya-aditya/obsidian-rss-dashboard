---
status: proposed
created: 2026-09-09
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 4
depends_on: ["234-01-import-starred-items-for-existing-feeds", "234-04-map-labels-to-tags"]
release_requirement: ""
implementation: ""
---

# Idempotent re-import (dedup + merge)

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

Make re-running the starred.json importer against the same or an updated export safe. Candidate items are matched against a target feed's existing `items` using the same canonicalized guid-or-link identity logic already used by feed-refresh merging (`canonicalizeItemIdentityUrl`). A match is treated as an update, not a new insert: any newly-present labels (from [234-04](../archive/plans/unreleased/234-04-map-labels-to-tags.md), completed) are merged into the article's existing tags, and `starred` is forced to `true` — but `read`, `saved`, `savedFilePath`, and any other locally-edited fields are left untouched.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds
- 234-04-map-labels-to-tags

## Acceptance criteria

- [ ] Re-importing an unchanged export produces zero duplicate articles.
- [ ] Re-importing an export where a previously-imported item gained a new label results in that label being merged into the existing article's tags, without removing tags the user added locally.
- [ ] Re-importing never overwrites `read`, `saved`, `savedFilePath`, or other locally-edited fields on an already-imported article.
- [ ] Merge-function tests cover: brand-new item insertion, unchanged re-import (no-op), and re-import with an additional label/newly-starred state.
