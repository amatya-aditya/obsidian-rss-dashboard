# Episode Notes Feature — Podcast Player

Add an "Episode notes" collapsible section (mirroring the existing "Episode details" `<details>` pattern) that provides a rich, Obsidian-native note-taking experience while listening to podcasts. Notes are persisted via `app.saveLocalStorage` and injected into the saved Obsidian note when the user saves the episode.

## Design Decisions & Recommendations

### Storage: Require save to vault for persistence

> [!IMPORTANT]
> **Taking notes requires saving the episode first.** When the user opens the "Episode notes" section and begins typing, a soft notice will prompt them to save the episode to persist their notes beyond the session. Short-term (within a session), notes are buffered in `app.saveLocalStorage('rss-podcast-notes')` keyed by `guid`, so they survive tab switches and episode changes within the same Obsidian session. However, on plugin reload / Obsidian restart, only notes for episodes that have been saved to the vault are guaranteed. This avoids injecting user data into `data.json` (your explicit requirement) while still giving a smooth UX.

### Obsidian-synergy "premium" recommendations

1. **⏱ Timestamp insertion button** — A `clock` icon button in the notes toolbar inserts a `[HH:MM:SS]` timestamp (linked to the current playhead position) at the cursor. Clicking the timestamp in the saved note visually indicates "resume from here" context.
2. **Markdown formatting** — The `<textarea>` supports plain-text Markdown. When the episode is saved, the notes appear as a dedicated `## My Notes` section in the saved [.md](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/.agents/workflows/code-change.md) file, ready for Obsidian's renderer.
3. **`{{episodeNotes}}` template variable** — Users who customise their save template can place `{{episodeNotes}}` wherever they want. If they don't use it, notes are appended after `{{content}}`.
4. **Auto-save debounce** — Notes auto-save to localStorage 500ms after the user stops typing, so nothing is lost if they switch episodes.
5. **Visual indicator** — Episodes with notes get a subtle `pencil` badge in the playlist row, helping users find episodes they've annotated.

---

## Proposed Changes

### Types

#### [MODIFY] [types.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts)

- Add optional `userNotes?: string` field to [FeedItem](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/types/types.ts#1-57) interface (line 46 area).

---

### Podcast Player

#### [MODIFY] [podcast-player.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts)

**New private state:**
- `private notesData: Map<string, string>` — in-memory notes keyed by guid.
- `private notesTextarea: HTMLTextAreaElement | null` — reference to the active textarea.
- `private notesSaveTimeout: number | null` — debounce timer for auto-save to localStorage.

**New method: `renderEpisodeNotesSection()`**
- Creates a `<details class="podcast-episode-notes-user">` block below [renderEpisodeDetailsUnderProgress()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#693-770).
- Header: "Episode notes" with `<summary>`.
- Body: toolbar row with a timestamp-insert button (`clock` icon), then a `<textarea>` bound to `notesData.get(guid)`.
- [oninput](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#453-463) debounces writes to `notesData` Map and calls `saveNotesData()`.
- Also sets `this.currentItem.userNotes` so the reader-view save path picks it up.

**New methods:**
- `saveNotesData()` — serialises `notesData` Map → `app.saveLocalStorage('rss-podcast-notes')`.
- `loadNotesData()` — deserialises on construction (mirrors [loadProgressData()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#1265-1280)).
- `insertTimestamp()` — reads `this.audioElement.currentTime`, formats `[HH:MM:SS]`, inserts at cursor position in `notesTextarea`.

**Modified methods:**
- [render()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#165-658) — call `this.renderEpisodeNotesSection()` after `this.renderEpisodeDetailsUnderProgress()` (line 565 area).
- [loadEpisode()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#70-128) — sync current notes from textarea into `notesData` before switching, then restore notes for the new episode.
- [destroy()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#1290-1302) — call `saveNotesData()`.
- Constructor — call `this.loadNotesData()`.

**New public method:**
- `getEpisodeNotes(): string | undefined` — returns `this.notesData.get(this.currentItem?.guid)` so the reader view can access notes at save time.

---

### Article Saver — Template Integration

#### [MODIFY] [article-saver.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/article-saver.ts)

- In [applyTemplate()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/article-saver.ts#153-189): add `{{episodeNotes}}` replacement. If the template doesn't contain `{{episodeNotes}}` but the item has `userNotes`, append a `\n\n## My Notes\n\n` section after content.
- In [generateFrontmatter()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/services/article-saver.ts#89-137): no changes needed (notes go in the body, not frontmatter).

---

### Reader View — Save Integration

#### [MODIFY] [reader-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts)

- In [showSaveOptions()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts#301-338) and [showCustomSaveModal()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts#339-428): before calling `articleSaver.saveArticle()`, read episode notes from `this.podcastPlayer?.getEpisodeNotes()` and set `item.userNotes`.

---

### Styles

#### [MODIFY] [podcast-player.css](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/styles/podcast-player.css)

- Add styles for `.podcast-episode-notes-user` (reuses `podcast-episode-details` pattern).
- Style the notes toolbar (`.podcast-notes-toolbar`) with the timestamp button.
- Style the `<textarea>` (`.podcast-notes-textarea`) — monospace font, auto-grow, Obsidian-native look.
- Responsive adjustments in existing breakpoints.

---

### Playlist Badge (Optional Enhancement)

#### [MODIFY] [podcast-player.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts)

- In the playlist render loop ([render()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#165-658) and [replacePlaylistSection()](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/podcast-player.ts#825-919)), if `this.notesData.has(ep.guid)`, add a small `pencil` icon badge to the playlist row.

---

## Verification Plan

### Automated Tests

**Command:** `npm run test:unit`

#### [NEW] [podcast-player-episode-notes.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/podcast-player-episode-notes.test.ts)

Tests modeled after the existing [podcast-player-episode-details.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/podcast-player-episode-details.test.ts):

1. **Renders the "Episode notes" collapsible section** — load an episode, verify `.podcast-episode-notes-user` exists with a `<summary>`.
2. **Textarea starts empty for a new episode** — verify textarea value is `""`.
3. **Timestamp insertion** — set `audioElement.currentTime = 125`, invoke the timestamp button click, verify textarea contains `[2:05]`.
4. **Notes persist across episode switches** — type in notes, switch to another episode, switch back, verify notes are restored.
5. **`getEpisodeNotes()` returns the current notes** — type notes, call `getEpisodeNotes()`, verify return value.

#### Existing tests (regression)

Run all existing podcast-player tests to ensure no regressions:
- [podcast-player-episode-details.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/podcast-player-episode-details.test.ts)
- [podcast-player-autoplay-icon.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/podcast-player-autoplay-icon.test.ts)
- [podcast-player-live-tags.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/podcast-player-live-tags.test.ts)
- [podcast-player-sort-playback.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/podcast-player-sort-playback.test.ts)

### Build Verification

**Command:** `npm run build`

Ensure zero TypeScript compilation errors and zero linting errors.

### Manual Verification

1. Open an episode in the podcast player → verify "Episode notes" collapsible appears below "Episode details".
2. Type some notes → switch episodes → switch back → verify notes are preserved.
3. Click the timestamp button → verify `[MM:SS]` is inserted at cursor.
4. Save the episode → open the saved [.md](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/.agents/workflows/code-change.md) file → verify notes appear under `## My Notes`.
5. Restart Obsidian → open the same episode → verify notes are still loaded from localStorage.
