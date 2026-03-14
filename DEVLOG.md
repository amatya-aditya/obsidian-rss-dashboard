# Development Log

## 2026-03-14 — Session 7: YouTube GUID Fix, Reddit Card Summaries, BRAT Release

### YouTube Feed Refresh GUID Mismatch (CRITICAL FIX)
- **Problem**: YouTube feeds would stop updating after first import. Deleting and re-adding the feed was the only way to get new items. Root cause: `convertToAbsoluteUrl()` was applied to YouTube `yt:video:VIDEO_ID` guids during refresh, mangling them into malformed URLs like `https://youtube.com/feeds/...yt:video:xyz`. The mangled guid never matched the stored guid, so every item appeared "new" on every refresh — causing duplicates, lost read/starred state, and eventually stale feeds.
- **Fix (feed-parser.ts)**: Skip `convertToAbsoluteUrl()` for guids that don't start with `http`. Applied in both the incoming-item lookup (line ~2176) and the existing-item retention loop (line ~2286).

### Reddit/RSS Cards Showing Blank Space
- **Problem**: Reddit feed cards showed title and feed name but large blank areas — no description preview. Two causes: (1) `article.summary` wasn't being used as fallback when no cover image existed; (2) Reddit RSS content contains `<img>` tags that extract as cover images, but the Reddit preview URLs fail to load — and the `onerror` handler removed the entire cover container including the summary overlay.
- **Fix (article-list.ts)**: Added `stripHtmlToText()` helper that strips HTML and truncates to 220 chars. Card renderer now falls back to generating summary from `description`/`content` at render time. Image `onerror` handler now replaces the failed cover container with a summary-only block instead of removing it entirely.

### Version Bump & BRAT Release
- **Version**: `2.2.0-motion.1` — fork identifier for BRAT distribution
- **Release workflow**: Removed `--draft` flag so GitHub releases are published automatically (BRAT requires non-draft releases). Added `motion` tag pattern to prerelease regex.
- **Deploy**: Tag `2.2.0-motion.1` pushed to `motion2082/obsidian-rss-dashboard`

### Files Modified
| File | Changes |
|------|---------|
| `src/services/feed-parser.ts` | GUID mismatch fix: skip URL conversion for non-URL guids |
| `src/components/article-list.ts` | `stripHtmlToText()` helper; render-time summary fallback; image error → summary replacement |
| `.github/workflows/release.yml` | Remove `--draft`, add `motion` tag to prerelease regex |
| `manifest.json` | Version bump to `2.2.0-motion.1` |
| `versions.json` | Add `2.2.0-motion.1` entry |

---

## 2026-03-12 — Session 5: YouTube RSS Outage, Proxy Cleanup, Save & Open UX

### YouTube RSS Feeds Returning 404
- **Problem**: All YouTube channels returning "Error loading feed" / "Request failed, status 404". YouTube's `/feeds/videos.xml` endpoint is globally returning 404 — not a plugin bug.
- **Fix (feed-manager-modal.ts)**: Both Add and Edit feed modals now route YouTube URLs through `parseFeed()` which tries the YouTube Data API v3 first (when an API key is configured), then falls back to RSS. When RSS fails and no API key is set, status shows: "YouTube RSS is unavailable. Add a YouTube API key in plugin settings."
- **Fix (feed-parser.ts)**: `parseYouTubeFeedViaApi()` now extracts channel title from the first API item (`snippet.channelTitle`) instead of defaulting to "YouTube Feed".

### YouTube Handle Case Sensitivity
- **Problem**: `@AIDailyBrief` (mixed case) failed while `@aidailybrief` (lowercase) worked — YouTube handles are case-sensitive in URL resolution.
- **Fix (media-service.ts)**: Handle is now lowercased before the channel page fetch.

