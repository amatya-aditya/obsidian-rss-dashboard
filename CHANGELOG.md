# RSS Dashboard - Changelog

## [2.2.0] - 2026-02-25

### Highlights

- Large feature release on top of upstream `2.0.0`, focused on filtering, discover workflow improvements, mobile/tablet UX, and feed management quality-of-life updates.

### New Features

- Added keyword filtering with global and per-feed rule sets (via Add & Edit feed modals):
  - Include/exclude rules with exact or partial matching
  - Selectable rule targets: title, summary, content
  - Include-rule logic (`AND` or `OR`)
  - Per-feed "Override global filters" support
  - Dashboard-level "Bypass All Filters" toggle
- Added Word Highlighting feature:
  - Custom Word Highlights: Add words or phrases to be highlighted in article titles, summaries, and content
  - Per-Word Colors: Each highlight word can have its own custom color
  - Flexible Location Control: Choose where highlights appear:
    - Article titles in list/card view
    - Article summaries in card view
    - Article content in reader view
  - Case Sensitivity Option: Match words with exact case or case-insensitive
  - Per-Word Whole Word Matching: Each highlight word can be set to match whole words only or partial matches
  - Default Color Setting: Set a default highlight color for new words
  - Quick Toggle in Filter Menu: "Show Highlights" toggle in the Filters menu for quick enable/disable

### Settings

- New "Highlights" settings tab with full configuration options
- Add, edit, enable/disable, and delete highlight words
- Visual preview of highlight colors in settings
- Per-word "Whole"/"Partial" toggle for flexible matching

- Added article search in the article header (desktop + mobile menu placement).
- Refactored sidebar search to focus on feeds/folders (`Search feeds...`).
- Added Kagi Smallweb integration (50 most recently updated feeds, 5 hour refresh) in Discover view with in-app browsing/follow flow.
- Added unified folder selector popup for Discover and Smallweb follow/add actions.
- Added follow status filtering in Discover (All / Followed / Unfollowed).
- Added modern OPML import modal with validation, preview, and update/overwrite modes.
- Added auto-folder assignment expansion for podcasts and standard RSS feeds.
- Added resizable sidebars to both the left and right panes.

### UI/UX Improvements

- Moved/streamlined add-feed workflows for faster sidebar access.
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

### Technical Notes

- Added shared keyword filtering service and reusable rule-editor component.
- Added filter update event plumbing for immediate dashboard re-render behavior.
- Performed CSS cleanup/refactors and responsive rule consolidation across major views.

---

## [2.0.0] - 2024-12-19

- Upstream base release from the original author.
