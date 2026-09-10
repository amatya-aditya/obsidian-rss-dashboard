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

## Deferred to 3.0

These are implemented (or already-planned breaking changes) that are deliberately held back from the next minor release so a version-floor change doesn't land as a surprise:

- **FreshRSS portable-state client** — fully implemented and merged to the `feat/fresh-rss` branch (all 13 workstream tickets; see `docs/archive/plans/unreleased/draft-20260908-freshrss-*.md` and `docs/development/freshrss-rollout-validation.md`). Its SecretStorage capability gate requires raising `minAppVersion` from the 2.6.0-released `1.1.0` to `1.11.4`. Rather than ship that floor raise piecemeal alongside one feature, it's held for a coordinated 3.0 release that bundles this with other version-floor-raising work already in flight (the `dev`-branch settings-UI compatibility migration, currently at `1.8.7`).
- **Remove `src/modals/feed-manager-modal.ts` barrel** — already scheduled for 3.0 as a breaking internal-API change; see [`deprecate-feed-manager-modal.md`](deprecate-feed-manager-modal.md).

## Notes

- This roadmap focuses mostly on user-facing features, with a small amount of major-version cleanup context where it affects planning.
- Some items are exploratory and may be split, renamed, or reprioritized before implementation.
- For shipped changes, see the release notes in [`docs/releases`](../releases).
