## Unreleased

- **"Add All" Button added to Discover page**
  - Added a new "Add All" button to the Discover page header. This button adds all feeds from the current page to the user's feed list.

- **Sort feeds by unread count**
  - Added a new option to the 'Sort' icon which organizes feeds by unread count. 
  - Two options: High to Low / Low to High


### Fixes

- Fixed a bug where the Obsidian tab title was not properly updating when switching between feeds.

- Multi-feed refreshes now run through a bounded worker pool of 4 with a 15s per-feed timeout, keep runtime-only refresh state per URL, merge refreshed feeds back into settings during the run, and finish with one save plus a final dashboard refresh. Single-feed refresh stays on the lightweight direct path. (Old behavior: all feeds were being refreshed individually with no indication of progress or completion)

### Improvements

- Optimized the feed refresh process to reduce unnecessary network requests.

## [2.2.0-beta.10] - April 2, 2026

### New Features

- **Sidebar Toolbar Divider**:
  - Decoupled the vertical divider from the discover icon - now a standalone, configurable element.
  - Added "Divider" to the icon visibility settings in Display tab.
  - The divider can now be enabled/disabled and reordered among other icons via drag-and-drop.
  - Default position is between Discover and Add Feed icons.

- **Smart Auto-Refresh on Vault Open**:
  - Feeds now automatically refresh when opening the vault if the configured refresh interval has elapsed since the last refresh.
  - **Before:** The refresh timer reset to zero each time Obsidian closed. Users had to manually refresh or wait for the interval to pass after reopening the vault.
  - **After:** The plugin now tracks the last refresh timestamp in settings. On vault open, it checks if enough time has passed and refreshes immediately if needed.
  - Manual refreshes (sidebar icon, right-click menu, header button) also update the timestamp.
  - Respects all existing refresh interval settings (5 min to 24 hours).

- **Auto Refresh: Off Option added**
  - Added a new "Off" option to the refresh interval dropdown in General > Global Feeds > Refresh Interval. Resolves GH Issue #92

- **Mark Page Read button added**
  - Appears at the bottom of the article list
  - Marks only the articles from the current page as read, but leaves remaining articles in the feed untouched.

### Fixes

- Android bug causing list and card views to regress after every open
- New feeds now reliably preserve the current global max item default when added, instead of inheriting a lower retained-item limit if parser output omits the per-feed override.

