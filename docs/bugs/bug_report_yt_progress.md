# Bug Report: YouTube Watch Progress Fails to Save

**Status:** Known Issue / WONTFIX (Due to API and Audit limitations)
**First Reported:** 2026-07-01
**Plugin Version:** 2.4.0-beta.3

---

## Summary

YouTube watch progress is silently dropped and never saved. The root cause is a fundamental breakdown in the YouTube iframe `postMessage` protocol introduced when the YouTube IFrame SDK script injection was removed during the `v2.3.0-audit`. (Note: This issue is apparent on all storage modes, not just Shard Storage).

The postMessage communication layer is fundamentally blocked in Obsidian's Electron environment due to cross-origin policies with the `app://` protocol.

---

## Architecture Context

`VideoPlayer.ts` communicates with the embedded YouTube iframe using the raw `postMessage` API (without the YouTube IFrame SDK). The flow is:

1. `render()` creates an `<iframe>` with `enablejsapi=1` in the `src`
2. `initPlayer()` / `handlePlayerReady()` sends a "handshake" command to the iframe
3. YouTube responds with `onReady`, `onStateChange`, and `infoDelivery` events back via `postMessage`
4. `handleStateChange()` triggers the polling timer via `startTracking()`
5. `saveProgress()` calls `onPlaybackProgress()` every 5 seconds and on flush/destroy
6. `onPlaybackProgress` writes to `user-state.json` via `feed-storage-repository.ts`

---

## Root Cause Analysis

### postMessage Protocol Defects (❌ All attempted fixes unsuccessful)

#### P1 — Wrong `listening` Event Type (CURRENT PRIME SUSPECT)

**Discovered via web research on 2026-07-01.**

The YouTube iframe API uses two distinct top-level event formats:

| Message Type | Correct Format |
|---|---|
| Handshake (register listener) | `{ "event": "listening", "id": <playerId> }` |
| Player command (play, pause, seekTo) | `{ "event": "command", "func": "seekTo", "args": [...], "id": <playerId> }` |

Our `sendCommand()` helper wraps **all** messages — including the handshake — as `event: "command"` with `func: "listening"`. This is **wrong**. `listening` is not a command function; it is its own top-level event type. YouTube silently ignores the malformed handshake, never registers our window as a listener, and therefore never emits `infoDelivery` events back to us.

**Current broken code:**
```typescript
// sendCommand wraps everything as event: "command"
const message = JSON.stringify({
  event: "command",  // ← WRONG for listening handshake
  func: "listening", // ← this is not how YouTube expects it
  args: [],
  id: this.playerId,
});
```

**Correct format per YouTube postMessage protocol:**
```typescript
// Handshake must be sent as its own event type
const handshake = JSON.stringify({
  event: "listening",  // ← top-level event, not wrapped in "command"
  id: this.playerId,
});
```

#### P2 — postMessage Target Origin Fails in Electron (SECONDARY SUSPECT)

`sendCommand` currently targets the iframe's origin (`url.origin`) as the second argument to `postMessage`. In Obsidian's Electron renderer, the YouTube iframe runs as an Out-of-Process IFrame (OOPIF). Due to Chromium's process isolation security model, messages targeted at a specific cross-origin may be silently blocked. Using `"*"` as the target origin is the accepted workaround for Electron-hosted cross-origin iframes.

**Current code:**
```typescript
const url = new URL(this.iframeEl.src);
this.iframeEl.contentWindow.postMessage(message, url.origin); // ← may be blocked in OOPIF
```

**Fix:**
```typescript
this.iframeEl.contentWindow.postMessage(message, "*"); // ← wildcard bypasses OOPIF restriction
```

> **Security Note:** The wildcard target is safe here because we never send sensitive data to the YouTube iframe. We only send player control commands (seekTo, listening). All incoming data is still validated by origin check on the `message` event listener.

#### P3 — `origin=app://obsidian.md` Rejected by YouTube (❌ CURRENT PRIME SUSPECT)

The P3 fix added `app:` to the protocol allow list so `buildYouTubeEmbed` now sets `origin=app://obsidian.md` in the embed URL. However, **YouTube's servers reject non-HTTP/HTTPS origin values**. When the YouTube iframe boots it reads and validates the `origin` param — an `app://` scheme fails this check, causing YouTube to silently refuse to dispatch any `postMessage` events (including `onReady`) back to the parent.

