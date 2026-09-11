---
status: implemented
created: 2026-09-10
completed: 2026-09-10
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234"
milestone: ""
owner: unassigned
workstream: importers
sequence: 4
depends_on: ["234-07-new-feed-metadata-refresh-toggle", "234-08-new-feed-folder-discoverability", "234-09-manual-full-content-fetch-in-reader", "234-10-remove-import-time-full-content-toggle", "234-11-tag-import-toggle-and-confirmation", "234-12-per-article-tag-chip"]
release_requirement: ""
implementation: ""
---

# User-facing documentation for starred article import

Parent issue: [#234](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/234).

## What to build

A short user-facing document explaining the Import Starred Articles feature: what it does, what each Options toggle controls, and the reasoning behind key decisions (why full-content fetch is manual and scoped to starred/saved articles, why new-feed metadata refresh is off by default). Written against the final, real behavior of tickets 234-07 through 234-12, not the plan. Placement (a README section vs. a dedicated docs page) is decided during this ticket.

Placement decided: a dedicated page at `docs/starred-import-guide.md` (matching the existing `docs/tags-primer.md` and `docs/storage-vault-shards-guide.md` pattern), linked from a new "Import Starred Articles Guide" section in the README's feature-guide list (alongside the existing "Vault Shards Storage Guide" and "Tags Guide" sections).

## Blocked by

- [234-07](234-07-new-feed-metadata-refresh-toggle.md)
- [234-08](234-08-new-feed-folder-discoverability.md)
- [234-09](234-09-manual-full-content-fetch-in-reader.md)
- [234-10](234-10-remove-import-time-full-content-toggle.md)
- [234-11](234-11-tag-import-toggle-and-confirmation.md)
- [234-12](234-12-per-article-tag-chip.md)

## Acceptance criteria

- [x] A document exists explaining the feature's end-to-end behavior from a user's perspective.
- [x] It documents both Options toggles, what each does, and their defaults.
- [x] It documents the manual full-content-fetch flow (the reader banner, Fetch now, Open in Browser) and why it's manual and scoped rather than automatic.
- [x] It documents the per-article tag chip and the unified tag-import confirmation.
- [x] It is linked from wherever the plugin's other user-facing feature documentation lives.