- Chevron clicks in sidebar now only toggle collapse - GH[#91](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/91)

- Auto-deleted items no longer reappearing as unread upon refresh (PR#87 submitted by emiraga)

- Fixed fresh-install startup auto-refresh from showing a “Refreshing 0 feeds” toast or failing before the feed parser initializes.

### Development

- **Testing Baseline for 2.2.0**:
  - Established the first durable repo-wide automated test baseline for the plugin.
  - The pre-testing reference point was `2.1.9`, which effectively shipped without a meaningful unit test suite beyond minimal Vitest scaffolding.
  - The repo now has **110 passing test files** and **820 passing tests**.
  - Global coverage baseline is now **51.72% statements**, **41.04% branches**, **46.12% functions**, and **52.73% lines**.
  - Added broad unit and integration-style coverage across core services, views, components, settings flows, modals, and plugin lifecycle behavior.
  - Added and expanded shared test infrastructure including Obsidian API stubs, JSDOM polyfills, and purpose-built harnesses for complex UI/service surfaces.
  - Coverage thresholds are now actively enforced in `vitest.config.mjs` at **lines 40 / branches 33 / functions 34** to prevent regression.
  - Added contributor-facing testing documentation and archived the phase-by-phase handoff artifacts used during the coverage push.

---

## [2.2.0-beta.9] - March 27, 2026

### New Features

- **Sidebar Horizontal Scrolling**:
  - Added support for horizontal scrolling in the sidebar header toolbar via the mouse scrollwheel.
  - Added click-and-drag horizontal scrolling for desktop and mobile touch devices.
  - Added "grabbing" cursor feedback and touch-drag optimization to prevent accidental icon clicks while scrolling.

- **XML support**: Import OPML window now allows XML filenames in addition to OPML filenames.

- **Feed View**:
  - Added a new "Feed" view mode for a social-media-style, single-column layout.
  - Features hero images, clamped text summaries, and integrated action toolbars.
  - Added a 3-button view toggle (List, Card, Feed) to the hamburger menu using the accessible `clickable-icon` pattern.
  - Added "Feed" view as a preference in General settings.
  - Improved Feed View image quality by prioritizing high-resolution images and implementing a "hero blur" background layout to handle varying aspect ratios gracefully.
  - Refactored the hamburger menu view toggle from individual buttons into a single consolidated dropdown menu with dynamic icons and enhanced theme compatibility for both dark and light modes.

- **Auto-backup**: Added auto-backup for data.json, OPML, and userdata on plugin unload. By default, OPML and userdata are backed up to the plugin's data directory. These can be changed in the import/export settings.

### Fixes

- **Pagination**: Fixed a bug where the Dashboard would bypass pagination limits and display all articles when toggling view filters or switching to the "Unread" sidebar view.

- **Scroll Restoration**: Fixed a bug where the Dashboard would reset to the top when opening the Reader panel or resizing the window; implemented a focus-locking mechanism to keep the selected article in view.

- **Auto-delete bug**: Fixed a bug where imported feeds were not respecting the global default auto-delete duration.

### Development

- **Refactor article-list.ts**: Refactored article-list.ts monolith - extracted the filter menu and hamburger menu into separate components.

## [2.2.0-beta.8] - March 24, 2026

- **IMPORTANT**: Earlier limited releases intended for users experiencing specific issues were tagged as 2.3.0-alpha.1, 2.3.0-alpha.2, and 2.3.0-alpha.3. These were incorrectly versioned. They have been retroactively designated as 2.2.0-beta.5, 2.2.0-beta.6, and 2.2.0-beta.7 in our internal documentation. The original GitHub release tags have been left intact to avoid breaking any shared links. Development continues from 2.2.0-beta.8 forward.

### New Features

- **Customizable sidebar ordering (drag-and-drop)**:
  - Drag feeds to reorder within a folder (or move + insert between feeds).
  - Drag folders to reorder, and drag onto another folder to nest/un-nest (supports hierarchical organization).
  - Any manual reorder automatically switches the sidebar sort mode to a new **Custom** row to preserve your ordering.

- **Customizable sidebar toolbar icons**:
  - New setting: `Settings > Display > Icon visibility`.
  - Drag-and-drop or up/down buttons (mobile friendly).
  - Hide/show individual icons.
  - Hide/show entire toolbar.
  - New sidebar toolbar "settings" button (opens RSS-Dashboard settings).

- **Sidebar Tag Filtering**:
  - Revamped **Tags** section in the sidebar for easy management and improved filtering logic: **AND** (match all), **OR** (match any), and **NOT** (match none).
  - Inline **Add Tag** row with color picker integrated directly into the sidebar.

- **Podcast Player Sleep Timer**: Added a sleep timer to the podcast player to automatically stop playback after a specified duration (5, 10, 15, 30, 45, 60, 90, or 120 minutes) (GitHub issue #75).

- **Podcast "Open in Browser" improvements**:
  - Fixed the toolbar button, which was previously non-functioning.
  - The button now attempts to resolve the podcast’s website URL from feed metadata, falling back to the podcast’s RSS feed URL if no website URL is found.
  - The dropdown now includes URLs found in the "Episode details" section of the podcast page, plus a link to the direct audio file.

- **Pocket Casts Support**: Added support for importing podcasts directly from Pocket Casts URLs (e.g., `https://pocketcasts.com/podcast/...`).

- **Robust Podcast Resolution**:
  - Implemented a multi-proxy fallback system (AllOrigins, CodeTabs) to handle network timeouts and CORS restrictions when resolving podcast feeds.
  - Added a "Semantic Discovery" fallback using the **iTunes Search API** to resolve feeds when Pocket Casts hides the RSS link from their web player source.
  - Added flexible metadata scraping to handle varied HTML attribute ordering in modern web layouts.

- **Proactive Proxy Validation**: The Add Feed and Edit Feed modals now check whether the CORS proxy is enabled before attempting to resolve Pocket Casts URLs, providing a clear warning and guidance if it’s disabled.

- **OPML Import Menu Overhaul**: The OPML import menu has been completely overhauled to improve reliability and user experience.

- **View Filter Setting Improvements**:
  - All applied view filters now persist across navigation (state is saved and restored on reopen/restart).
  - All applied view filters now explicitly state which ones are currently applied in the dashboard header.
  - Updated `Settings > Display > Startup filters` to mirror the dashboard filter UI, allowing multiple viewing filters to be applied at startup.

### Fixed

- **Reader tags menu**: Reader toolbar now uses the same tag management portal UI as dashboard cards (edit/delete/add tags, mobile sheet support).

- **Reader save button**: The save button icon in the reader now appropriately turns purple when saved and changes its tooltip to "Click to open saved article". Clicking it in this state will directly open the saved markdown file in your vault, mirroring the dashboard functionality. Also updated the "custom folder location" option to suggest folders based on your vault structure, with proper text validation that adheres to Obsidian’s folder naming conventions.

- **Reader Nitter rendering**: Improved X/Twitter (Nitter) feed items in Reader view with a compact author/handle/date title, a single formatted tweet body (no "Feed description" callout), and a compact stats icon row when present. Article titles no longer show the entire tweet and instead show the author, handle, and date.

- **Obsidian Properties UI compatibility**: Fixed a critical issue where enabling the plugin could cause vault-wide Properties "type mismatch" error indicators due to unscoped global CSS overrides.

- **Settings migration (Filters → Rules)**: The global `filters` setting has been renamed to `rules` to avoid confusion with viewing filters. The new implementation is backwards compatible with existing beta users’ settings via a one-time migration.

- **Article dedupe bug** Fixed duplicate articles for feeds (e.g. BBC) where item GUIDs can change between refreshes via numeric URL fragments (`#0`, `#1`, ...); existing stored duplicates are auto-deduped on load.

- **Pagination**: Fixed pagination controls not updating when switching between views. Added new 'All' option to page size dropdowns. Adjusting the pagination at the bottom of the page now sychronizes with the pagination controls in settings (General > Results shown per page).

### Development

- **Developer Documentation**: Added a new "Advanced Podcast Platform Resolution" section to the developer docs describing proxy rotation and semantic search patterns.

- **CSS Guardrail**: Added `npm run check:css-scope` (runs during `npm run build`) to prevent unscoped CSS rules from targeting Obsidian core selectors (e.g., `.clickable-icon`, `.suggestion-container`, `.hidden`).

- **Settings Architecture Refactor**:
  - Refactored the monolithic settings tab into a modular architecture for maintainability and performance.
  - Split settings rendering into 9 dedicated tab renderer modules.
  - Centralized shared settings modal classes.
  - Isolated pure tab-name helpers to enable zero-dependency unit testing.
  - Used TDD-driven logic for color normalization, icon reordering, and preset detection.
  - Added many new unit tests covering settings-related logic.
  - Reduced the main settings tab orchestrator to ~119 lines.

- **Feed manager refactor**:
  - Reorganized the feed manager modal code to be more modular and maintainable (kept backwards compatibility for now; planned for deprecation in the next major release).
  - UI: standardized “supported formats” badges using Lucide icons.
  - Folder handling: improved folder-path collection and removed duplicate folder traversal across folder pickers and the sidebar.
  - Fix: corrected nested folder deletion behavior.
  - Tests: expanded unit coverage across feed manager behavior, sidebar “Add Feed” opening, folder-path utilities, preview loading, and nested folder removal.

- **ReaderView Refactor**: Extracted the reader format settings portal into a helper, added ReaderView cleanup on close, and added unit coverage.

## [2.3.0-alpha.3 / 2.2.0-beta.7] - March 18, 2026

### New Features

- **Sidebar Feed Filtering** (github issue #74): Added a new setting "Hide empty feeds/no unread articles" to automatically hide feeds with zero articles or only read articles from the sidebar.

- **Standardized Icon Rendering**:
  - Refactored all interactive icons to use the Obsidian-recommended `clickable-icon` pattern.
  - Replaced standard HTML `<button>` elements with accessible `div` structures for better cross-platform (Android) compatibility.
  - Added full keyboard support (Enter/Space) to all interactive icons.
  - Centralized icon sizing via the `--icon-size` CSS variable.
- **Reader Settings Refactor**:
  - Touch sliders not ideal for mobile devices due to base Obsidian touch behavior, replaced with dropdowns to ensure consistent behavior across platforms.
    - Replaced "Words per row" slider with a percentage-based "Paragraph width" dropdown (25%, 50%, 75%, 100%).
    - Replaced "Font size" slider with a discrete dropdown (80% to 200%).
    - Replaced "Line height" slider with a discrete dropdown (100% to 200%).
  - Added 2px horizontal padding for 100% paragraph width to improve readability.

### Fixed

- **YouTube Feed Discovery** (github issue #77): Fixed an issue where adding certain YouTube channels would return the wrong RSS feed by prioritizing metadata tags (`rel="canonical"` and `itemprop="channelId"`) over generic page content.
- **Android/iOS Rendering**: Fixed multiple instances where icons failed to render or appeared broken on mobile devices.
- **iOS Feed Content**:
  - Fixed an issue where Substack and Psychology Today articles appeared empty on iPhone by implementing robust XML namespace extraction using `getElementsByTagNameNS` instead of `querySelector`.
  - Fixed full article content fetching (via Readability) failing on iOS for sites with strict WAFs (like Psychology Today) by introducing a tiered fetch mechanism with a configurable CORS Proxy fallback. You can now enable and configure a CORS proxy in the settings (see reference `docs/bugs/ios-full-article-fetch-failure.md`).
- **Reader Rendering** (discord issue): Improved article display logic to ensure content is always rendered as the primary body, even if it matches the feed description.
- **ESLint/Build Integrity**:
  - Cleaned up multiple ESLint & TypeScript compilation errors in `ReaderView`.
  - Implemented strictly-typed Obsidian app and plugin interfaces for safer API access.
  - Standardized `HighlightService` and `robustFetch` usage to match modern patterns.
- **Feed and Folder Validation** (github issue #67):
  - Added strict validation for forbidden characters (`[ ] # ^ | / \ : * " < > ?`) and leading dots in feed titles and folder names.
  - Integrated validation into Add Feed, Edit Feed, and Folder Rename modals to prevent data corruption and filesystem issues.
  - Improved `sanitizeName` logic to provide better defaults during automated imports (e.g., OPML).

### Development

- **Testing**: Added unit tests for namespaced XML extraction and reader logic in `test_files/unit/ios-namespace-fix.test.ts`.
- **Build Logging**: Added explicit confirmation messages to `esbuild.config.mjs` to verify successful JS and CSS bundling.
- **Removed**
  - **YouTube Short Detection**: removed feature introduced in 2.3.0-alpha.1 due to inconsistent tagging. Added a comprehensive bug report in `docs/bugs/youtube-shorts-tagging-failure.md` for future reference.

---

## [2.3.0-alpha.2 / 2.2.0-beta.6] - March 16, 2026

### New Features

- **Podcast Player Improvements**:
  - **UI** - Refreshed in-app podcast player layout and controls.
  - **Episode Details**: Added a collapsible "Episode details" section under the seek bar showing episode metadata and sanitized show notes (from parsed feed content).
  - **Podcast Tags**: Show episode tags in the player and in playlist rows (with overflow handling).
- **Export Settings**: Added copy-to-clipboard actions for Settings exports (data.json, usersettings.json, OPML)
- **Global Feed Settings**: Added a global feed settings in General tab to set default values for new feeds

### Fixed

- Fixed some feeds losing older history (often collapsing to ~25 items) after refresh; refresh now preserves previously cached items outside the server “latest N” window and applies per-feed retention deterministically.
- Per-feed options now always show when adding a new feed (collapsed by default, follows default global feed settings)
- Podcast player now keeps play/pause button state in sync during autoplay
- Sorting/shuffling the podcast playlist no longer interrupts playback
- Switching episodes via the playlist no longer auto-plays unexpectedly
- Article title in reader now hidden on mobile view
- Reader settings sheet now notch-safe on iPhone, with improved touch layout, slider sizing, and a bottom “Done” CTA
- Card/List view: Article titles no longer reserve an empty second line for short titles; titles now clamp to 2 lines with truncation.

---

## [2.3.0-alpha.1 / 2.2.0-beta.5] - March 13, 2026

### New Features

- Added automatic YouTube Shorts detection and tagging from feed XML
- Added a media setting to enable or disable YouTube Shorts detection
- **Tag Management**: Recreated and enhanced tag editing functionality across Sidebar, Article List, and Reader View, allowing direct modification of tag names and colors.
- **X/Twitter to Nitter**: Added automatic redirection of X/Twitter feeds to Nitter RSS feeds.
- New reader settings menu for adjusting font and paragraph settings

### Improvements

- **Tagging UX**: Expanded clickable area for tags in dropdowns; clicking the label text now toggles the tag checkbox.
- **Feed Validation**:
  - Allow adding valid feeds that currently have no items.
  - Display a warning for valid but empty feeds in Add and Edit feed modals.
  - Prevent Add Feed modal from closing if background validation fails.

### Development

- Added CONTIRUBTING.MD to root directory for contribution guidelines

### Improved

- Standardized YouTube embed generation through a shared media-service helper
- Routed embedded playback through Privacy Enhanced Mode using `youtube-nocookie.com`
- Added a visible `Watch on YouTube` handoff from the in-app player
- Documented YouTube embed behavior and legal links in the README

### Fixed

- Fixed YouTube embed Error 153 by setting iframe `referrerpolicy="strict-origin-when-cross-origin"`
- Removed unsupported YouTube quality override URL rewriting from the player
- Enforced a minimum 200x200 YouTube player surface to better match RMF requirements
- Added regression tests for YouTube embed URL generation and feed video-id normalization
- Fixed Substack inline reader images not loading by stripping broken `srcset` / `<picture><source>` entries and falling back to a hero cover image when inline images fail
- Removed Substack image expand/view controls that rendered as blank bordered buttons in the reader

---

## [2.2.0-beta.4] - March 8, 2026

### Changed

- Reverted persistence from SQLite back to JSON for release stability
- Added scoped sidebar search while keeping folder feeds visible in search results

---

## [2.2.0-beta.3] - March 7, 2026

### Fixed

- Inlined the WASM binary into the bundle for BRAT compatibility
- Preserved sidebar search state across reloads
- Improved Kagi feed description rendering in the reader and sidebar

---

## [2.2.0-beta.2] - March 6, 2026

### Changed

- Migrated plugin data persistence from JSON files to SQLite
- Marked `2.2.x` beta tags as prereleases in CI

---

## [2.2.0-beta.1] - March 5, 2026

> Large feature release built on top of 2.1.9, focused on content filtering, word highlighting, Discover workflow improvements, mobile/tablet UX, and feed management quality-of-life updates.

---

### New Features

#### Keyword & Phrase Filtering

- Global and per-feed filter rule sets, configurable via the Add & Edit Feed modals
- Include/exclude rules with exact or partial matching
- Selectable rule targets: title, summary, or content
- Rule logic: AND or OR per rule set
- Per-feed "Override global rules" support
- Dashboard-level "Bypass Keyword Rules" toggle
- Clear-search button and filter status area with optional match statistics

#### Word Highlighting

- Highlight custom words or phrases in article titles, summaries, and reader content
- Per-word custom colors and a configurable default highlight color for new entries
- Per-word whole-word matching (exact or partial)
- Case sensitivity option per highlight word
- Location control: titles in list/card view, summaries in card view, content in reader view
- Quick "Show Highlights" toggle in the Filters menu

#### Dashboard & Navigation Controls

- Cards-per-row selector in the hamburger menu and Display settings
- Custom card spacing slider in the hamburger menu and Display settings
- Mark All Unread button added alongside Mark All Read in the hamburger menu
- Article search on the dashboard page
- Resizable left and right sidebars

#### Sidebar Customization

- Configurable row spacing and indentation via settings
- Adjustable left and right sidebar padding
- Option to show or hide the sidebar scrollbar
- Customizable unread badges for All Feeds, Folder rows, and Feed rows with per-badge visibility toggles and custom colors

#### Discover & Feed Management

- Kagi Smallweb integration (50 most recently updated independent feeds, refreshed every 5 hours)
- Feed filtering in Discover: All / Followed / Unfollowed
- Folder picker popup for Discover and Smallweb follow actions
- Follow-status indicators and streamlined follow actions throughout Discover
- Apple Podcasts URL support
- Smarter auto-folder assignment for podcasts, RSS feeds, and YouTube/video feeds
- Modern OPML import modal with validation, preview, and update/overwrite modes
- Option to delete a folder or delete all feeds from the OPML import flow

#### Settings

- New **Highlights** settings tab
- New **Rules** settings tab
- Updated **Display** settings tab with new sidebar row controls and list/card toolbar options

---

### Improvements

- Consolidated RSS, Podcast, and YouTube add-feed workflows into a more streamlined unified flow
- Redesigned Add/Edit Feed modal with clearer actions, better icon and button alignment, and improved mobile usability
- Simplified Discover controls removed redundant menus, tightened button and filter layout, improved category tree hierarchy and sorting
- Sidebar button and navigation layout reworked for cleaner behavior across desktop, tablet, and mobile
- Improved list and card readability: stabilized row heights, prevented title squishing, normalized feed label truncation
- Dashboard spacing changes no longer force disruptive re-renders
- Light-mode color toggles remain readable after theme changes
- Unified action toolbar in Reader view with configurable mobile toolbar mode options
- Improved responsive drawer and modal spacing for more consistent behavior with Obsidian on mobile
- Cleaner settings layouts for badge and status controls with better mobile/tablet organization

---

### Bug Fixes

- Fixed feed filter edits not refreshing dashboard content immediately
- Fixed intermittent filter menu closures caused by stale outside-click listeners
- Fixed unread/read state updates so articles are correctly removed and reinserted when filters are active
- Fixed scroll-jump issues position is now preserved when filtering articles or changing follow state in Discover
- Fixed multiple mobile/tablet sidebar issues including missing hamburger/toolbar icons and incorrect header inset behavior on iOS and Android
- Fixed an iOS rendering issue where the article scroll layer could cover the filter status bar
- Fixed OPML workflows: resolved iOS export failures and duplication, and ensured imported feeds refresh correctly in the sidebar
- Fixed mobile tag management issues including keyboard overlap, missing delete actions, and incorrect settings redirects
- Fixed Discover category indentation, badge alignment, and sorting consistency
- Fixed resizable sidebar handle lifecycle and render timing regressions
- Fixed sidebar and Discover edge cases: broken resize-handle behavior, stale folder cache after import, and filter visibility mismatches
- Fixed mobile/tablet issues across manage-feeds modal access, hamburger visibility, and close-button alignment
- Fixed multiple build, lint, and type issues affecting release stability

---

## [2.1.9] - 2026-02-01

- Upstream base release from the original author.
