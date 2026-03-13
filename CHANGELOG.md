## [2.3.0-beta.1] - March 13, 2026

### New Features

- Added automatic YouTube Shorts detection and tagging from feed XML
- Added a media setting to enable or disable YouTube Shorts detection
- **Tag Management**: Recreated and enhanced tag editing functionality across Sidebar, Article List, and Reader View, allowing direct modification of tag names and colors.
- **X/Twitter to Nitter**: Added automatic redirection of X/Twitter feeds to Nitter RSS feeds.

### Improvements

- **Tagging UX**: Expanded clickable area for tags in dropdowns; clicking the label text now toggles the tag checkbox.
- **Feed Validation**:
  - Allow adding valid feeds that currently have no items.
  - Display a warning for valid but empty feeds in Add and Edit feed modals.
  - Prevent Add Feed modal from closing if background validation fails.

### Development

- Added CONTIRUBTING.MD to root directory for contribution guidelines

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
