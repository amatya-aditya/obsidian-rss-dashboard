---
status: proposed
created: 2026-09-09
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 3
depends_on: ["234-01-import-starred-items-for-existing-feeds"]
release_requirement: ""
implementation: ""
---

# Opt-in full article content fetch

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

Add a checkbox to the import review UI ("Fetch full article content"), off by default. When enabled, after the base import from [234-01](../archive/plans/unreleased/234-01-import-starred-items-for-existing-feeds.md) completes, run the existing `fetchFullArticleContentWithOutcome`/Readability/Turndown pipeline (the same one `ArticleSaver.saveArticleWithFullContent` uses) once per selected imported article. A per-article failure (removed page, paywall, network error) does not fail the whole import — it's recorded and shown in a results summary naming the article, linking to its original URL, and recommending the Obsidian Web Clipper browser extension as a manual fallback.

## Blocked by

- 234-01-import-starred-items-for-existing-feeds

## Acceptance criteria

- [ ] The review UI has an off-by-default "Fetch full article content" toggle.
- [ ] When enabled, each selected imported article gets a full-content-fetch attempt via the existing pipeline, without duplicating its fetch/Readability/Turndown internals.
- [ ] A per-article fetch failure is non-blocking and appears in a results summary with the article's URL and a note recommending the Obsidian Web Clipper extension.
- [ ] When the toggle is off, no full-content fetch requests are made at all.
