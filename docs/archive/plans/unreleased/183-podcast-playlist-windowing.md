---
status: implemented
completed: 2026-08-22
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/183"
implementation: "https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/184"
---

# Window the podcast playlist around the active episode

## Problem and user value

The podcast player renders every episode from the active feed as a playlist
row. Large feeds with thousands of historical episodes therefore create a
large DOM tree and make opening or updating the player unnecessarily costly.
Users should be able to move through nearby episodes without the player
rendering the entire feed.

## Proposed behavior

- Extract the playlist into an independently importable, feed-agnostic
  `PodcastPlaylist` component.
- Show a five-row **playlist window** centered on the **active episode**:
  normally two neighboring episodes before and two after it in the active
  playlist order.
- At either end of the playlist, fill the window from the available side so it
  still contains up to five rows.
- Respect the active playlist order. Recent, Oldest, and shuffle determine an
  episode's displayed neighbors.
- Add order-relative **Previous window** and **Next window** controls. They
  move the visible window by five episodes without changing audio playback.
- Display the visible range and total count, such as `Episodes 21–25 of
  2,413`, and provide a control to return to the active episode.
- Recenter the playlist window when playback selects or advances to an
  episode, or when sorting or shuffling changes the order. Preserve a
  browsed window during tag and playback-progress refreshes.
- Treat browsing position as transient UI state. Recreating the player or
  reloading a feed recenters on the active episode.
- Show the styled fallback artwork while an episode cover preloads in both the
  player and playlist; replace it with the cover only after a successful load
  so no blank or broken-image box is visible.

## Acceptance criteria

1. A playlist with more than five episodes renders no more than five episode
   rows at a time.
2. The initial window is centered on the active episode when both sides have
   enough neighbors, and is edge-filled at the beginning or end.
3. Recent, Oldest, and shuffle preserve their existing playback behavior and
   define the window's neighbor order.
4. Previous/Next window controls browse by five rows without changing the
   active episode or interrupting audio.
5. Selecting a row, player previous/next navigation, or autoplay recenters on
   the resulting active episode.
6. Sorting or shuffling recenters on the active episode; tag and progress
   updates do not discard a browsed window.
7. The playlist reports its visible range and total episode count accessibly
   and has no inaccessible control-only workflow.
8. Existing playlist appearance, theme selectors, tag updates, and playback
   progress indicators continue to work for every visible row.
9. Feeds with five or fewer podcast episodes continue to show all episodes.
10. A loading or failed artwork URL leaves the styled fallback visible; a
    successfully loaded cover replaces it without exposing a native empty or
    broken-image box.

## Implementation direction

Introduce a narrow playlist-order model shared by the player and playlist UI.
It should own ordered-episode and current-index invariants used by sorting,
shuffle, previous/next navigation, and autoplay. Keep feed lookup, audio
element control, playback-progress persistence, and playback notifications in
`PodcastPlayer`.

`PodcastPlaylist` should own playlist-section DOM creation, visible-window
state, range display, paging controls, and row interaction callbacks. It must
not depend on feed storage or an audio element, so a future curated playlist
can supply its own ordered episodes and callbacks. Preserve the existing CSS
class contract where practical to avoid a broad theme rewrite.

## Likely files

- `src/views/podcast-player.ts`
- `src/components/podcast-playlist.ts` (new)
- `src/utils/podcast-playlist-model.ts` (new, if a focused shared model is the
  clearest seam)
- `src/styles/podcast-player.css`
- `src/styles/podcast-themes.css`
- `test_files/unit/views/podcast-player.test.ts`
- `test_files/unit/components/podcast-playlist.test.ts` (new)
- `test_files/unit/utils/podcast-playlist-model.test.ts` (new, if extracted)

## Validation and manual checks

1. Add regression tests for centered windows, edge-filled windows, window
   paging without playback changes, recentering, sort/shuffle order, and
   metadata-refresh preservation.
2. Keep existing podcast-player tests passing, including audio-element
   preservation, tags, autoplay, sorting, and progress behavior.
3. Run ESLint on every changed TypeScript file, `npm run check:platform`, the
   focused unit tests, TypeScript checking, and `npm run build`.
4. Manually test a synthetic large feed, a short feed, Recent/Oldest/shuffle,
   autoplay, visible-row tag refreshes, each podcast theme, mobile layout, and
   a popout reader window.

## Non-goals

- Do not change feed persistence, retention, or network loading. The full
  episode collection may remain in memory; this work limits playlist DOM
  rendering.
- Do not add a user-configurable window size in this issue.
- Do not create custom/curated playlists. The feed-agnostic component boundary
  only enables that future work.
- Do not alter existing wraparound previous/next or autoplay semantics beyond
  keeping the playlist window synchronized with the active episode.

## Risks and sequencing

The main risk is splitting current playlist responsibilities without changing
the established playback sequence, sort/shuffle behavior, or theme styling.
The player currently contains duplicated full-playlist render paths, so
extraction should consolidate those paths before adding the window behavior.
No external dependency or prerequisite was identified.

## Implementation status

The playlist is now rendered through the feed-agnostic `PodcastPlaylist`
component. Focused jsdom coverage verifies centered and edge windows, paging
without episode selection, and the player integration's five-row cap.
Desktop/mobile, popout, theme, autoplay, and synthetic-large-feed manual
checks remain for the implementation handoff.

## Release recommendation

Recommend this as a `vNext` **stretch** enhancement. Leave `milestone` and
`release_requirement` empty until a GitHub issue is created and release intent
is assigned there.
