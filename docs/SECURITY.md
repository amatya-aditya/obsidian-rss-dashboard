# Security & Privacy Policy

## Overview

RSS Dashboard is an Obsidian plugin that requires access to certain sensitive Obsidian APIs and user system resources to provide core features. This document explains the security model, why these permissions are necessary, and how we protect user data.

**Current Status**: All features have been audited and permissions are justified by core functionality.

---

## Vault Access

### Vault Read (`vault.read`, `vault.cachedRead`)

**Purpose**: Reading individual vault files from the user's Obsidian vault.

**Used By**:

- **Save Article Feature**: Reads user's vault structure to determine save locations, validate folder permissions, and check for existing article files
- **Shard Storage Model**: Reads modular JSON configuration files that store per-feed metadata and settings

**Data Protection**:

- ✅ Vault read access is **read-only** — no modifications occur without explicit user action
- ✅ Only accesses files necessary for plugin operation (article destinations, configuration files)
- ✅ Users can configure which folders the plugin can access via plugin settings
- ✅ No data is transmitted outside the local vault

---

### Vault Write (`vault.modify`, `vault.create`)

**Purpose**: Creating and modifying files in the user's Obsidian vault.

**Used By**:

- **Save Article Feature**: Persists full articles to the vault in user-configured locations. Users can:
  - Choose where saved articles are stored (folder, filename patterns)
  - Control article metadata (date formatting, tags, properties)
  - Enable/disable the feature entirely
- **Shard Storage Model**: Saves modular JSON configuration files for each feed. This system:
  - Stores feed subscriptions, filter settings, and display preferences
  - Organizes data into individual per-feed files for better version control and conflict resolution
  - Only writes to plugin-managed configuration folders (not user content)
  - Replaces the previous monolithic `data.json` approach with a more granular storage model

**Data Protection**:

- ✅ Writes are limited to:
  - User-approved article save locations
  - Plugin configuration directories (`.obsidian/plugins/obsidian-rss-dashboard/`)
- ✅ Users retain full control over saved article content and metadata
- ✅ All data remains in the local vault; no cloud transmission
- ✅ Changes are tracked by Obsidian's file system and version control (git/sync integrations)

---

## Clipboard Access

**Purpose**: Reading and writing the system clipboard.

**Used By**:

- Exporting feed list (OPML format) to clipboard for sharing
- Importing feeds via clipboard paste
- Copying article URLs or content snippets for quick sharing

**Data Protection**:

- ✅ Clipboard access is **user-initiated** — the plugin only reads/writes when users explicitly click export/import buttons
- ✅ No automatic or background clipboard monitoring
- ✅ Users can clear clipboard contents after use via system controls
- ⚠️ Note: Clipboard contents may contain sensitive information if users copy from outside Obsidian

---

## External Domain Requests

**Current Count**: 184 unique external domains

**Why External Requests Are Needed**:
RSS feeds are hosted on external servers — the plugin must fetch feed content to provide the core RSS reading functionality.

### Feed Sources Include:

- Major news outlets (BBC, Reuters, NPR, etc.)
- Technology blogs and publications
- Newsletter platforms (Substack, Medium, etc.)
- YouTube feeds
- Academic publishing sites
- Personal blogs and niche RSS publishers

### Data Sent to External Domains:

- Feed subscription URLs (required to fetch content)
- Minimal HTTP metadata (User-Agent header, standard HTTP headers)
- **No user credentials** are transmitted
- **No vault content** is sent to external servers

### Request Logging:

- ✅ All feed requests go through standard HTTP/HTTPS protocols
- ✅ RSS Dashboard respects the RSS feed protocol specifications
- ✅ Feed requests can be monitored in browser network tabs when using Developer Tools

### User Control:

- Users choose which feeds to subscribe to
- Users can block/unsubscribe from any feed at any time
- Users can configure request timeouts and retry limits in plugin settings
- Feeds can be tested before adding to verify content is appropriate

---

## Network Security

**HTTPS Support**: ✅ All feed requests support HTTPS encryption

- Feeds are fetched over secure connections when available
- Feed URLs are validated before making requests

**Feed Validation**:

- Feeds are parsed according to RSS/Atom specifications
- Invalid or malformed feeds are handled gracefully
- Large feeds are truncated to prevent memory issues

**No Telemetry**: ✅

- RSS Dashboard does **not** collect usage data
- No analytics or tracking of user activity
- No plugin behavior is reported to external services

---

