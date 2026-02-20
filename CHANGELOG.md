# RSS Dashboard - Changelog

## [2.0.4] - 2026-02-20

### 🐛 Bug Fixes

### Mobile Sidebar Viewport Height

- **Fixed Mobile Sidebar Height**: Sidebar now correctly fills the full viewport height on mobile devices
    - Replaced `max-height: 100vh` with `max-height: 100dvh` (dynamic viewport height) to handle mobile browser chrome
    - Removed incorrect `max-height: 40%` constraint in mobile media query that was limiting sidebar height
    - Fixed dropdown portal positioning to use `100dvh` for consistent behavior

### Technical Details

The issue was caused by the mobile browser's dynamic address bar behavior:

- `100vh` represents the "large" viewport (address bar hidden), which is larger than the visible area when the address bar is shown
- `100dvh` (dynamic viewport height) automatically adjusts as the browser chrome expands/collapses
- Added `100vh` fallback for older WebViews that don't support `100dvh`

**Files Changed:**

- `src/styles/sidebar.css`: Added `100dvh` fallback for sidebar container
- `src/styles/responsive.css`: Fixed mobile media query to use full viewport height
- `src/styles/dropdown-portal.css`: Fixed dropdown positioning calculations

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
