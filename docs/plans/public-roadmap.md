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

## Documented Upcoming Ideas

These features already have draft plan documents and are still not implemented:

- Media notes for podcast and video playback: [Media notes feature](media-notes-podcast-video-player.md)
- Better handling for `.mp4` hero images in feed view is [deferred](../archive/plans/unshipped/mp4-hero-images.md).
- Cover image fallback | Send GET requests to articles to grab hero image if not present in feed item | [cover-image-fallback-og-fetch.md](cover-image-fallback-og-fetch.md)

## Notes

- This roadmap focuses mostly on user-facing features, with a small amount of major-version cleanup context where it affects planning.
- Some items are exploratory and may be split, renamed, or reprioritized before implementation.
- For shipped changes, see the release notes in [`docs/releases`](../releases).
