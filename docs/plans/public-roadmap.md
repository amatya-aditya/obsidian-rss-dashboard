# Public Roadmap

This document collects public-facing ideas, compatibility notes, and upcoming work that is still tracked in `docs/plans`. Priorities may change, but this is the best place to track what is likely coming next without digging through older planning folders.

## Future Feature Ideas

These items were previously listed in the README:

| Feature                      | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| Advanced Analytics           | Track reading time, articles read, and other high-level insights |
| Text-to-Speech (TTS) Support | Add built-in article narration support                           |
| Newsletter Integration       | Support newsletter subscriptions and management                  |
| YouTube Transcripts          | Extract and display YouTube video transcripts                    |
| NoteStamp Integration        | Improve note-taking with timestamps and annotations              |
| Advanced Search              | Add deeper search across saved articles and feeds                |
| Progress Tracking            | Track reading progress                                           |
| Playlist Curation            | Ability to create custom playlists from Youtube or Podcasts      |


### Recorded from triage

Ideas that came out of issue triage rather than the README. Kept here rather
than as open issues, so the backlog reflects work that is actually queued.

| Feature                    | Description                                                                                                                                                                                                                       | Source                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Local language detection   | Detect an article's language from its text when no publisher signal exists. Ruled out of the metadata pipeline seam as a third runtime dependency on a mobile plugin, serving only the tier where no publisher declared a language. | [#272](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/272) |
| Reading-view translation   | Translate article content within the reader.                                                                                                                                                                                       | [#133](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/133) |
| Per-feed first-seen-date fallback override | Add "Use first-seen date for undated items" to the add/edit feed modal, superseding the global `useFirstSeenDateFallback` setting when set on a specific feed. | Deferred follow-up from #283/#296 manual QA — no issue filed, no date set |
| Undated-item placement setting | With the first-seen-date fallback on, undated items currently sort to the top under "newest" order (intentional, decided during #283's original grilling). Add an option to instead pin undated items to the bottom regardless of sort direction, or sort them purely by first-seen among themselves. | Deferred follow-up from #283/#296 manual QA — no issue filed, no date set |
| "Show first seen" reader-wide display toggle | A new setting under Settings → Display → Reader that always shows an article's first-seen date in the reader, for all RSS articles — not just as a fallback when pubDate is missing. Distinct from `useFirstSeenDateFallback`, which only substitutes first-seen when there's no real pubDate. | Deferred follow-up from #283/#296 manual QA — no issue filed, no date set |

## Documented Upcoming Ideas

These features already have draft plan documents and are still not implemented:

- Media notes for podcast and video playback: [Media notes feature](media-notes-podcast-video-player.md)
- Better handling for `.mp4` hero images in feed view is [deferred](../archive/plans/unshipped/mp4-hero-images.md).
- Cover image fallback | Send GET requests to articles to grab hero image if not present in feed item | [cover-image-fallback-og-fetch.md](cover-image-fallback-og-fetch.md)

## Notes

- This roadmap focuses mostly on user-facing features, with a small amount of major-version cleanup context where it affects planning.
- Some items are exploratory and may be split, renamed, or reprioritized before implementation.
- For shipped changes, see the release notes in [`docs/releases`](../releases).
