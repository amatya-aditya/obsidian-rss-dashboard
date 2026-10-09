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
  - Only writes to plugin-managed configuration folders, which include the storage folder and metadata location you choose in **Settings → RSS Dashboard → Storage** (not user content)
  - Replaces the previous monolithic `data.json` approach with a more granular storage model

**Data Protection**:

- ✅ Writes are limited to:
  - User-approved article save locations
  - Plugin configuration directories (`.obsidian/plugins/rss-dashboard/`), including the image cache
  - The **Feed storage folder** and the **Metadata data.json location** you choose in **Settings → RSS Dashboard → Storage** (by default a `.rss-dashboard-data` folder in the vault)
  - A `keyboard-shortcuts.md` note, only when you choose **Save to vault note** in the shortcut help
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
- Copying selected Reader content with rendered formulas represented as their retained LaTeX source
- Copying the build details shown in Settings → About (version, commit, build time) for bug reports

**Data Protection**:

- ✅ Clipboard access is **user-initiated** — the plugin only reads/writes when users explicitly use export/import controls or Copy selected Reader content
- ✅ No automatic or background clipboard monitoring
- ✅ Reader Copy preserves selected article content and substitutes rendered formulas with their retained source; it does not monitor or modify the clipboard in the background
- ✅ Users can clear clipboard contents after use via system controls
- ⚠️ Note: Clipboard contents may contain sensitive information if users copy from outside Obsidian

---

## External Domain Requests

**Why External Requests Are Needed**:
RSS feeds are hosted on external servers — the plugin must fetch feed content to provide the core RSS reading functionality. Feed servers are chosen by you, so their number depends on your subscriptions. Besides those, the plugin contacts a small, fixed set of third-party services, listed under **Other network requests** below.

### Feed Sources Include:

- Major news outlets (BBC, Reuters, NPR, etc.)
- Technology blogs and publications
- Newsletter platforms (Substack, Medium, etc.)
- YouTube feeds
- Academic publishing sites
- Personal blogs and niche RSS publishers

### Data Sent to External Domains:

- Feed subscription URLs (required to fetch content). If a direct fetch fails and the CORS proxy is on, the feed URL is also sent to the proxy services listed below
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
- Feed requests have no configurable timeout or retry limit. The **Fetch timeout** in **Article saving** settings (default 10 seconds) limits full-article fetches only, including each proxy attempt.
- The CORS proxy fallback can be turned off in **Settings → RSS Dashboard → General → Proxy**, and Google favicon requests for RSS feeds stop when **Use site icons/favicons for RSS feeds** is off in the Sidebar tab
- Feeds can be tested before adding to verify content is appropriate

### Other network requests

Beyond the feeds you subscribe to, RSS Dashboard makes these requests. None of them sends vault content or credentials.

- **CORS proxy fallback (on by default, set to `auto`).** When a direct fetch fails, the plugin retries through a third-party proxy, so the feed or article URL is sent to that proxy. `auto` tries AllOrigins, CodeTabs, isomorphic-git, ThingProxy and RSS2JSON in turn (`src/utils/proxy-utils.ts`). Turn it off in **Settings → RSS Dashboard → General → Proxy**, or pick a single proxy
- **RSS2JSON preview fallback.** When a feed preview cannot be fetched directly, the Add feed dialog sends the feed URL to `api.rss2json.com`. This fallback ignores the CORS proxy toggle (`src/services/feed-parser/feed-preview.ts`)
- **Google favicons.** Site icons for feeds are requested from `www.google.com/s2/favicons` with the feed's domain name (`src/utils/favicon-utils.ts`). They are used for RSS feeds when **Use site icons/favicons for RSS feeds** is on (**Settings → RSS Dashboard → Sidebar**), and for Mastodon feeds that have no profile image
- **iTunes Search and Lookup.** Podcast links are resolved through `itunes.apple.com`, sending the podcast name or ID (`src/services/feed-parser/podcast-platform-resolver.ts`, `src/services/apple-podcasts-service.ts`)
- **Kagi Smallweb.** The Smallweb view loads its list from `kagi.com`, and looks for a blog's feed with HEAD and GET requests to that blog (`src/views/kagi-smallweb-view.ts`)
- **Mastodon profiles.** Adding a Mastodon profile fetches the profile page from its server to find the feed (`src/services/mastodon-service.ts`)
- **YouTube.** Video thumbnails come from `img.youtube.com`. Adding a channel by handle or custom name fetches the channel page from `www.youtube.com` using a desktop browser User-Agent to read the channel ID. Playback uses the `www.youtube-nocookie.com` iframe (`src/services/media-service.ts`)
- **Publisher-hosted images and audio.** Article images, podcast audio and artwork are loaded from the publisher's servers. Preview images are cached under the plugin folder (`src/services/preview-image-cache.ts`)
- **What's New images.** The What's New popup loads its images from `raw.githubusercontent.com` (see **Release Images** below)

