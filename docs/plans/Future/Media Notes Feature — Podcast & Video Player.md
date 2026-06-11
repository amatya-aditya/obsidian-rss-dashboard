# Media Notes Feature — Podcast & Video Player

WORK IN PROGRESS

The media notes feature introduces a new workflow for annotating podcasts and videos, functioning similarly to chapter markers in Adobe Premiere. Instead of keeping notes within a custom player UI, timestamps are inserted directly into the user's saved article note for the episode, seamlessly integrating with their Obsidian vault.

## User Review Required

> [!IMPORTANT]
> **No Built-in Textarea**: This plan removes the previously proposed "Episode notes" textarea from the player itself. The workflow now relies entirely on Obsidian's native editor by automatically opening the saved file.

> [!WARNING]
> **Focus Stealing**: As requested, once the marker is inserted, the cursor focuses right after the dash in the Obsidian editor. Because the user is now typing in Obsidian's core editor, there is no native keyboard shortcut to instantly return focus back to the podcast player view. This limitation will be documented in the user guide.

## Open Questions

> [!CAUTION]
> **Linked Timestamp Format**: What exactly should the "hyperlink" look like so it functions properly when clicked?
>
> - Option A: An Obsidian URI (e.g. `[10:00](obsidian://rss-dashboard?action=seek&time=600)`)
> - Option B: A custom markdown link that the plugin intercepts in reading mode/live preview? (e.g. `[10:00](#)`)
> - Option C: Something else?

> [!CAUTION]
> **YouTube Iframes**: The standard YouTube iframe doesn't easily expose `currentTime`. To support this for videos, we need to upgrade our video player to use the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference). Should we include this API upgrade in this feature's scope, or limit to podcasts only for now?

> [!CAUTION]
> **Shortcut Scope**: Should `Shift+m` be a global Obsidian hotkey that works anywhere (if a player is active), or just a local key listener that only works when the player panel is actively focused?

> [!CAUTION]
> **Note Section Header**: What should the new header be named where timestamps are inserted? (e.g., `## Media Notes`, `## Timestamps`, `## Notes`).

## Proposed Changes

### Core Workflow Service

#### [NEW] `src/services/media-marker-service.ts`

Service responsible for handling the "add marker" action.

- `async addMarker(item: FeedItem, currentTime: number, isVideo: boolean)`
- Checks if the vault file exists for `item`. If not, it calls `ArticleSaver` (or equivalent existing architecture) to save the episode and create the note.
- Opens the file in the active workspace leaf using Obsidian's workspace API (`app.workspace.getLeaf('tab').openFile(file)`).
- Finds the `## Media Notes` (or chosen header) section in the file content. If it doesn't exist, appends it.
- Appends the timestamp link `[10:00](...) - ` to the section.
- Uses `app.workspace.getActiveViewOfType(MarkdownView)` to get the editor instance.
- Sets the cursor position to the end of the newly inserted line using `editor.setCursor()`.
- Focuses the editor using `editor.focus()`.

---

### Players Updates

#### [MODIFY] `src/views/podcast-player.ts`

- Add an "Add Marker" icon button (e.g., Lucide `map-pin` or `bookmark`) to the player controls.
- Add keyboard event listener to the player container for `Shift+m`.
- On click or shortcut: call `mediaMarkerService.addMarker(currentItem, audioElement.currentTime, false)`.

#### [MODIFY] `src/views/video-player.ts`

- Upgrade iframe to use YouTube IFrame Player API (requires injecting `https://www.youtube.com/iframe_api` script) to get access to `player.getCurrentTime()`.
- Add "Add Marker" icon button to the player layout.
- Add keyboard event listener for `Shift+m`.
- On click or shortcut: call `mediaMarkerService.addMarker(currentItem, player.getCurrentTime(), true)`.

---

### Timestamp Click Handling

#### [NEW/MODIFY] Depends on chosen Timestamp Format

If we use a custom timestamp link approach, we'll need to register a markdown post-processor or an Obsidian protocol handler (`obsidian://rss-dashboard-seek?time=X`) that tells the active player to seek to the specified timestamp when the link is clicked.

---

### Documentation

#### [MODIFY] `README.md` & `docs/user-guide.md`

- Add a new section detailing "Media Notes & Chapter Markers".
- Document the `Shift+m` shortcut and the marker button.
- Add the caveat: "Note: Typing a note focuses the core Obsidian editor. To pause/play or resume controlling the podcast player via keyboard, you must click back into the player view."

## Verification Plan

### Automated Tests

- Test that `mediaMarkerService` correctly creates the file if missing.
- Test that `mediaMarkerService` appends the header and timestamp correctly.

### Manual Verification

1. Open a podcast and start playing.
2. Press `Shift+m`.
3. Verify the file is created (if new) or opened, the header is added, and the cursor is placed right after `[MM:SS] - `.
4. Type some notes.
5. Click the timestamp link in Reading Mode/Live Preview and ensure the player seeks to the correct time.
6. Verify the video player works identically with YouTube videos.
