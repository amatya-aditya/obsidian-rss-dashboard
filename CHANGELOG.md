# RSS Dashboard - Changelog

## [2.2.0] - 2026-02-25

### Highlights

- Large feature release on top of upstream `2.0.0`, focused on filtering, discover workflow improvements, mobile/tablet UX, and feed management quality-of-life updates.

### New Features

- Added keyword and phrase filtering with global and per-feed rule sets (via Add & Edit feed modals):
  - Include/exclude rules with exact or partial matching
  - Selectable rule targets: title, summary, content
  - Rule logic (`AND` or `OR`)
  - Per-feed "Override global filters" support
  - Dashboard-level "Bypass All Filters" toggle
- Added Word Highlighting feature:
  - Custom Word Highlights: Add words or phrases to be highlighted in article titles, summaries, and content
  - Per-Word Colors: Each highlight word can have its own custom color
  - Flexible Location Control: Choose where highlights appear:
    - Titles in list/card view
    - Summaries in card view
    - Content in reader view
  - Case Sensitivity Option: Match words with exact case or case-insensitive
  - Per-Word Whole Word Matching: Each highlight word can be set to match whole words only or partial matches
  - Default Color Setting: Set a default highlight color for new words
  - Quick Toggle in Filter Menu: "Show Highlights" toggle in the Filters menu for quick enable/disable
- Added new customizable 'unread' badges for 'All feeds' button, Folder rows, and Feed rows -
  - Added ability in settings to show/hide each and custom colors for badges
- Customizable sidebar row spacing and indentation via settings
- Added article search on the dashboard page
- Added Kagi Smallweb integration (50 most recently updated feeds, 5 hour refresh) in Discover view
- Added support for Apple Podcasts URLs
- Added new folder selector popup for Discover and Smallweb follow action
- Added feed filtering in Discover (All / Followed / Unfollowed)
- Added modern OPML import modal with validation, preview, and update/overwrite modes.
- Added auto-folder assignment expansion for podcasts and standard RSS feeds.
- Added resizable sidebars to both the left and right panes.

### Settings

- New "Highlights" settings tab
- New "Filters" settings tab
- Updated "Display" settings tab, including new sidebar row features (see below) and new list/card toolbar options

### UI/UX Improvements

- Sidebar button makeover
- Consolidated RSS, Podcast, and Youtube add-feed workflows for more streamlined flow
- Simplified Discover controls and improved category tree behavior/hierarchy.
- Redesigned Add/Edit feed modal experiences and filter editor layout.
- Improved responsive behavior for mobile/tablet navigation, modal presentation, and card density.
- Improved reader/action-toolbar ergonomics and related interaction consistency.

### Bug Fixes

- Fixed feed filter edits not refreshing dashboard content immediately.
- Fixed Discover category indentation, badge alignment, and sorting consistency.
- Fixed resizable sidebar handle lifecycle/render timing regressions.
- Fixed mobile/tablet issues across manage-feeds modal access, hamburger visibility, and close-button alignment.
- Fixed OPML post-import refresh/state update issues.
- Fixed multiple build/lint/type issues affecting release stability.

---

## [2.0.0] - 2024-12-19

- Upstream base release from the original author.