---

## Network Security

**HTTPS Support**: ✅ All feed requests support HTTPS encryption

- Feeds are fetched over secure connections when available
- Feed URLs are validated before making requests

**Feed Validation**:

- Feeds are parsed according to RSS/Atom specifications
- Invalid or malformed feeds are handled gracefully: the feed shows an error message instead of loading

**Release Images**: ✅ HTTPS only

- The What's New popup loads its note's images from GitHub (`raw.githubusercontent.com`) over HTTPS when the popup opens
- The note text itself is bundled with the plugin and needs no network access
- An image that fails to load is hidden; the note text is unaffected

**No Telemetry**: ✅

- RSS Dashboard does **not** collect usage data
- No analytics or tracking of user activity
- No plugin behavior is reported to external services

---

## YouTube Embeds and Terms

RSS Dashboard resolves YouTube feed items to a canonical `videoId`, renders the embedded player through Privacy Enhanced Mode (`https://www.youtube-nocookie.com/embed/...`), and provides a standard **Watch on YouTube** link that opens the original video in your browser or native YouTube app.

The plugin does not add YouTube download features, background audio-only playback, or ad-blocking behavior around the embedded player.

YouTube embeds and API usage are subject to:

- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)

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

- Progress is stored in your vault's plugin data folder: `.obsidian/plugins/rss-dashboard/data.json`
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

**Build Verification**: ✅ GitHub artifact attestations

- Every release built by the release workflow attests `main.js`, `styles.css`, and `manifest.json` with signed build provenance, which ties each file to the commit and workflow run that built it
- Each release also publishes a software bill of materials, `rss-dashboard.spdx.json` (SPDX), listing the third-party packages bundled into `main.js`, attested against the same files
- To verify a downloaded release file with the [GitHub CLI](https://cli.github.com/):

  ```bash
  gh attestation verify main.js --repo amatya-aditya/obsidian-rss-dashboard
  gh attestation verify main.js --repo amatya-aditya/obsidian-rss-dashboard --predicate-type https://spdx.dev/Document/v2.3
  ```

  The first command checks build provenance, the second the SBOM attestation. Releases published before the SBOM was added carry provenance only.

**Obfuscation**: Status: Not used

- Source code is available in this public repository
- Compiled plugin code is not obfuscated — developers can inspect the build

**Dependency Security**: ✅

- Dependencies are regularly updated; Dependabot opens weekly version-update pull requests
- Pull requests and releases fail on high or critical `npm audit` findings (`.github/workflows/test.yml` and `.github/workflows/release.yml`)
- See `package.json` for complete dependency list

---

## Malware & Vulnerability Scans

**Current Status**: Scans not yet available from Obsidian security infrastructure

**Code Safety**:

- ✅ All code is open-source and publicly available
- ✅ Code reviews are conducted before merging changes
- ✅ TypeScript provides type safety and compile-time error detection
- ✅ ESLint runs the `eslint-plugin-obsidianmd` rules (Obsidian plugin guidelines) with TypeScript-aware checks; it is a code-quality check, not a security scanner

**Responsible Disclosure**:

- If you discover a security vulnerability, please report it privately: open the repository's **Security** tab and choose **Report a vulnerability**
- Please don't open a public issue for a vulnerability. If private reporting isn't available, ask a maintainer for a private contact on [Discord](https://discord.gg/9bu7V9BBbs)

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

| Permission       | Feature                               | Risk Level | User Control             |
| ---------------- | ------------------------------------- | ---------- | ------------------------ |
| Vault Read       | Save article, shard storage           | Low        | Configured in settings   |
| Vault Write      | Save article, shard storage, progress | Medium     | Configured in settings   |
| Clipboard Access | Import/export feeds                   | Low        | User-initiated only      |
| Network Requests | Fetch RSS feeds                       | Medium     | Feed subscription choice |
| External Domains | RSS feed sources, listed services     | Medium     | Feed selection, settings |
| Media Progress   | Video/podcast playback positions      | Low        | Local storage only       |

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

- [x] GitHub artifact attestation for release verification
- [x] Automated dependency vulnerability scanning in CI/CD (`npm audit` gates)
- [x] Attested software bill of materials (SBOM) for releases
- [ ] Malware scanning integration
- [ ] Detailed request logging option (opt-in)
- [ ] Feed-level security warnings for untrusted sources

---

## Questions or Concerns?

If you have questions about this security policy or concerns about data privacy, please:

1. Open an issue on GitHub: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues
2. Review the source code: https://github.com/amatya-aditya/obsidian-rss-dashboard
3. Consult the `CONTRIBUTING.md` file for security reporting
4. View our latest scorecard compliance on our Community page: https://community.obsidian.md/plugins/rss-dashboard

---

**Last Updated**: October 8, 2026  
**Document Version**: 1.0  
**Plugin**: RSS Dashboard for Obsidian
