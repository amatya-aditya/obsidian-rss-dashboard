# ADR 0030: Read Video Progress from the Nested Player Frame

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-18

## Context and problem

The Reader plays YouTube videos through Obsidian's own embed host,
`https://releases.obsidian.md/youtube` (#1173, #1178). YouTube refuses a
direct embed from Obsidian's `app://` and `capacitor://` origins, and the
host serves the same nocookie player from an `https` origin that YouTube
accepts.

The host nests the player in a second iframe. The plugin's old progress
tracker listened for the YouTube IFrame API's `postMessage` events as if the
player were the plugin's direct child, so after #1178 no event arrived and no
video progress was saved. A saved position still resumed through the host's
`start` parameter, but **Remember playback progress** no longer saved new
positions for video (#1236).

## Decision

We will read the player's position from the nested player frame directly.

A cross-origin window still exposes `frames` and `postMessage`, so the plugin
sends the IFrame API's `listening` handshake to `hostIframe.contentWindow.frames[0]`.
The player answers the window that sent the handshake, so its `infoDelivery`
events (`currentTime`, `duration`, `playerState`) reach the plugin from the
YouTube origin. The host URL carries `enablejsapi=1`, which the host forwards
to the player; without it the player sends nothing.

Only a message whose `source` is that iframe's player window and whose origin
is a YouTube origin is accepted. The saved position is the last position the
player reported; nothing is estimated, and nothing is saved before the player
reports. Resume stays on the `start` parameter.

## Consequences

### Benefits

- Video progress is exact again: a pause, a seek inside the player, and the
  end of the video are all saved as the player reports them.
- No new hosted page, domain, or privacy surface. YouTube and Obsidian's host
  are the only parties, as before, and the Media terms notice is unchanged.

### Trade-offs

- The mechanism depends on two undocumented details: the host keeps the
  player as its first nested frame and keeps forwarding query parameters. If
  either changes, progress stops saving (playback and resume are unaffected),
  and the handshake gives up after 30 seconds.
- Checked on Obsidian 1.13.7 desktop (Linux). iOS and Android use the same
  web-platform frame and `postMessage` rules but need a manual check.

### Existing users and data

- Saved positions are unchanged and keep resuming. No setting or data
  migration.

## Considered options

### Option A — Estimated progress from wall-clock time

Rejected. The plugin cannot see a pause or seek inside the player, so an
estimate saves positions the reader never watched.

### Option B — A plugin-hosted relay page

Rejected. Exact, but it adds a hosted dependency to maintain and makes the
plugin's own host YouTube's Referer, which changes the privacy and terms
story.

### Option D — Drop video progress

Rejected. Honest and simple, but it loses resume-by-default for video, and
the nested-frame handshake makes the loss unnecessary.

### Option E — Handshake with the nested player frame (chosen)

## Implementation notes

- `src/utils/youtube-player-channel.ts` owns the handshake and message
  filtering; `src/views/video-player.ts` turns updates into saved progress.
- The message listener sits on the plugin's own `window`, popouts included,
  because the player answers the window whose code sent the handshake.
- The unused `MediaService.buildYouTubeEmbed` and `getYouTubePlayerHtml`
  helpers were removed.

## Related

- [GitHub Issue #1236](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1236)
- [GitHub Issue #1178](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1178)
- [GitHub Issue #1173](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1173)
