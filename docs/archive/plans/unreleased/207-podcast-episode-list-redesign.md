---
status: implemented
completed: 2026-09-06
released_in: unreleased
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/207"
implementation: ""
---

# Redesign the podcast episode browser as a bounded episode list

## Problem and user value

The existing podcast player calls a read-only, single-feed episode browser a
"playlist." That language implies a user-curated queue and is misleading. On
mobile the Playlist header, autoplay checkbox, dual sort pills, window
navigation, and return-to-current button consume too much space before the
episodes. The current five-row window protects performance for large local
feeds, but its navigation model obscures the number of available episodes.

This supersedes [GH Issue #183](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/183). It preserves bounded rendering while giving users a
clearer, lower-density episode browsing and playback experience.

## Proposed behavior

- Rename the playlist domain and UI to **Episode list**. The user-facing
  heading is `More episodes from {feed name}`.
- Keep the rendered episode count bounded at 20 rows. Display `Showing 20 of
  2,437` and append 20 more rows through an explicit **Load 20 more episodes**
  control.
- Replace Previous/Next window controls with incremental loading. A compact
  **Current episode** chip restores the rendered range containing the active
  episode without changing playback.
- Replace Recent/Oldest pills with one **Sort: Newest** menu offering Newest
  first and Oldest first.
- Make episode rows read-only, with 48 px mobile and 52 px desktop artwork,
  title, publication date, duration, and current-episode progress state.
  Selecting a row loads it into the player without starting playback.
- Keep existing player behavior unchanged. The only player integration is
  rendering and refreshing the episode-list section; on mobile, center speed,
  volume, and sleep timer in one compact responsive row, in that order.

## Acceptance criteria

1. Code and visible UI use Episode list terminology; no user-facing podcast
   browser control is labeled Playlist.
2. A large feed renders at most 20 episode rows initially and can expose later
   rows in 20-row increments without rendering the full feed at once.
3. The range label reports the visible count and total episode count, and the
   current-episode chip restores the active episode's range.
4. Sorting is available through a single menu and updates episode order without
   recreating the audio element.
5. Episode rows present title, date, duration, compact artwork, and an
   observable current/playing state; selecting a row loads but does not
   autoplay it.
6. Existing player controls and layouts remain unchanged. Episode-list theme
   selectors, tag refreshes, artwork fallback, and popout compatibility
   continue to work.

## Test seams and validation

- **Episode-list DOM seam:** jsdom tests observe the heading, range label,
  incremental loading, sort menu, current-episode recovery, and selection
  callback.
- **Podcast-player integration seam:** tests observe audio-element preservation
  while loading more episodes or sorting the episode list.
- Run focused component and player tests during red-green cycles, then ESLint
  for changed TypeScript, `npm run check:platform`, CSS scope/important checks,
  TypeScript checking, the relevant unit suite, `npm run build`, and
  `git status --short`.
- Manually verify a synthetic feed with thousands of episodes, each theme, and
  a popout reader window.

## Non-goals

- Do not create a user-curated playlist or queue.
- Do not change feed persistence, retention, network loading, or recommendation
  behavior.
- Do not make the player sticky on mobile or automatically start playback when
  an episode row is selected.

## Risks and sequencing

This is a medium-risk change across player state, an independently tested DOM
component, responsive CSS, and theme selectors. It supersedes #183's
five-episode window contract but retains its core performance objective:
bounded episode-row rendering for large locally stored feeds. No external
dependency is required.

## Release recommendation

Recommend a vNext enhancement. Leave milestone and release requirement empty
until GitHub triage assigns them.

## Implementation and validation

- Replaced the windowed component and its tests with `PodcastEpisodeList`, which
  renders at most 20 rows, preserves the loaded count across player rerenders,
  and restores a hidden active episode's 20-row batch without selecting it.
- Migrated tag refreshes and theme selectors to episode-list terminology.
  Episode rows are native buttons that load the selected episode without
  autoplaying it. Existing player behavior is unchanged, and mobile speed,
  volume, and sleep timer controls share one centered, evenly spaced responsive
  row. The rounded sleep control replaces its icon with the active countdown,
  rather than creating a separate timer surface, and the volume slider fills
  the available center column through to the sleep control.
- Validation is pending after this scoped rollback.
