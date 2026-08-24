# RSS Dashboard

The vocabulary used for user-facing RSS Dashboard behavior, including its podcast player.

## Podcast player

**Active episode**:
The episode currently loaded in the podcast player's audio element. It anchors the playlist window whenever the player selects or advances to an episode.
_Avoid_: Current article, selected row

**Playlist window**:
A bounded, ordered set of episode rows presented by the podcast playlist around an active episode or while browsing nearby episodes.
_Avoid_: Full playlist, page

**Playlist order**:
The current sequence of episodes after the player's selected sort or shuffle behavior has been applied. It determines an episode's before and after neighbors.
_Avoid_: Publication order, feed order

**Playlist browsing**:
Moving the visible playlist window without changing the active episode or audio playback.
_Avoid_: Skipping, episode navigation

**Window navigation**:
Moving playlist browsing by one playlist-window length in playlist order. It is presented as Previous/Next rather than chronological Older/Newer.
_Avoid_: Pagination, chronological navigation
