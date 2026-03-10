# Development Log

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