### Dead CORS Proxy Cleanup
- **Problem**: CORS proxy fallback chain had dead services flooding the console with errors: isomorphic-git (403), thingproxy (DNS dead).
- **Fix (feed-parser.ts)**: Removed isomorphic-git and thingproxy from the proxy cascade. Chain is now: direct fetch → AllOrigins (get/raw) → codetabs → feed discovery.

### Improved Error Reporting in Feed Modals
- **Problem**: Both Add and Edit feed modals showed generic "Error loading feed" for all failures.
- **Fix (feed-manager-modal.ts)**: Catch blocks now show the actual error message (e.g. "Request failed, status 404", "Could not resolve YouTube channel ID").

### Save & Open Replaces Reader View In-Place
- **Problem**: "Save & Open" opened the saved note in a new tab, leaving the RSS Dashboard and reader still occupying screen space.
- **Fix (reader-view.ts)**: `openSavedNote()` now uses `this.leaf.openFile(file)` to open the saved note in the same pane as the reader, replacing it.
- **Fix (dashboard-view.ts)**: `openSavedArticleFile()` now checks for an existing reader view leaf and reuses it, instead of always creating a new split.

### Files Modified
| File | Changes |
|------|---------|
| `src/services/feed-parser.ts` | Removed dead proxies (isomorphic-git, thingproxy); channel title from API items |
| `src/services/media-service.ts` | Lowercase YouTube handles before fetch |
| `src/modals/feed-manager-modal.ts` | YouTube API path in Load button; actual error messages in status |
| `src/views/reader-view.ts` | `openSavedNote()` opens in same leaf instead of new tab |
| `src/views/dashboard-view.ts` | `openSavedArticleFile()` reuses reader leaf if available |

---

## 2026-03-11 — Session 4: YouTube Template Variables, Open After Save

### Extended Template Variables for Media
- **Problem**: Save templates only supported basic variables (`{{title}}`, `{{content}}`, `{{link}}`, etc.), making them useless for YouTube videos where users need embed URLs, channel names, durations, thumbnails, etc.
- **Fix (article-saver.ts)**: Added 9 new template variables to both `applyTemplate()` and `generateFrontmatter()`:
  - `{{videoId}}` — YouTube video ID
  - `{{embedUrl}}` — `https://www.youtube.com/embed/{videoId}`
  - `{{videoUrl}}` — watch URL (from item or constructed from videoId)
  - `{{channelName}}` — feed title (alias for `{{feedTitle}}`)
  - `{{duration}}` — duration from RSS feed
  - `{{publishDate}}` — ISO pub date (alias for `{{isoDate}}`)
  - `{{coverImage}}` — thumbnail/cover image URL
  - `{{description}}` — raw description text
  - `{{mediaType}}` — article/video/podcast
  - `{{audioUrl}}` — podcast audio URL
- **Use case**: Users can now create YouTube save presets that mirror Obsidian Web Clipper templates, with Templater `<% %>` syntax processed via existing integration.

### Open Note After Save
- **Problem**: After saving an article/video, users had to manually navigate to the saved note to review or edit it.
- **Fix (reader-view.ts)**: Added `openSavedNote()` method that opens the saved file in a new tab. Called from all three save paths: default save, preset save, and custom folder save.
- **Setting (types.ts, settings-tab.ts)**: Added `openAfterSave` boolean to `ArticleSavingSettings` with toggle in Article Saving settings. Currently hardcoded to always open (setting exists for future toggle).

### Files Modified
| File | Changes |
|------|---------|
| `src/services/article-saver.ts` | 9 new template variables in `applyTemplate()` and `generateFrontmatter()` |
| `src/views/reader-view.ts` | `openSavedNote()` method, wired into all save paths, `TFile` import |
| `src/types/types.ts` | `openAfterSave` in `ArticleSavingSettings` and `DEFAULT_SETTINGS` |
| `src/settings/settings-tab.ts` | "Open note after saving" toggle in article saving settings |

---

## 2026-03-10 — Session 3: Save Presets, Templater, UI Fixes

