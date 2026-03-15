# Podcast Player: Episode Details (Developer Notes)

This document explains how the **Episode details** collapsible section in the podcast player is built: where the data comes from, how it’s selected, and how show notes are sanitized before being rendered.

## What the feature does

When a podcast episode is loaded in the in-app podcast player, the UI renders a `<details>` dropdown under the seek bar:

- Episode metadata (published time, duration, explicit flag, season/episode, etc.)
- “Show notes” rendered as **sanitized HTML** (basic formatting + safe links)

If there is no metadata and no notes available, the section is not shown.

## Relevant files

- Player UI: [`src/views/podcast-player.ts`](../../src/views/podcast-player.ts)
- Sanitizer helper: [`src/utils/safe-html.ts`](../../src/utils/safe-html.ts)
- CSS styling: [`src/styles/podcast-player.css`](../../src/styles/podcast-player.css)
- Parsing pipeline (feed → `FeedItem` fields): [`src/services/feed-parser.ts`](../../src/services/feed-parser.ts)
- Podcast feed post-processing: [`src/services/media-service.ts`](../../src/services/media-service.ts)
- Unit tests: [`test_files/unit/podcast-player-episode-details.test.ts`](../../test_files/unit/podcast-player-episode-details.test.ts)

## Data flow: how episode data reaches the player

1. The plugin fetches and parses the feed XML, producing `FeedItem` objects (including `description`, `content`, iTunes fields, enclosure, etc.).
   - See [`src/services/feed-parser.ts`](../../src/services/feed-parser.ts) for the parsing and normalization logic (e.g. `content:encoded`, `itunes:*`, `enclosure`).
2. For podcasts, `MediaService.processPodcastFeed` infers/normalizes key fields like:
   - `audioUrl` from `enclosure.url` (or a fallback extraction from HTML)
   - `duration` from `item.duration`, `item.itunes.duration`, or heuristics
   - See [`src/services/media-service.ts`](../../src/services/media-service.ts).
3. The reader view creates the player and calls `loadEpisode(item, ...)`.
   - See [`src/views/reader-view.ts`](../../src/views/reader-view.ts) (`displayPodcast`).
4. `PodcastPlayer.loadEpisode` sets `currentItem`, renders the player, and inserts the Episode details section.
   - See [`src/views/podcast-player.ts`](../../src/views/podcast-player.ts).

## Notes selection (show notes source precedence)

The player chooses which HTML to treat as “show notes” using this precedence:

1. `FeedItem.content` (typically `content:encoded`)
2. `FeedItem.description`
3. `FeedItem.itunes.summary`
4. `FeedItem.summary` (short plain-text summary)

Additionally, the player prefers `content` over `description` only when it’s “meaningfully different”:

- `content.length > 40`
- and `stripWhitespace(content) !== stripWhitespace(description)`

This avoids duplicating the same block twice while still favoring full show notes when the feed provides both.

Implementation: `PodcastPlayer.selectEpisodeNotesHtml(...)` in [`src/views/podcast-player.ts`](../../src/views/podcast-player.ts).

## Metadata rendered

The metadata grid renders label/value rows only when the field exists:

- Published: derived from `FeedItem.pubDate`
- Duration: `FeedItem.duration || FeedItem.itunes?.duration`
- Author: `FeedItem.author`
- Explicit: `FeedItem.explicit` (boolean)
- Season/Episode: `FeedItem.season`, `FeedItem.episode`
- Type: `FeedItem.episodeType`
- Category: `FeedItem.category`
- Link: `FeedItem.link` (opens in external browser)
- Size: `FeedItem.enclosure.length` (formatted as bytes when numeric)

Implementation: `PodcastPlayer.renderEpisodeDetailsUnderProgress()` in [`src/views/podcast-player.ts`](../../src/views/podcast-player.ts).

## Sanitization + safe rendering

Show notes are treated as untrusted HTML. The player does **not** inject raw HTML via `innerHTML`.

Instead it calls `sanitizeAndAppendHtml(container, rawHtml)` which:

- Parses with `DOMParser("text/html")`
- Removes dangerous tags: `script`, `style`, `iframe`, `object`, `embed`, `link`, `meta`, `base`
- Strips event handler attributes (`on*`)
- Restricts output to a small allowed tag set:
  - `p`, `br`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `pre`, `blockquote`, `a`
- For `<a>` only:
  - keeps only safe `href` schemes (`http`, `https`, `mailto`)
  - forces `target="_blank"` and `rel="noopener noreferrer"`

Sanitizer implementation: [`src/utils/safe-html.ts`](../../src/utils/safe-html.ts).

## Styling / UX

The section is a native `<details>` element styled to look like a real toggle/dropdown:

- Clickable header bar (`summary`) with a chevron indicator
- Hover + focus-visible styling
- Compact metadata grid and a separated “Show notes” block

CSS: [`src/styles/podcast-player.css`](../../src/styles/podcast-player.css) under `/* Episode details (collapsible notes + metadata) */`.

## Tests

Unit tests validate:

- The section renders when notes exist
- `content` beats `description` when meaningfully different
- Sanitization removes scripts/events and blocks `javascript:` links while keeping safe links
- Metadata rows appear only when fields are present

Tests: [`test_files/unit/podcast-player-episode-details.test.ts`](../../test_files/unit/podcast-player-episode-details.test.ts).