**Proposed Fix:** Revert P3. Omit the `origin` param entirely for the `app:* protocol. YouTube defaults to permissive behaviour when no origin is given, and our `window.addEventListener("message", ...)` still receives events regardless.

```typescript
// Only set origin for valid http/https — app: is rejected by YouTube
if (
  typeof window !== "undefined" &&
  (window.location.protocol === "http:" ||
    window.location.protocol === "https:")
) {
  embedParams.set("origin", window.location.origin);
}
```

#### P4 — `onload` Dead-lock (❌ SECONDARY SUSPECT)

Sending `listening` inside `handlePlayerReady()` creates a chicken-and-egg problem:
- We wait for `onReady` before sending `listening`
- YouTube only sends `onReady` **after** receiving `listening`

The handshake must be sent on the iframe's native `onload` DOM event, not in response to `onReady`.

**Proposed Fix:** Attach a one-shot `onload` listener to `iframeEl` in `render()` that calls `sendListeningHandshake()` once the document has fully loaded. Keep `handlePlayerReady()` for `seekTo` resume logic only.

#### P5 — ID Type Mismatch (✅ Fixed — but discovered via research to be a red herring)

We tried replacing the string HTML `id` with a sequential integer `playerId` (to match YouTube's internal integer widget ID) and changing the URL param from `&id=` to `&widgetid=`. Research now confirms the `id` field in the listening handshake can be any value — it is simply echoed back. The prior string-based check `String(payload.id) !== this.iframeEl.id` failed because YouTube echoes back whatever value you provide; if you pass a string, it echoes the string. The fix was to align sending and receiving **Status:** Phase 5 Implemented — Pending Manual Verification

## Attempted Fixes Timeline

| Attempt | Change | Result |
|---------|--------|--------|
| 1 | Verify storage layer keys and validate durations | ❌ Bug persisted — postMessage communication still broken |
| 2 | Replace `payload.id` string check with `event.source === iframe.contentWindow` | ❌ Electron OOPIFs null out `event.source` for cross-origin iframes |
| 3 | Add `app:` origin to MediaService | ❌ `origin=app://obsidian.md` is rejected by YouTube servers, suppresses all outbound postMessage |
| 4 | Move `listening` to `handlePlayerReady()` | ❌ Deadlock — YouTube only sends `onReady` after receiving `listening` |
| 5 | Fix `listening` event format (`event:"listening"` not `event:"command"`) + wildcard `postMessage` target | ❌ Still no events received — app:// origin rejection blocks everything |
| 6 | Revert `app:` origin, add `onload`-based `listening` handshake | ❌ YouTube still blocked; `onload` fires but postMessage is still rejected |
| 7 | **Phase 5: Start wall-clock tracking on `onload`** | ❌ Failed — `onload` unreliable and saving state triggered infinite vault watcher re-render loop |
| 8 | **Phase 6: Watcher Suppression + `setTimeout` Fallback** | ❌ Failed — Workaround unreliable; DOM refresh loop persists due to underlying Electron and vault sync timing |
| 9 | **Phase 7: Mark as Known Issue** | 🛑 Concluded — Progress saving impossible without dynamic `<script>` injection, which is prohibited by plugin security audits |

---

## Phase 5: Wall-Clock Fallback (Currently Implemented)

### Root Cause Confirmed

Online research confirms: **YouTube's iframe API refuses to send `postMessage` events back to a parent window with an `app://` origin.** Chromium's OOPIF security model treats `app://` as an opaque/null origin, which YouTube's validation rejects. This makes all `onReady`, `onStateChange`, and `infoDelivery` events permanently unreachable in the current Obsidian/Electron version via a standard iframe.

### Strategy: `onload` as Playback Proxy

Since we cannot receive playback state via postMessage, we treat the **iframe's native DOM `onload` event** as a proxy for "the user started watching". When the iframe loads:
1. We send `listening` (still attempts postMessage — works in browser dev tools and may work in future Obsidian versions)
2. We immediately set `playStartTime = Date.now()` and call `startTracking()`
3. The 5-second interval fires `saveProgress()` using wall-clock elapsed time
4. On `destroy()`, `flushProgress()` saves the final position

If postMessage *does* work (future Electron versions, or browser dev tools), `onStateChange` events will correctly pause/resume the timer with `handleStateChange()`.

### Limitations

- Position is **approximate** (wall-clock, not exact video position)
- Does **not** detect pause/seek — the timer runs continuously from `onload`
- `duration` remains `0` (no `infoDelivery`)

### Current State of the Fix

### P1 Fix — Correct the `listening` Handshake Format

Add a dedicated `sendListeningHandshake()` method that sends `event: "listening"` directly, bypassing the `sendCommand()` wrapper. Call it from `handlePlayerReady()`.

```typescript
private sendListeningHandshake(): void {
  if (!this.iframeEl || !this.iframeEl.contentWindow) return;
  try {
    const message = JSON.stringify({
      event: "listening",
      id: this.playerId,
    });
    this.iframeEl.contentWindow.postMessage(message, "*");
  } catch {
    // Ignore errors
  }
}
```

Update `handlePlayerReady()`:
```typescript
private handlePlayerReady(): void {
  this.sendListeningHandshake(); // ← replaces this.sendCommand("listening")
  if (this.progressTrackingEnabled && this.currentItem?.playbackProgress?.position) {
    this.sendCommand("seekTo", [this.currentItem.playbackProgress.position, true]);
  }
}
```