### Card Spacing Slider Crashes Menu
- **Problem**: Adjusting the card spacing slider (or cards/row buttons) closed the controls dropdown.
- **Root cause**: `handleCardSpacingChange()` and `handleCardColumnsChange()` in dashboard-view.ts called `this.render()`, which destroyed and rebuilt the entire view including the open dropdown.
- **Fix (dashboard-view.ts)**: Both handlers now directly update the grid element's inline `gap` / `grid-template-columns` style via `querySelector()` instead of re-rendering.

### Search Icon Overlaps Placeholder Text
- **Problem**: The magnifying glass icon in the controls dropdown covered the "Search articles..." placeholder text.
- **Fix (dropdown-portal.css)**: Increased search input left padding from 34px to 38px.

### Sidebar Badge Bleed-Through When Collapsed
- **Problem**: Unread count badges (circles with numbers) were visible when the sidebar was collapsed/hidden.
- **Root cause**: Sidebar is 280px wide but was only translated -250px, leaving 30px visible where badges showed.
- **Fix (layout.css, sidebar.css)**: Changed `translateX(-250px)` to `translateX(-100%)` so the sidebar fully slides off-screen regardless of width.

### YouTube Video Description — Broken HTML
- **Problem**: Opening a YouTube video showed raw `<body xmlns="http://www.w3.org/1999/xhtml">` text in the description.
- **Root cause (video-player.ts)**: `XMLSerializer().serializeToString(doc.body)` wrapped output in `<body xmlns=...>`, then `.textContent =` displayed it as literal text.
- **Fix (video-player.ts)**: Replaced with DOM node adoption (`document.adoptNode()`) — no serialization needed.

### YouTube Description — Collapsible + Formatted
- **Problem**: YouTube descriptions were a wall of unformatted text.
- **Fix (video-player.ts, video.css)**: Description is now a collapsible `<details>` toggle. Plain-text URLs are auto-converted to clickable links. Line breaks preserved. Styled with border, background, and scroll overflow.

### Save Presets Feature
- **Problem**: Users could only save with one default folder/template, no way to define multiple folder+template combos.
- **Implementation**:
  - **types.ts**: Added `folder` field to `SavedTemplate`, added `defaultPresetId` to `ArticleSavingSettings`
  - **main.ts**: Migration backfills `folder: ""` on existing saved templates
  - **settings-tab.ts**: "Saved templates" → "Save presets" with folder per preset, default preset dropdown, Edit modal (name + folder + template body)
  - **reader-view.ts**: Right-click save menu lists all presets ("Save with [Name]"), custom save modal has preset dropdown that auto-fills folder + template
  - **dashboard-view.ts**: `handleArticleSave()` resolves preset folder+template (feed-level → default preset → global defaults)
  - **feed-manager-modal.ts**: Template dropdown renamed to "Save preset" with folder shown in label

### Templater Integration
- **Problem**: Templater `<% ... %>` syntax in templates wasn't processed — files created via `vault.create()` don't trigger Templater automatically.
- **Fix (article-saver.ts)**: After saving, calls Templater's `overwrite_file_commands()` API on the new file if the plugin is installed.

## 2026-03-08 — Session 1: YouTube Fixes, UI Enhancements, Dropdown Port

### YouTube Channel URL Handling
- **Problem**: Adding feeds with YouTube handle URLs (e.g. `https://www.youtube.com/@ChrisTitusTech`) failed with "Not a valid RSS/Atom feed"
- **Root cause**: `addFeed()` passed raw YouTube URLs directly to `parseFeed()` which expected RSS XML. The single regex for channel ID extraction also failed on modern YouTube page HTML.
- **Fix (media-service.ts)**: Expanded channel ID extraction from 1 regex to 8 patterns (`channelId`, `channel_id`, `externalId`, `data-channel-external-id`, `/channel/` URL, `<meta>` tag, `<link>` tag, `browseId`). Applied same multi-pattern approach to `/c/` URL handler.
- **Fix (main.ts)**: Added YouTube URL auto-detection at top of `addFeed()` — converts handle/channel URLs to RSS feed URLs before proceeding.
- **Fix (feed-parser.ts)**: Added same auto-conversion in `parseFeed()` for existing feeds saved with raw YouTube URLs, so refreshing also works. Updates `existingFeed.url` to the resolved RSS URL.