## Media Playback Progress Tracking

### What This Feature Does (Plain English)

When you watch a YouTube video or listen to a podcast in the RSS Dashboard, the plugin remembers where you stopped. When you come back and play the same video or episode again, it automatically resumes from where you left off instead of starting from the beginning.

This is exactly like how YouTube remembers your watch position on YouTube.com — it's a convenience feature so you don't lose your place.

### How It Works (In Plain Terms)

1. **When you play a video or podcast**, the plugin periodically records your current playback position (timestamp) and the total duration
2. **When you pause or stop**, the plugin saves this position to your vault's local storage
3. **When you reopen the same item**, the plugin checks if saved progress exists and jumps to that position
4. **Everything stays on your device** — no data is sent to YouTube, podcast servers, or any external service

### What Data Is Saved

Only this minimal information per video/podcast:

- **Position**: How many seconds in (e.g., "5:30 into a 60-minute podcast")
- **Duration**: Total length of the media
- **Last Updated**: When this progress was last saved

**What is NOT saved:**

- Video/episode titles
- Subscription information
- Listening habits or patterns
- Any personally identifiable information

### Storage Location

**Desktop Obsidian:**

- Progress is stored in your vault's plugin data folder: `.obsidian/plugins/obsidian-rss-dashboard/data.json`
- If you use vault shards storage, each feed's progress is in its own shard file

**Mobile Obsidian:**

- Progress is stored in the app's local storage for immediate access
- On next sync/open on desktop, it migrates to vault storage permanently

### Privacy & Compliance

✅ **No external transmission** — progress data never leaves your vault or device

✅ **Not user tracking** — the plugin doesn't track your behavior, viewing habits, or usage patterns

✅ **User-controlled** — you can clear progress manually or disable the feature entirely

✅ **No third-party access** — external services (YouTube, podcast hosts) cannot see your playback progress through this plugin

✅ **Synced like other vault data** — if you use Obsidian Sync/iCloud/other sync services, progress syncs with the same encryption/security as your other vault data

### For Obsidian Compliance

This feature does **not** constitute "user behavior tracking" or "analytics" as defined by Obsidian's policies because:

- No usage statistics or aggregated behavior data is collected
- Data is not analyzed for patterns or insights
- No data leaves the user's device/vault
- It is not reported to any external service
- It is purely functional state necessary for the media player's operation

---

## Media Progress Tracking (Technical Details)

### Architecture

**Video Player (YouTube)**

- Uses YouTube IFrame API (`onReady` event) to initialize tracking
- Polls playback state every 5 seconds via `getCurrentTime()` and `getDuration()`
- Throttles persistence to prevent excessive saves (2-second debounce)
- On pause/ended/destroy, flushes progress with `flush=true` flag

**Podcast Player (HTML5 Audio)**

- Tracks `play` and `pause` events on `<audio>` element
- Polls current playback position every 1 second during playback
- Persists to plugin's `data.json` via Obsidian's `saveData()` API
- Legacy `localStorage` migration: on startup, `rss-podcast-progress` localStorage entries are migrated to vault shards

### Data Structure

```typescript
interface PlaybackProgress {
  position: number;          // Current time in seconds
  duration: number;          // Total duration in seconds
  lastUpdated: number;       // Unix timestamp of last update
}

// Attached to each FeedItem
feedItem.playbackProgress?: PlaybackProgress;
```

### Storage Flow

1. **Update triggered** → `VideoPlayer.saveProgress()` / `PodcastPlayer.saveProgress()`
2. **Calls callback** → `onPlaybackProgress(item, position, duration, flush)`
3. **Plugin receives** → `updatePlaybackProgress()` in main plugin class
4. **Updates item** → Sets `item.playbackProgress = { position, duration, lastUpdated }`
5. **Debounced save** → If `flush=false`, schedules save with 2-second debounce. If `flush=true`, saves immediately
6. **Persistence** → `saveSettings()` → `saveData()` → vault adapter writes to appropriate storage location

### Migration (Startup)

On plugin load, `migrateMediaProgressOnStartup()` checks for legacy `localStorage` entries:

- Reads `window.localStorage.getItem('rss-podcast-progress')`
- Matches entries by item GUID
- Copies to `playbackProgress` on matching items
- Persists via `saveSettings()`
- Clears legacy storage

### Debouncing Strategy

