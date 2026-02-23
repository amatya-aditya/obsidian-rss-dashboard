# RSS Dashboard - Changelog

## [2.0.8] - 2026-02-22

### ⚙️ Refactor & Cleanup

- **Consolidated List View Styling**: Moved all list-view specific styles from `articles.css` to a dedicated `list-view.css` file.
- **Responsive CSS Cleanup**: Removed extensive legacy CSS rules and unused classes (`.rss-feed-item`, `.rss-card`, etc.) from `responsive.css`.
- **Unified State Management**: Synchronized `.active`, `.unread`, `.read`, and `.saved` state styles across both List and Card view types to ensure visual consistency.
- **Redundancy Removal**: Eliminated duplicate card-view container definitions from `articles.css`.

---

## [2.0.7] - 2026-02-22

### 🐛 Bug Fixes

### Build System

- **Fixed ESLint/TypeScript Build Errors**: Resolved all build errors to ensure clean production builds
  - Fixed `@typescript-eslint/no-explicit-any` errors by adding proper types in `discover-sidebar.ts`
  - Fixed `@typescript-eslint/no-unsafe-*` errors by properly typing category map and node parameters
  - Fixed `@typescript-eslint/no-misused-promises` errors by converting async callbacks to void-returning functions
  - Fixed `obsidianmd/no-static-styles-assignment` by using CSS classes instead of direct style assignments
  - Exported `SidebarOptions` and `SidebarCallbacks` interfaces from `sidebar.ts` for proper typing
  - Replaced `this.app.isMobile` with `Platform.isMobile` (correct Obsidian API for mobile detection)
  - Added definite assignment assertions (`!`) for class properties initialized in `onOpen()`

### Technical Details

The build errors were caused by:

1. Use of `any` types in category map generation and rendering
2. Async functions passed where void return was expected in callback interfaces
3. Direct style assignments (`element.style.visibility`, `element.style.display`) instead of CSS classes
4. Non-exported interfaces being used in other modules
5. Incorrect use of `app.isMobile` instead of `Platform.isMobile`

**Files Changed:**

- `src/components/discover-sidebar.ts`: Added proper types, used CSS classes for visibility
- `src/modals/mobile-discover-filters-modal.ts`: Fixed async callback and property initialization
- `src/modals/mobile-navigation-modal.ts`: Fixed interface usage and property initialization
- `src/components/sidebar.ts`: Exported interfaces
- `src/views/dashboard-view.ts`: Used `Platform.isMobile`
- `src/views/discover-view.ts`: Used `Platform.isMobile`, fixed modal constructor call

---

## [2.0.6] - 2026-02-21

### ✨ New Features

- **Mobile Navigation Drawer**: Implemented a new modal-based navigation drawer for the Dashboard view on mobile devices.
- **Mobile Discover Filters**: Added a dedicated modal for filtering feeds on the Discover page, specifically optimized for mobile and tablet screens.

### 🎨 UI/UX Improvements

- **Unified 1024px Breakpoint**: Standardized the responsive layout across both Dashboard and Discover views to trigger at 1024px (Tablet).
- **Responsive Header Controls**: Restricted desktop-style filter and sort buttons to resolutions above 1024px, ensuring the hamburger menu is the primary control on tablets and mobile.
- **Refined Narrow View Logic**: Updated the `ResizeObserver` threshold to 1024px, ensuring the header collapses correctly when the Obsidian sidebar is open on smaller desktop screens.

### 🐛 Bug Fixes

- **CSS Loading Order Fixes**: Resolved conflicts where later-loaded stylesheets were overriding responsive layout rules.
- **Breakpoint Synchronization**: Fixed inconsistencies between the Dashboard and Discover view responsive thresholds.
- **CSS Specificity**: Applied `!important` to key responsive display toggles to ensure layout stability across all Obsidian themes.

### Technical Details

The responsive system was overhauled to ensure consistency:

- **`controls.css`**: Added detailed documentation of the responsive hierarchy and load order.
- **`discover.css`**: Updated container queries and media queries to align with the 1024px standard.
- **`responsive.css`**: Synchronized sidebar hiding rules.

**Files Changed:**

- `src/styles/controls.css`
- `src/styles/discover.css`
- `src/styles/responsive.css`
- `src/components/article-list.ts`
- `src/modals/mobile-navigation-modal.ts`
- `src/modals/mobile-discover-filters-modal.ts`
- `src/views/dashboard-view.ts`
- `src/views/discover-view.ts`

---

## [2.0.5] - 2026-02-20

### 🐛 Bug Fixes

### Sidebar Overlay Refactor

- **Fixed Sidebar Squishing Main Content**: Sidebar now overlays the main content instead of pushing it, preventing layout shifts and card misalignment
  - Changed sidebar from `position: relative` to `position: absolute` with `z-index: 10`
  - Main content now always takes full width (`width: 100%`) instead of calculating `calc(100% - 360px)`
  - Removed width transitions that caused layout thrashing during sidebar toggle
  - Fixed mobile CSS class name mismatch (`.rss-sidebar` → `.rss-dashboard-sidebar`, `.rss-content` → `.rss-dashboard-content`)