### P2 Fix — Use `"*"` as postMessage Target Origin

Update `sendCommand()` to use `"*"` instead of `url.origin`:
```typescript
private sendCommand(func: string, args: unknown[] = []): void {
  if (!this.iframeEl || !this.iframeEl.contentWindow) return;
  try {
    const message = JSON.stringify({
      event: "command",
      func: func,
      args: args,
      id: this.playerId,
    });
    this.iframeEl.contentWindow.postMessage(message, "*"); // ← wildcard for Electron OOPIF
  } catch {
    // Ignore errors
  }
}
```

### Files to Change

| File | Change |
|------|--------|
| `src/views/video-player.ts` | Add `sendListeningHandshake()`, update `handlePlayerReady()`, change `postMessage` target to `"*"` |
| `test_files/unit/views/video-player.test.ts` | Update test to simulate `onReady` → verify `listening` event is sent with correct format |

---

## Current State of `src/views/video-player.ts`

Key sections as of Phase 2 implementation:

- `playerId`: Sequential integer assigned per instance via `static nextPlayerId`
- `widgetid` param is appended to the iframe `src` URL
- `listening` is sent via `sendCommand("listening")` → **this is the bug** (wrong format)
- `postMessage` target is `url.origin` → **may fail in Electron OOPIF**
- `messageHandler` filters by `payload.id !== this.playerId` → correct

---

## References

- [YouTube IFrame API postMessage protocol — Stack Overflow](https://stackoverflow.com/questions/7443578/youtube-iframe-api-how-do-i-control-a-youtube-iframe-player-that-is-already-in-the-html)
- [Electron OOPIF postMessage cross-origin — Chromium docs](https://www.chromium.org/developers/design-documents/oop-iframes/)
- [YouTube postMessage `event: listening` format — Stack Overflow](https://stackoverflow.com/questions/2026326/youtube-embeds-how-to-know-when-the-video-stops-playing)

---

## Phase 6: Watcher Suppression + `setTimeout` Fallback (Final Fix)

### Root Cause 2: The Infinite Refresh Loop
During Phase 5, we discovered that while we could approximate progress with wall-clock time, saving that progress caused the entire dashboard to reload.
When `saveProgress()` writes to `user-state.json`, Obsidian's vault file watcher detects the modification and triggers a workspace update. This forced the RSS dashboard to re-render, which re-initialized the `VideoPlayer`, resetting the video to the beginning every 5 seconds.

### The Final Fix (Implemented)

1. **Vault Watcher Suppression:**
   We modified `main.ts` to wrap `persistSettings()` in a `writeWithWatcherSuppressed()` utility. This temporarily pauses the file watcher when we save progress, preventing the dashboard from re-rendering while we write to `user-state.json`.

2. **`setTimeout` Fallback:**
   Because `onload` events for cross-origin iframes can be unreliable in Obsidian's Electron environment, we bypassed it entirely. In `initPlayer()`, we implemented a simple `setTimeout` of 3000ms. After 3 seconds, we assume the player is ready and start tracking wall-clock playback progress automatically.

3. **Disabled Outgoing `postMessage`:**
   Since Chromium OOPIF security entirely blocks cross-origin `postMessage` from `app://obsidian.md` to `https://www.youtube-nocookie.com`, we removed the broken handshake attempts entirely.

4. **Sanitized Logs:**
   To adhere to plugin linting standards, all `console.log` statements used during debugging were replaced with `console.debug`.

### Resolution (Phase 6 Failed)
The Phase 6 workaround was found to be unreliable. The DOM refresh loop persisted due to complex race conditions between `setTimeout` saves and Obsidian's vault-wide metadata reload events (even with watcher suppression active).

---

## Phase 7: Marked as Known Bug / WONTFIX

Following the failure of Phase 6 and continued console errors reporting `Failed to execute 'postMessage' on 'DOMWindow'`, we have marked this as a **Known Bug / WONTFIX**. 

### Rationale:
1. **Electron / Chrome Security Model:** The `app://obsidian.md` custom protocol origin fundamentally cannot receive or send valid `postMessage` cross-origin payloads with `https://www.youtube-nocookie.com` in current Chromium security models.
2. **Security Audit Limitations:** Previously, this was handled by dynamically injecting the official YouTube IFrame API `<script>`. However, as documented in `docs/development/2.3.0-audit/remove-dynamic-youTube-script-injection.md`, Obsidian's official plugin audit strictly forbids arbitrary remote `<script>` injection due to security concerns.
3. **No Viable Workarounds:** Without the script injection, the raw `postMessage` fallback was our last option. Since this fails due to origin mismatches in the Electron wrapper, there is no viable method for retrieving playback state.

This limitation has been explicitly documented in the `2.4.0` release notes.