- **During playback**: Saves scheduled every 5-second interval (video) or 1-second interval (audio), but debounced to max one save every 2 seconds
- **On pause/ended**: Immediate flush with `flush=true` to ensure last position is saved
- **On destroy**: Final flush to persist remaining progress before cleanup

This prevents thrashing the vault adapter during long playback sessions while ensuring data is reasonably fresh.

### Testing Coverage

- `test_files/unit/views/video-player.test.ts` — polling starts on `onReady`, progresses are emitted
- `test_files/unit/views/podcast-player.test.ts` — play/pause tracking, flush on pause
- Integration with settings persistence verified across test suite

**Future Roadmap Note**

- Analytics feature is planned for future versions as an optional, opt-in feature
- If implemented, it would track high-level insights (reading time, articles read) with explicit user consent and would be clearly disclosed as separate from playback progress
- Current version (v2.x) has no analytics capability whatsoever

---

## Build & Distribution

**Build Verification**: Status: Not yet available

- Future: GitHub artifact attestation will be added to release artifacts
- Allows verification that release builds match source code in this repository

**Obfuscation**: Status: Not used

- Source code is available in this public repository
- Compiled plugin code is not obfuscated — developers can inspect the build

**Dependency Security**: ✅

- Dependencies are regularly updated
- See `package.json` for complete dependency list
- Vulnerable dependencies scans are planned

---

## Malware & Vulnerability Scans

**Current Status**: Scans not yet available from Obsidian security infrastructure

**Code Safety**:

- ✅ All code is open-source and publicly available at: https://github.com/joethei/obsidian-rss-dashboard
- ✅ Code reviews are conducted before merging changes
- ✅ TypeScript provides type safety and compile-time error detection
- ✅ ESLint rules enforce security best practices

**Responsible Disclosure**:

- If you discover a security vulnerability, please report it responsibly
- See `CONTRIBUTING.MD` for security reporting guidelines

---

## Data Retention

**Plugin Data**:

- All plugin data (feeds, settings, shard storage files) is stored locally in your vault
- Data is **only** synchronized if you use Obsidian Sync or another vault sync service
- RSS Dashboard does not independently back up or transmit data

**Article Cache**:

- Articles fetched from RSS feeds are cached locally during the session
- Cache is cleared when the plugin reloads or Obsidian restarts
- Saved articles remain in your vault according to your save settings

---

## Permissions Summary Table

| Permission             | Feature                               | Risk Level | User Control             |
| ---------------------- | ------------------------------------- | ---------- | ------------------------ |
| Vault Read             | Save article, shard storage           | Low        | Configured in settings   |
| Vault Write            | Save article, shard storage, progress | Medium     | Configured in settings   |
| Clipboard Access       | Import/export feeds                   | Low        | User-initiated only      |
| Network Requests       | Fetch RSS feeds                       | Medium     | Feed subscription choice |
| External Domains (184) | RSS feed sources                      | Medium     | Feed selection           |
| Media Progress         | Video/podcast playback positions      | Low        | Local storage only       |

---

## Recommendations for Users

### Best Practices:

1. **Review your feed subscriptions regularly** — unsubscribe from feeds you no longer read
2. **Use article save filters** — configure which articles are automatically saved to your vault
3. **Enable vault sync carefully** — consider the privacy implications of syncing articles to cloud services
4. **Monitor clipboard contents** — remember that clipboard data may persist outside Obsidian
5. **Keep Obsidian updated** — security updates from Obsidian core are important for your security

### Privacy Considerations:

- RSS feeds are fetched from external servers — feed publishers can see your IP address
- If you use Obsidian Sync or iCloud, your articles/feeds may be transmitted to cloud services
- Saved articles containing sensitive information should be encrypted or kept offline

---

## Future Improvements

- [ ] GitHub artifact attestation for release verification
- [ ] Automated vulnerability scanning in CI/CD pipeline
- [ ] Malware scanning integration
- [ ] Detailed request logging option (opt-in)
- [ ] Feed-level security warnings for untrusted sources

---

## Questions or Concerns?

If you have questions about this security policy or concerns about data privacy, please:

1. Open an issue on GitHub: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues
2. Review the source code: https://github.com/amatya-aditya/obsidian-rss-dashboard
3. Consult the `CONTRIBUTING.MD` file for security reporting
4. View our latest scorecard compliance on our Community page: https://community.obsidian.md/plugins/rss-dashboard

---

**Last Updated**: May 13, 2026  
**Document Version**: 1.0  
**Plugin**: RSS Dashboard for Obsidian