### Mobile Improvements

- **Fixed Mobile Sidebar Behavior**: Sidebar now slides off-screen smoothly on mobile instead of using `display: none`
  - Uses `transform: translateX(-100%)` for smooth animation
  - Main content no longer squishes when sidebar opens on mobile
  - Card action buttons maintain proper positioning during sidebar toggle

### Technical Details

The sidebar squishing bug was caused by:

1. Sidebar being in normal document flow with `position: relative`
2. Main content having a calculated width `calc(100% - 360px)` that fought with `flex-grow: 1`
3. During collapse transition, the width calculation and flex layout conflicted
4. On mobile, CSS media queries targeted wrong class names (`.rss-sidebar` instead of `.rss-dashboard-sidebar`)

**Files Changed:**

- `src/styles/layout.css`: Changed sidebar to absolute positioning
- `src/styles/articles.css`: Removed width calculation from main content
- `src/styles/sidebar.css`: Removed transform transition from sidebar container
- `src/styles/responsive.css`: Fixed mobile class names and sidebar behavior

---

## [2.0.4] - 2026-02-20

### 🐛 Bug Fixes

### Build System

- **Fixed ESLint/TypeScript Build Errors**: Resolved all build errors to ensure clean production builds
  - Fixed `@typescript-eslint/no-explicit-any` errors by properly typing event listeners as `EventListenerOrEventListenerObject`
  - Fixed event handler parameter types from `MouseEvent` to `Event` for DOM compatibility
  - Removed unused variables (`badge`, `contextEvent`)
  - Fixed `obsidianmd/ui/sentence-case` lint rule compliance
  - Fixed `obsidianmd/no-static-styles-assignment` by using CSS classes and CSS custom properties
  - Fixed non-existent method call `getAllFilteredArticles()` to `getFilteredArticles()`
  - Added CSS class `.rss-dashboard-submenu-fixed` for submenu positioning

### Mobile Sidebar Viewport Height

- **Fixed Mobile Sidebar Height**: Sidebar now correctly fills the full viewport height on mobile devices
  - Replaced `max-height: 100vh` with `max-height: 100dvh` (dynamic viewport height) to handle mobile browser chrome
  - Removed incorrect `max-height: 40%` constraint in mobile media query that was limiting sidebar height
  - Fixed dropdown portal positioning to use `100dvh` for consistent behavior

### Mobile UI Improvements

- **Hide Hamburger Menu When Sidebar Open**: On mobile, the hamburger menu is now hidden when the sidebar is visible to prevent UI clutter and confusion

### Technical Details

The viewport height issue was caused by the mobile browser's dynamic address bar behavior:

- `100vh` represents the "large" viewport (address bar hidden), which is larger than the visible area when the address bar is shown
- `100dvh` (dynamic viewport height) automatically adjusts as the browser chrome expands/collapses
- Added `100vh` fallback for older WebViews that don't support `100dvh`

**Files Changed:**

- `src/styles/sidebar.css`: Added `100dvh` fallback for sidebar container
- `src/styles/responsive.css`: Fixed mobile media query to use full viewport height
- `src/styles/dropdown-portal.css`: Fixed dropdown positioning calculations
- `src/styles/controls.css`: Hide hamburger menu when sidebar is open on mobile

---

## [2.0.3] - 2026-02-19

### ✨ New Features

### Article Display Enhancements

- **Favicon Icons**: Article list and card views now display favicon icons for each feed source
- **Feed Logo in Header**: When viewing a specific feed, the feed's logo/icon appears in the header
- **YouTube URL Detection**: Add Feed modal now automatically detects and warns user if trying to add a YouTube channel via the RSS window

### Discover Page Improvements

- **Two-Button Folder Selection**: New streamlined approach for selecting feed folders directly from the Discover page
- **Reordered Action Buttons**: Discover page buttons repositioned to the top for better accessibility
- **Removed Star Ratings**: Cleaned up Discover cards by removing star ratings for a simpler interface

### Feed Management

- **Apple Podcast Resolution Support**: Enhanced podcast feed detection with Apple Podcast support
- **Default "Uncategorized" Folder**: Fresh installations now include an "Uncategorized" folder by default. Quick added feeds will be automatically placed here

---

### 🎨 UI/UX Improvements

### View Controls

- **Accent Color Toggle**: List/Card view toggle buttons now use accent color when active for better visual feedback
- **Action Bar Icons**: Added icons to view toggle and refresh buttons for improved clarity
- **Icon Alignment**: Fixed alignment of icons and text in view toggle and refresh buttons

### Article Cards

- **Active Border Indicator**: Selected article cards now show a clear active border indicator
- **4-Quadrant List View**: Updated list view cards to a cleaner 4-quadrant display layout

---

## [2.0.2] - 2026-02-19

### ✨ New Features

### Auto-Hide on Read Toggle

- **Auto-Hide Setting**: New display setting to automatically hide articles when marking them as read
- **Configurable Animation**: Optional fade-out animation with configurable duration (0ms instant, 100ms, 200ms, 300ms, 500ms, 1000ms)
- **Smart Filtering**: When enabled, all read articles are filtered from view (except in "Read items", "Saved items", and "Starred items" views)
- **Persistent Behavior**: Setting persists across sessions - read articles remain hidden when returning to the dashboard