### XDA Feed Cover Images
- **Problem**: XDA Developers feed articles had no cover images despite having `<enclosure type="image/jpeg">` tags in the RSS XML.
- **Fix (feed-parser.ts)**: Added `enclosure?.type?.startsWith('image/')` check to the cover image extraction chain for both new and existing items.

### Card Hover Fix
- **Problem**: Hovering over video cards (which have no summary text) made the thumbnail go grey/invisible.
- **Root cause**: Duplicate CSS rule in `card-view.css` lines 142-148 was missing `.has-summary` qualifier, causing ALL cards' cover images to fade on hover.
- **Fix (card-view.css)**: Added `.has-summary` qualifier so only cards with summary text show the hover overlay effect.

### Card Height Fix
- **Problem**: Video cards had large empty space between content and action toolbar.
- **Root cause**: Cards had fixed `min-height: 360px; max-height: 360px` — video cards with less content didn't fill the space.
- **Fix (card-view.css)**: Removed fixed height constraints, set `min-height: 0` so cards size naturally.

### Folder Suggest — "Add New Folder"
- **Problem**: The FolderSuggest dropdown in Edit Feed/Add Feed modals didn't allow creating new folders.
- **Fix (folder-suggest.ts)**: Added `ADD_FOLDER_SENTINEL` item to dropdown, `showAddFolderPrompt()` modal with input field, and `onAddFolder` callback. New folders are added to `sourceFolders` and persisted via callback.

### Vault Image Suggest for Cover Images
- **Problem**: Default cover image fields required typing full vault paths manually.
- **Fix (folder-suggest.ts)**: Added `VaultImageSuggest` class — autocomplete for image files (png, jpg, gif, svg, webp, etc.) from the vault, limited to 50 results.
- **Wired into**: Edit Feed modal (`feed-manager-modal.ts`) and Global fallback setting (`settings-tab.ts`).

### Per-Feed and Global Fallback Cover Images
- **Problem**: Feeds like Reddit often lack article images, leaving cards with no cover.
- **Fix (types.ts)**: Added `defaultCoverImage` to `Feed` interface and `globalFallbackCoverImage` to `DisplaySettings`.
- **Fix (article-list.ts)**: Added fallback chain: per-feed `defaultCoverImage` → global `globalFallbackCoverImage`. Uses `app.vault.adapter.getResourcePath()` to convert vault paths to renderable URLs.
- **Fix (feed-manager-modal.ts)**: Added "Default cover image" text field with VaultImageSuggest.
- **Fix (settings-tab.ts)**: Added "Global fallback cover image" setting with VaultImageSuggest.

