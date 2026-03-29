# P2-3: Video Player Tests - Handoff (post P2-2)

## Status

P2-3 is complete (delivered on 2026-03-29).

- Added: `test_files/unit/views/video-player.test.ts`
- Verified: `npm run test:unit` is green (76 files / 569 tests)
- Verified (targeted coverage via `npm run test:unit -- --coverage`):
  - `src/views/video-player.ts` @ Lines 84.78% | Branches 61.76% | Functions 85.71%

Note: `npm run test:unit -- --coverage` still exits non-zero because global coverage thresholds in `vitest.config.mjs` (Lines 40% | Branches 30% | Functions 50%) are higher than current global coverage (Lines 34.79% | Branches 29.87% | Functions 28.62%). The per-file report is still generated.

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P2-3 targets the video playback UI in `src/views/video-player.ts`. This code controls iframe embed config, metadata rendering, and the “related videos” interaction loop.

## Task (P2-3)

Add unit tests for `src/views/video-player.ts`.

- Create: `test_files/unit/views/video-player.test.ts`
- Target: `src/views/video-player.ts`
- Target coverage: 70%+
- Risk: Medium/High (regressions break video feed UX and navigation)

## What to Test

### `VideoPlayer.loadVideo(item)`

- Missing `item.videoId`:
  - Emits a `Notice` ("No video ID provided")
  - Does not render player DOM
- Valid `item.videoId`:
  - Clears container and renders `.rss-video-player`
  - Creates an `<iframe>` with:
    - `src` from `MediaService.buildYouTubeEmbed(videoId).embedUrl`
    - `allow` + `referrerpolicy` attributes from embed config
    - `allowFullscreen === true`

### Header + metadata rendering

- Title is rendered via `Setting` and `.rss-video-title` is applied to the setting element.
- Channel and date render:
  - `.rss-video-channel` uses `item.feedTitle`
  - `.rss-video-date` uses `new Date(item.pubDate).toLocaleDateString()`

### Description sanitization (current behavior)

- When `item.description` exists:
  - `.rss-video-description` renders
  - Output string does not contain `<script` (scripts removed)
  - Any `<a>` in the serialized output includes `target="_blank"` and `rel="noopener noreferrer"`

Note: the implementation writes the cleaned HTML string to `textContent` (so it displays as text, not HTML). Tests should assert current behavior, not desired behavior.

### YouTube “Watch” button

- `.rss-video-youtube-button`:
  - `href` equals `embed.watchUrl`
  - `target="_blank"` and `rel="noopener noreferrer"`
  - Icon span `.rss-video-youtube-button-icon` has `dataset.icon === "youtube"`

### Related videos

- Initial render shows empty state (`.rss-video-related-empty`) because `findRelatedVideos()` currently returns `[]`.
- `setRelatedVideos(videos)`:
  - Filters to same `feedUrl`, excludes current item (`guid`), requires `videoId`, and caps at 5
  - Renders `.rss-video-related-item` rows with:
    - thumbnail `<img>` when `videoId` exists
    - title/date text nodes
  - Clicking a related item:
    - Calls `onVideoSelect(video)` when provided
    - Otherwise calls `loadVideo(video)`

### `destroy()`

- Clears the iframe (`src=""`) and removes it from the DOM without throwing.

## Testing Notes

- Use `installObsidianDomPolyfills()` (jsdom) to get `createDiv/createEl/empty`.
- To assert `Notice(...)` calls, spy on `console.log` (the Obsidian stub `Notice` logs `"[Stub Notice]"` + message).
- For determinism, you can `vi.spyOn(MediaService, "buildYouTubeEmbed")` and return a fixed embed config.
