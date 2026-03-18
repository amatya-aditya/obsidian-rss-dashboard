## [2.3.0-alpha.3] - March 17, 2026

### New Features

- **Sidebar Feed Filtering**: Added a new setting "Hide empty feeds/no unread articles" to automatically hide feeds with zero articles or only read articles from the sidebar.

- **Standardized Icon Rendering**:
  - Refactored all interactive icons to use the Obsidian-recommended `clickable-icon` pattern.
  - Replaced standard HTML `<button>` elements with accessible `div` structures for better cross-platform (Android) compatibility.
  - Added full keyboard support (Enter/Space) to all interactive icons.
  - Centralized icon sizing via the `--icon-size` CSS variable.
- **Reader Settings Refactor**:
  - Replaced "Words per row" slider with a percentage-based "Paragraph width" dropdown (25%, 50%, 75%, 100%).
  - Replaced "Font size" slider with a discrete dropdown (80% to 200%).
  - Replaced "Line height" slider with a discrete dropdown (100% to 200%).
  - Added 2px horizontal padding for 100% paragraph width to improve readability.

### Fixed

- **Android/iOS Rendering**: Fixed multiple instances where icons failed to render or appeared broken on mobile devices.
- **iOS Feed Content**: 
    - Fixed an issue where Substack and Psychology Today articles appeared empty on iPhone by implementing robust XML namespace extraction using `getElementsByTagNameNS` instead of `querySelector`.
    - Fixed full article content fetching (via Readability) failing on iOS for sites with strict WAFs (like Psychology Today) by introducing a tiered fetch mechanism with a configurable CORS Proxy fallback. You can now enable and configure a CORS proxy in the settings (see reference `docs/bugs/ios-full-article-fetch-failure.md`).
- **Reader Rendering**: Improved article display logic to ensure content is always rendered as the primary body, even if it matches the feed description.
- **ESLint/Build Integrity**:
    - Cleaned up multiple ESLint & TypeScript compilation errors in `ReaderView`.
  - Implemented strictly-typed Obsidian app and plugin interfaces for safer API access.
  - Standardized `HighlightService` and `robustFetch` usage to match modern patterns.

### Development

- **Testing**: Added unit tests for namespaced XML extraction and reader logic in `test_files/unit/ios-namespace-fix.test.ts`.
- **Build Logging**: Added explicit confirmation messages to `esbuild.config.mjs` to verify successful JS and CSS bundling.

---

## [2.3.0-alpha.2] - March 16, 2026

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

## [2.3.0-alpha.1] - March 13, 2026

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
- Per-feed "Override global filters" support
- Dashboard-level "Bypass All Filters" toggle
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
- New **Filters** settings tab
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
