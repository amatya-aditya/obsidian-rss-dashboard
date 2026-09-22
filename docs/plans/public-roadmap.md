# Public Roadmap

This roadmap highlights product areas that are actively being explored, planned, or considered for future development.

It is **not a release commitment**. Priorities, implementation details, and scope may change as features are researched, tested, and discussed with the community.

For work that has already shipped, see the release notes in [`docs/releases`](../releases). For the full development backlog, see the [GitHub issues](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues).

## Active / Near-Term Exploration

These areas have active GitHub issues and represent some of the more concrete directions currently being explored.

| Feature                                  | Description                                                                                                                                                                    | Tracking                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| FreshRSS / Google Reader API integration | Connect RSS Dashboard to FreshRSS and other services implementing the Google Reader API, allowing feeds and article state to work with an existing server-backed RSS setup.    | [#50](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/50)   |
| Article language metadata                | Add normalized language metadata for saved articles using publisher-provided signals where available, with local detection considered as a fallback.                           | [#246](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/246) |
| Article metadata enrichment              | Improve article metadata extraction and semantics for descriptions, excerpts, authors, canonical URLs, publication information, saving templates, and related Reader behavior. | [#247](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/247) |

## Storage & Sync

Storage reliability and multi-device behavior remain an important area of ongoing development.

| Feature                                  | Description                                                                                                                                                                                      | Status                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Sync V3                                  | Experimental device-owned replica architecture designed to avoid shared-file overwrite conflicts and improve deterministic multi-device state convergence. Shard storage v2 remains the default. | **Experimental** · [#274](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/274) |
| Storage health check and cleanup         | Detect mismatches between configured feeds and on-disk storage, surface storage warnings, and provide a recoverable cleanup workflow for orphaned or stale data.                                 | [#318](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/318)                    |
| Plugin-local storage and backup redesign | Change new-install storage defaults, simplify automatic backups, improve portable recovery, and integrate cleanup support. Existing installations would not be automatically migrated.           | **Post-2.7.0** · [#319](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/319)   |

## Ideas Under Consideration

These are product directions we continue to consider, but they are not currently committed to a particular release.

| Feature                        | Description                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text-to-Speech                 | Add built-in article narration or integrate with suitable platform capabilities.                                                                                |
| YouTube transcripts            | Extract and display transcript text for supported YouTube content.                                                                                              |
| Reading analytics and progress | Explore useful local statistics such as reading activity, reading time, completion, and progress without turning RSS Dashboard into an analytics-heavy product. |
| Expanded search                | Improve search across feeds, article metadata, saved content, and other locally available article information.                                                  |
| Newsletter support             | Explore better workflows for newsletter subscriptions and newsletter-derived content.                                                                           |
| Media playlist curation        | Allow users to organize podcast or video content into custom listening or viewing queues.                                                                       |

## Deferred / Exploratory

These ideas have come out of previous planning, issue triage, or implementation discussions. They remain possible future work but are not currently prioritized.

| Feature                              | Description                                                                                                                                                                              | Source                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Reading-view translation             | Translate article content directly within the Reader.                                                                                                                                    | [#133](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/133) |
| Per-feed first-seen fallback         | Allow individual feeds to override the global behavior that uses an article's first-seen date when no publication date is available.                                                     | Follow-up from #283 / #296                                                 |
| Undated-item placement               | Provide more control over where articles without publication dates appear when sorting by date.                                                                                          | Follow-up from #283 / #296                                                 |
| Show first-seen date                 | Optionally display an article's first-seen date in the Reader even when a publication date exists.                                                                                       | Follow-up from #283 / #296                                                 |
| Media notes                          | Explore timestamped or playback-aware notes for podcast and video content.                                                                                                               | [Media notes feature](media-notes-podcast-video-player.md)                 |
| Cover-image fallback                 | Fetch article-page metadata when feed data does not provide a usable hero image.                                                                                                         | [Cover image fallback](cover-image-fallback-og-fetch.md)                   |
| MP4 hero-image handling              | Improve handling of feeds that expose MP4 or video media where a normal article image is expected.                                                                                       | [Deferred plan](../archive/plans/unshipped/mp4-hero-images.md)             |
| Regex Search Support                 | Add optional regular-expression matching to RSS Dashboard article search while preserving existing plain-text search behavior.                                                           | [Draft plan](draft-20260921-regex-search.md)                               |
| Search Scope & Global Article Search | Improve RSS Dashboard's existing article search so users can choose between the current fast page-level search and a broader search across all articles in the active dashboard context. | [Draft plan](draft-20260921-search-scope-and-global-search.md)             |

## How to Read This Roadmap

The categories reflect different levels of certainty:

- **Active / Near-Term Exploration** means there is an active issue and meaningful investigation or planning around the feature.
- **Experimental** means implementation work may already exist, but the feature is not considered the default or stable path.
- **Ideas Under Consideration** are directions that may be worth pursuing but do not currently have a committed implementation plan.
- **Deferred / Exploratory** items have been discussed or partially designed but are intentionally not prioritized right now.

A feature appearing here should not be interpreted as a guarantee that it will ship, or that it will ship in its currently described form.

Implementation discussion, feature requests, and detailed technical planning continue to live in GitHub issues and `docs/plans`.
