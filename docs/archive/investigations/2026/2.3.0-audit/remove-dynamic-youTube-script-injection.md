# Remove Dynamic YouTube Script Injection — Implementation Plan

## Background

The v2.3.0 audit flagged one instance of dynamic `<script>` injection:

**`src/views/video-player.ts` — `loadYouTubeApi()` method (line 74–93)**

```ts
// Current code — this is the violation
const tag = document.createElement("script");
tag.id = "youtube-iframe-api";
tag.src = "https://www.youtube.com/iframe_api";
```

This loads the YouTube IFrame JavaScript SDK at runtime, which dynamically injects and executes an external script. CI/CD lint rule `no-restricted-syntax` now blocks this.

---

## Critical Finding in the Previous Plan

> [!CAUTION]
> The previous plan proposed replacing `YT.Player` with raw `postMessage`. This has a fundamental limitation that was overlooked:
>
> **The YouTube iframe does NOT proactively push `currentTime` or `getDuration` data via `postMessage`.**
>
> Sending commands (play, pause, seek) via `postMessage` works fine. But reading `currentTime` and `getDuration` — which the playback progress tracker polls every 5 seconds — **requires the `YT.Player` SDK to call `getCurrentTime()` and `getDuration()`**. The iframe does not push these values unless the SDK is present.
>
> So a pure `postMessage` replacement cannot maintain the existing `setInterval`-based progress tracking behaviour without significant changes.

---

## Proposed Fix: Remove `loadYouTubeApi()`, send initial seek command via `postMessage`, and add a `message` event listener for state change events only

The YouTube IFrame with `enablejsapi=1` (already set in `buildYouTubeEmbed`) does allow some postMessage-based commands **and** does emit **state change events** (`onStateChange`) back to the parent window when play/pause/end happen.

However, **`currentTime` and `getDuration` are not sent by the iframe proactively** — they are only available via SDK polling.

**What still works via postMessage:**

- `seekTo` command (for restoring saved position)
- `onStateChange` events (to detect play/pause/end for flush-on-pause behaviour)

**What no longer works without the SDK:**

- Polling `currentTime` and `getDuration` for interval-based progress saving (every 5 seconds)

**Proposed approach:**

1. Remove `loadYouTubeApi()` and all `window.YT` SDK references.
2. Add a `window.addEventListener('message', ...)` handler that listens for `onStateChange` events from the iframe (origin: `https://www.youtube.com` or `https://www.youtube-nocookie.com`).
3. Replace SDK-based seeking on load with a `postMessage` seek command sent after a short delay for the iframe to initialise.
4. **Replace interval-based `currentTime` polling with event-driven state tracking only** — progress is flushed on pause/end (state 2 / 0), and we track position via a local timer that counts elapsed wall-clock time from when the play state is detected, as a best-effort estimate.

> [!IMPORTANT]
> This is the minimum-loss option: it preserves seek-on-load and flush-on-pause, but degrades the granularity of progress tracking from exact `currentTime` to estimated elapsed time. This is a deliberate, documented trade-off to achieve compliance.

---

## Open Question for Review

> [!IMPORTANT]
> **Which option do you prefer?**
>
> - **Option A**: Remove all progress tracking. Simple, clean, fully compliant. Loses resume-from-position feature.
> - **Option B**: Replace SDK with postMessage + wall-clock estimation. Maintains seek-on-load and flush-on-pause. Progress accuracy degrades slightly. More complex.
>
> There is no Option C (full feature parity without the SDK) without loading an external script, which is what we are trying to eliminate.

---

## Proposed Changes (Option B)

### [MODIFY] [video-player.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/video-player.ts)

- Delete `loadYouTubeApi()` method entirely.
- Remove `YTPlayer`, `YTPlayerEvent`, `YTPlayerOptions`, `YTNamespace` interfaces and `window.YT` global declaration.
- Add `private messageHandler` bound listener and `private playStartTime: number | null = null`.
- Add `private setupMessageListener()` which listens for iframe `message` events and dispatches on `onStateChange` (info: 1=playing, 2=paused, 0=ended).
- Replace `initPlayer()` with a `postMessage`-based `sendCommand(func, args)` helper.
- On `onStateChange=1` (playing): record `playStartTime = Date.now()`.
- On `onStateChange=2|0` (paused/ended): compute `elapsed = (Date.now() - playStartTime) / 1000` and call `onPlaybackProgress` with estimated position.
- After render, send a `seekTo` command via postMessage if `item.playbackProgress?.position` exists.
- In `destroy()`, remove the message event listener.

### [MODIFY] [video-player.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/views/video-player.test.ts)

- Remove all `window.YT = { Player: MockYouTubePlayer }` mock setup.
- Replace the two progress-tracking tests with tests that dispatch `MessageEvent` objects simulating YouTube `onStateChange` events.
- Retain the `flushes playback progress before destroy` test, adapted for the new state-event approach.

---

## Verification Plan

```powershell
npm run lint
npm run test:unit
```
