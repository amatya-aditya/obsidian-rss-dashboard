---
status: idea
created: 2026-09-10
issue: ""
milestone: ""
owner: unassigned
workstream: importers
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Starred import: show existing-article status in the preview

Related: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234) (parent issue for the "Import starred articles from Inoreader" feature).

## Problem

Re-importing the same or an updated `starred.json` export already merges into existing articles correctly at execute time (`applyStarredImportCandidateToFeed`, added for idempotent re-import). But the import preview itself never checks whether a candidate article already exists before the user commits — that matching only runs during `performImport`. A user reviewing the preview has no way to tell which rows are brand new versus which already exist in their vault and will be updated in place.

## Considered and deferred

Raised and discussed during manual-testing feedback on the 234-07..234-13 follow-up round (2026-09-10). Explicitly scoped out of that round: this is real, non-trivial preview-time work (running the existing matcher against every currently-selected candidate at render time, then surfacing a per-row "already exists — will update" indicator), not a one-line fix, and v1 of the feature doesn't need it. Deferred here so a future session doesn't have to rediscover that this was already considered and consciously postponed, rather than overlooked.

## What to build (sketch, not yet designed)

- At preview-render time (not just execute time), match each currently-selected candidate against existing feed items using the existing `findMatchingFeedItem` matcher.
- Surface a status indicator per row (exact visual treatment undecided) distinguishing "new" from "already exists — will update."
- Should apply to candidates under both existing-feed and new-feed groups — a new-feed group's articles could still already exist if a prior import run already created that feed.

## Blocked by

None — can be scoped and ticketed independently whenever it's prioritized.
