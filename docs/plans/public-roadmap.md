# Public Roadmap

This document collects public-facing ideas, compatibility notes, and upcoming work that is still tracked in `docs/plans`. Priorities may change, but this is the best place to track what is likely coming next without digging through older planning folders.

## Planned Features

These items were previously listed in the README:

| Feature                      | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| Advanced Analytics           | Track reading time, articles read, and other high-level insights  |
| Text-to-Speech (TTS) Support | Add built-in article narration support                            |
| Keyboard Shortcuts           | Add navigation and action hotkeys across the dashboard and reader |
| Newsletter Integration       | Support newsletter subscriptions and management                   |
| YouTube Transcripts          | Extract and display YouTube video transcripts                     |
| NoteStamp Integration        | Improve note-taking with timestamps and annotations               |
| Advanced Search              | Add deeper search across saved articles and feeds                 |
| Progress Tracking            | Track reading progress and podcast playback position              |
| Playlist Curation            | Ability to create custom playlists from Youtube or Podcasts       |

.

## Documented Upcoming Ideas

These features already have draft plan documents and are still not implemented:

- Keyboard shortcuts: [keyboard-shortcuts.md](keyboard-shortcuts.md)
- Media notes for podcast and video playback: [Media Notes Feature - Podcast and Video Player](Future/Media%20Notes%20Feature%20%E2%80%94%20Podcast%20%26%20Video%20Player.md)
- Better handling for `.mp4` hero images in feed view: [handle-mp4-hero-images.md](Future/handle-mp4-hero-images.md)

## Major Version Cleanup

These are not end-user features, but they are still part of the planned path to a future major release:

- Remove the legacy filter-to-rules migration that was added for beta compatibility.
- When that cleanup happens, the main pieces expected to go away are `src/utils/settings-migration.ts`, `test_files/unit/keyword-rules-migration.test.ts`, and the `migrateKeywordRulesSettings` migration path.
- This cleanup was previously tracked in `docs/plans/3.0/3.0-plans.md` and is now folded into this roadmap.

## Notes

- This roadmap focuses mostly on user-facing features, with a small amount of major-version cleanup context where it affects planning.
- Some items are exploratory and may be split, renamed, or reprioritized before implementation.
- For shipped changes, see the release notes in [`docs/releases`](../releases).