---

## [2.0.1] - 2026-02-19

### 🎉 First Community Contribution - Tooltip Enhancements

This release includes our first community contribution, adding helpful hover tooltips to improve usability.

---

## 🚀 Enhanced Features

### UI/UX Improvements

- **Action Bar Tooltips**: Added descriptive hover tooltips to the article action icons:
  - Read/Unread toggle: Shows "Mark as unread" or "Mark as read" based on current state
  - Favorite/Star toggle: Shows "Add to favorites" or "Remove from favorites" based on current state
  - Tag management: Shows "Manage tags" for the tag dropdown icon
- Tooltips are now consistent across both List and Card view layouts

---

## [2.0.0] - 2024-12-19

### 🎉 Major Release - Discover, Mobile Support & Enhanced Media Experience

This major release brings a complete overhaul of the RSS Dashboard experience with new features, mobile optimization, and enhanced media capabilities.

---

## ✨ Shiny New Things

### Discover Page

- **Curated Feed Collection**: Browse hand-picked RSS feeds organized by categories (Technology, Science, Philosophy, Engineering, etc.)
- **Smart Filtering**: Filter feeds by domain, subdomain, area, topic, type, and tags
- **Advanced Search**: Find feeds with real-time search functionality
- **Rating System**: Discover high-quality feeds with community ratings
- **One-Click Subscribe**: Add feeds directly from the discover page with preview functionality
- **Pagination & Sorting**: Navigate through hundreds of feeds with multiple sorting options

### Mobile & Tablet Support

- **Android & iPad Optimization**: Full responsive design for mobile devices
- **Touch-Friendly Interface**: Optimized touch targets and gestures for mobile interaction
- **Adaptive Layout**: Automatic layout adjustments based on screen size and orientation
- **Mobile Performance**: Optimized parsing and reduced resource usage for mobile devices
- **Platform Detection**: Automatic platform detection with device-specific optimizations

### Enhanced Podcast Player

- **Beautiful Audio Interface**: Modern, gradient-enhanced podcast player with cover art
- **Playlist Management**: Full episode playlist with progress tracking
- **Advanced Controls**: Playback speed control (0.75x to 3x), shuffle, repeat modes
- **Progress Persistence**: Automatic progress saving and resume functionality
- **Touch Controls**: Optimized controls for mobile devices with 10-second rewind/45-second forward
- **Volume Control**: Integrated volume slider with visual feedback
- **Episode Navigation**: Previous/next episode controls with visual indicators

### Individual Feed Controls

- **Per-Feed Settings**: Customize settings for each feed independently
- **Auto-Delete Duration**: Set automatic article cleanup (1 day to 1 year or custom)
- **Max Items Limit**: Control how many articles each feed keeps (10-500 items)
- **Custom Scan Intervals**: Set different refresh intervals per feed
- **Feed-Specific Folders**: Organize feeds into custom folders and subfolders
- **Bulk Operations**: Apply settings to multiple feeds at once

---

## 🚀 Enhanced Features

### Article Management

- **Smart Article Saving**: Save articles as markdown with customizable templates
- **OPML Import/Export**: Backup and restore your feed subscriptions
- **Advanced Filtering**: Filter by read status, age, starred, saved, and more
- **Flexible Sorting**: Sort by newest, oldest, and group by feed, date, or folder
- **Pagination**: Configurable page sizes for better performance
- **Tag Management**: Add custom tags with color coding for better organization

### Media Integration

- **YouTube Channel Support**: Convert YouTube channels to RSS feeds
- **Embedded Video Player**: Watch videos directly within the dashboard
- **Podcast Detection**: Automatic detection and categorization of podcast content
- **Media Type Filtering**: Separate views for videos, podcasts, and articles
- **Cover Art Display**: Beautiful cover art for podcasts and videos

### User Experience

- **Reader View**: Built-in article reader with full content fetching
- **Responsive Design**: Adaptive layouts for all screen sizes
- **Dark Mode Support**: Compatibility with Obsidian's dark theme
- **Loading States**: Smooth loading animations and progress indicators

---

## 🔧 Technical Improvements

### Platform Support

- **Cross-Platform**: Works seamlessly on Windows, macOS, and Linux
- **Mobile Optimization**: Automatic mobile detection and optimization
- **Browser Compatibility**: Enhanced compatibility with various browsers
- **Accessibility**: Improved accessibility features and keyboard navigation

---

## Bug Fixes & Polish

- Fixed feed refresh issues on mobile devices
- Improved error handling for malformed RSS feeds
- Enhanced article saving reliability
- Fixed podcast player progress tracking
- Improved discover page performance
- Better handling of large feed collections
- Fixed OPML import/export edge cases
- Enhanced mobile touch interactions
- and many more

---

## 🙏 Community

A huge thank you to our amazing community for feedback, testing, and contributions! Join our [Discord server](https://discord.gg/NCHuzyhj) to help shape future releases and discover new feeds.

---

_Happy reading! 📚✨_