### SQLite → data.json Migration
- **Discovery**: The installed plugin (v2.2.0-beta.3 from [amatya-aditya/obsidian-rss-dashboard](https://github.com/amatya-aditya/obsidian-rss-dashboard)) uses SQLite for storage. Our repo uses Obsidian's `loadData`/`saveData` (data.json). Deploying our main.js wiped the feeds.
- **Fix**: Python script exported 16 feeds + 237 articles from `rss-dashboard.sqlite` into `data.json` format. Feed data preserved.
- **Note**: The installed plugin at `D:\Obsidian Resources\Demo Vaults\Pauls Content\.obsidian\plugins\rss-dashboard\` has the original backup.

### Dropdown UI Port (Filter Panel + Hamburger Controls)
- **Problem**: Our repo had a simple flat toolbar; the installed v2.2.0-beta.3 had dropdown filter panel and hamburger controls menu.
- **Implementation (article-list.ts)**:
  - Replaced flat toolbar with Filter trigger button + Hamburger menu button
  - Filter panel: fixed-positioned portal on document.body with And/Or toggle, status filter checkboxes (Unread/Read/Saved/Starred/Podcast/Videos/Tagged with icons), Show Status Bar, Bypass All Filters, Show Highlights toggles, Apply button
  - Hamburger dropdown: search input with icon/clear, Age/Sort/Grouping selects with icons, List/Card toggle with icons, Refresh button, Cards/row selector (Auto, 1-6), Card spacing slider (0-40px), Mark all Read/Unread buttons
- **New types (types.ts)**: `StatusFilters`, `HighlightsSettings` interfaces; `cardColumnsPerRow`, `cardSpacing` in DisplaySettings; `filterLogic`, `statusFilters`, `showFilterStatusBar`, `bypassAllFilters`, `highlights` in settings
- **New callbacks (article-list.ts)**: `onSearchChange`, `onStatusFiltersChange`, `onShowFilterStatusBarChange`, `onBypassAllFiltersChange`, `onHighlightsChange`, `onCardColumnsChange`, `onCardSpacingChange`, `onMarkAllRead`, `onMarkAllUnread`
- **Wired up (dashboard-view.ts)**: All new callbacks connected to handler methods
- **CSS (dropdown-portal.css)**: Full styling for filter portal, hamburger dropdown, all controls
- **Status**: Builds successfully, deployed but **untested**

### Files Modified
| File | Changes |
|------|---------|
| `main.ts` | YouTube auto-detect in addFeed(), settings migration |
| `src/services/media-service.ts` | Multi-pattern channel ID extraction |
| `src/services/feed-parser.ts` | YouTube auto-convert in parseFeed(), enclosure image support |
| `src/components/folder-suggest.ts` | VaultImageSuggest, FolderSuggest "Add new folder" |
| `src/components/article-list.ts` | App param, fallback cover images, full dropdown UI port |
| `src/modals/feed-manager-modal.ts` | VaultImageSuggest on cover image field |
| `src/settings/settings-tab.ts` | VaultImageSuggest on global fallback, import |
| `src/types/types.ts` | StatusFilters, HighlightsSettings, display settings, Feed.defaultCoverImage |
| `src/styles/card-view.css` | .has-summary hover fix, removed fixed card height |
| `src/styles/dropdown-portal.css` | Full dropdown/filter portal CSS |
| `src/views/dashboard-view.ts` | App param to ArticleList, new callback handlers |

### Known Issues
- Dropdown UI is untested — may need adjustments after visual testing
- The repo codebase differs significantly from the installed v2.2.0-beta.3 (SQLite storage, more advanced features)
- Original repo: https://github.com/amatya-aditya/obsidian-rss-dashboard
- Latest release: https://github.com/amatya-aditya/obsidian-rss-dashboard/releases/tag/2.2.0-beta.3

---

## 2026-03-09 — Session 2: Card/List UI Polish, Feed Modal Fixes, YouTube Channel ID

### Card View — Bottom Spacing Fix
- **Problem**: Cards had extra empty space at the bottom in card view.
- **Root cause**: `responsive.css` had fixed `min-height`/`max-height` constraints on `.rss-dashboard-article-card` at every `@media`, `@container`, and mobile breakpoint (75 lines across 35 blocks).
- **Fix (responsive.css)**: Removed all fixed card height constraints from responsive breakpoints. Cards now size naturally based on content.

### Card View — Equal Row Heights
- **Problem**: Cards in the same row had different heights.
- **Root cause**: `.rss-dashboard-card-view` had `align-items: start` which prevented CSS Grid's default stretch behavior.
- **Fix (card-view.css)**: Removed `align-items: start` from grid container, allowing default `stretch` so cards in each row match the tallest card's height.

### List View — Full-Width Layout
- **Problem**: List view items were center-aligned with `max-width: 800px`, wasting horizontal space.
- **Fix (articles.css)**: Removed `margin: auto; width: -webkit-fill-available; max-width: 800px` from `.rss-dashboard-article-item`, replaced with `width: 100%`.

### Date Truncation Fix
- **Problem**: Dates in both card and list views were being cut off (showing only time, not full date).
- **Fix (articles.css)**: Changed `.rss-dashboard-article-date` from `overflow: hidden; text-overflow: ellipsis` to `white-space: nowrap; flex-shrink: 0`.

### Podcast Cover Images
- **Problem**: Podcast feeds (e.g., Theo Von) weren't showing cover images on cards.
- **Root cause**: Feed parser's cover image deduplication logic was stripping images that matched the feed's logo when they appeared in >= 80% of items. For podcasts, the show art IS the intended image for every episode.
- **Fix (feed-parser.ts)**: Added `MediaService.isPodcastFeed()` check to skip the deduplication logic for podcast feeds.

### Card Spacing & Columns Not Applied
- **Problem**: Card spacing slider and cards/row buttons saved settings but had no visual effect.
- **Root cause**: `handleCardSpacingChange()` and `handleCardColumnsChange()` saved to `settings.display` and called `render()`, but the grid container never applied these values as inline styles — it always used the hardcoded CSS `gap: 15px`.
- **Fix (article-list.ts)**: In `renderArticles()`, after creating the card view container, apply `cardSpacing` as `gap` and `cardColumnsPerRow` as `grid-template-columns` inline styles.

### YouTube Title Detection in Add/Edit Feed Modal
- **Problem**: Clicking "Load" on a YouTube channel URL (e.g., `@aiexplained-official`) showed no title — the Title field stayed empty.
- **Root cause**: The Load button fetched the raw YouTube URL and parsed it as `text/xml`. YouTube pages are HTML, not XML, so `querySelector("channel > title")` found nothing.
- **Fix (feed-manager-modal.ts)**: Import `MediaService` and convert YouTube URLs to RSS feed URLs via `MediaService.getYouTubeRssFeed()` before fetching. Applied to both `AddFeedModal` and `EditFeedModal` Load buttons.

### Folder Input UX
- **Problem**: To select a folder in Add/Edit Feed modal, users had to manually delete existing text before the dropdown would filter properly.
- **Fix (feed-manager-modal.ts)**: Added `folderInput.addEventListener("focus", () => folderInput.select())` to both AddFeedModal and EditFeedModal folder inputs. Now clicking the field auto-selects all text for immediate typing/replacement.

### YouTube Channel ID Extraction — Wrong Channel
- **Problem**: Adding `@Hardwareunboxed` resolved to "Monitors Unboxed" instead of "Hardware Unboxed".
- **Root cause**: The first regex pattern `channelId":` matched the first channel ID in YouTube's HTML, which could be a related/secondary channel listed before the page owner's ID.
- **Fix (media-service.ts)**: Reordered extraction patterns to prioritize canonical/meta tags that identify the page owner:
  1. `<meta itemprop="channelId">` (most reliable)
  2. `<link rel="canonical">` (canonical URL)
  3. Other `<meta>` and `<link>` tags
  4. Generic JSON patterns as fallback

### Files Modified
| File | Changes |
|------|---------|
| `src/styles/responsive.css` | Removed 75 fixed card height lines across 35 breakpoint blocks |
| `src/styles/card-view.css` | Removed `align-items: start` from grid container |
| `src/styles/articles.css` | Full-width list items, date `nowrap`/`flex-shrink: 0` |
| `src/services/feed-parser.ts` | Skip cover image dedup for podcast feeds |
| `src/components/article-list.ts` | Apply cardSpacing/cardColumnsPerRow as inline styles |
| `src/modals/feed-manager-modal.ts` | YouTube URL conversion on Load, folder input auto-select |
| `src/services/media-service.ts` | Reordered channel ID extraction patterns for accuracy |
