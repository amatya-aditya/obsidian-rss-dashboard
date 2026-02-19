# RSS Dashboard - Developer Onboarding Guide

Welcome to the **RSS Dashboard** Obsidian plugin! This guide will help you understand the project architecture, set up your development environment, and start contributing.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Getting Started](#getting-started)
4. [Project Architecture](#project-architecture)
5. [Core Components](#core-components)
6. [Key Services](#key-services)
7. [Data Models](#data-models)
8. [Development Workflow](#development-workflow)
9. [Testing & Debugging](#testing--debugging)
10. [Contributing Guidelines](#contributing-guidelines)

---

## Project Overview

**RSS Dashboard** is an Obsidian plugin that transforms your vault into a powerful content consumption hub. It supports:

- **RSS/Atom/JSON Feeds** - Subscribe to blogs, news sites, and any RSS-compatible source
- **YouTube Integration** - Follow YouTube channels and playlists with an embedded video player
- **Podcast Support** - Subscribe to podcasts with a full-featured audio player
- **Article Saving** - Save articles as Markdown files with customizable templates
- **Discover Page** - Curated collection of RSS feeds organized by category

### Tech Stack

| Technology           | Purpose                     |
| -------------------- | --------------------------- |
| TypeScript           | Primary language            |
| Obsidian API         | Plugin framework            |
| esbuild              | Build bundler               |
| ESLint               | Code linting                |
| @mozilla/readability | Article content extraction  |
| turndown             | HTML to Markdown conversion |

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **Obsidian** (desktop or mobile)
- A code editor (VS Code recommended)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/amatya-aditya/obsidian-rss-dashboard.git
cd obsidian-rss-dashboard
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Development Build

For development with hot reload:

```bash
npm run dev
```

### 4. Production Build

```bash
npm run build
```

### 5. Link to Obsidian

1. Create a symlink from your Obsidian plugins folder to this project:

    ```bash
    # Windows (PowerShell)
    New-Item -ItemType Junction -Path "path\to\your\vault\.obsidian\plugins\rss-dashboard" -Target "."

    # macOS/Linux
    ln -s $(pwd) /path/to/your/vault/.obsidian/plugins/rss-dashboard
    ```

2. Enable the plugin in Obsidian:
    - Open Settings → Community plugins
    - Find "RSS Dashboard" and enable it

---

## Project Architecture

```
rss-dashboard/
├── main.ts                    # Plugin entry point
├── manifest.json              # Obsidian plugin manifest
├── package.json               # NPM dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── esbuild.config.mjs         # Build configuration
├── styles.css                 # Compiled styles
├── src/
│   ├── components/            # UI components
│   │   ├── article-list.ts    # Article list rendering
│   │   ├── sidebar.ts         # Sidebar navigation
│   │   └── folder-suggest.ts  # Folder autocomplete
│   ├── views/                 # Obsidian views
│   │   ├── dashboard-view.ts  # Main dashboard view
│   │   ├── discover-view.ts   # Feed discovery view
│   │   ├── reader-view.ts     # Article reader view
│   │   ├── podcast-player.ts  # Podcast player
│   │   └── video-player.ts    # Video player
│   ├── services/              # Business logic services
│   │   ├── feed-parser.ts     # RSS/Atom/JSON parsing
│   │   ├── article-saver.ts   # Save articles as Markdown
│   │   ├── opml-manager.ts    # OPML import/export
│   │   ├── media-service.ts   # YouTube/Podcast handling
│   │   └── web-viewer-integration.ts
│   ├── modals/                # Obsidian modals
│   │   ├── feed-manager-modal.ts
│   │   └── feed-preview-modal.ts
│   ├── settings/              # Plugin settings
│   │   └── settings-tab.ts
│   ├── styles/                # CSS modules
│   │   ├── articles.css
│   │   ├── card-view.css
│   │   ├── controls.css
│   │   ├── discover.css
│   │   ├── layout.css
│   │   ├── list-view.css
│   │   ├── modals.css
│   │   ├── podcast-player.css
│   │   ├── podcast-themes.css
│   │   ├── reader.css
│   │   ├── responsive.css
│   │   ├── settings.css
│   │   ├── sidebar.css
│   │   └── video.css
│   ├── types/                 # TypeScript definitions
│   │   ├── types.ts           # Core type definitions
│   │   ├── discover-types.ts
│   │   └── external.d.ts
│   ├── utils/                 # Utility functions
│   │   └── platform-utils.ts
│   └── discover/              # Curated feeds data
│       └── discover-feeds.json
└── docs/                      # Documentation
    └── releases/              # Release notes
```

---

## Core Components

### Plugin Entry Point ([`main.ts`](../main.ts))

The main plugin class `RssDashboardPlugin` extends Obsidian's `Plugin` class and handles:

- **Settings Management** - Loading, saving, and migrating settings
- **View Registration** - Registering custom views with Obsidian
- **Command Registration** - Adding commands to the command palette
- **Feed Operations** - Adding, editing, deleting, and refreshing feeds
- **OPML Import/Export** - Managing feed subscriptions

```typescript
export default class RssDashboardPlugin extends Plugin {
	settings!: RssDashboardSettings;
	feedParser!: FeedParser;
	articleSaver!: ArticleSaver;

	async onload() {
		await this.loadSettings();
		this.registerViews();
		this.addCommands();
		this.addRibbonIcons();
	}
}
```

### Views

Views are the primary UI components in Obsidian plugins. Each view extends `ItemView`:

| View                                                 | Type Constant        | Purpose                           |
| ---------------------------------------------------- | -------------------- | --------------------------------- |
| [`RssDashboardView`](../src/views/dashboard-view.ts) | `rss-dashboard-view` | Main feed dashboard               |
| [`DiscoverView`](../src/views/discover-view.ts)      | `rss-discover-view`  | Curated feed discovery            |
| [`ReaderView`](../src/views/reader-view.ts)          | `rss-reader-view`    | Article reader with media support |

### Components

Components are reusable UI building blocks:

- **[`Sidebar`](../src/components/sidebar.ts)** - Navigation sidebar with folders, feeds, and tags
- **[`ArticleList`](../src/components/article-list.ts)** - Renders articles in card or list view

---

## Key Services

### FeedParser ([`src/services/feed-parser.ts`](../src/services/feed-parser.ts))

The `FeedParser` class handles all RSS/Atom/JSON feed parsing:

```typescript
class FeedParser {
	async parseFeed(url: string, existingFeed?: Feed): Promise<Feed>;
	async refreshFeed(feed: Feed): Promise<Feed>;
	async refreshAllFeeds(feeds: Feed[]): Promise<Feed[]>;
}
```

**Key Features:**

- Supports RSS 1.0, RSS 2.0, Atom, and JSON feeds
- Automatic feed discovery from website URLs
- Proxy fallback for CORS issues
- Media type detection (article/video/podcast)
- Cover image extraction

### ArticleSaver ([`src/services/article-saver.ts`](../src/services/article-saver.ts))

Handles saving articles as Markdown files:

```typescript
class ArticleSaver {
	async saveArticle(
		item: FeedItem,
		folder?: string,
		template?: string,
	): Promise<TFile | null>;
	async saveArticleWithFullContent(
		item: FeedItem,
		folder?: string,
		template?: string,
	): Promise<TFile | null>;
}
```

**Template Variables:**

- `{{title}}` - Article title
- `{{link}}` - Article URL
- `{{content}}` - Article content
- `{{author}}` - Article author
- `{{date}}` - Current date
- `{{tags}}` - Article tags
- `{{source}}` - Feed source
- `{{feedTitle}}` - Feed name

### MediaService ([`src/services/media-service.ts`](../src/services/media-service.ts))

Handles YouTube and podcast detection:

```typescript
class MediaService {
	static async getYouTubeRssFeed(input: string): Promise<string | null>;
	static detectAndProcessFeed(feed: Feed): Feed;
	static applyMediaTags(feed: Feed, availableTags: Tag[]): Feed;
}
```

### OpmlManager ([`src/services/opml-manager.ts`](../src/services/opml-manager.ts))

Manages OPML import/export:

```typescript
class OpmlManager {
	static parseOpmlMetadata(content: string): {
		feeds: FeedMetadata[];
		folders: Folder[];
	};
	static generateOpml(feeds: Feed[], folders: Folder[]): string;
	static mergeFolders(existing: Folder[], newFolders: Folder[]): Folder[];
}
```

---

## Data Models

### Core Types ([`src/types/types.ts`](../src/types/types.ts))

#### FeedItem

Represents a single article/episode/video:

```typescript
interface FeedItem {
	title: string;
	link: string;
	description: string;
	pubDate: string;
	guid: string;
	read: boolean;
	starred: boolean;
	saved: boolean;
	tags: Tag[];
	feedTitle: string;
	feedUrl: string;
	coverImage: string;
	mediaType?: "article" | "video" | "podcast";
	// ... podcast-specific fields
}
```

#### Feed

Represents an RSS feed subscription:

```typescript
interface Feed {
	title: string;
	url: string;
	folder: string;
	items: FeedItem[];
	lastUpdated: number;
	mediaType?: "article" | "video" | "podcast";
	maxItemsLimit?: number;
	autoDeleteDuration?: number;
}
```

#### Settings

```typescript
interface RssDashboardSettings {
	feeds: Feed[];
	folders: Folder[];
	refreshInterval: number;
	maxItems: number;
	viewStyle: "list" | "card";
	sidebarCollapsed: boolean;
	articleSaving: ArticleSavingSettings;
	media: MediaSettings;
	display: DisplaySettings;
	// ... more settings
}
```

---

## Development Workflow

### Running the Development Server

```bash
npm run dev
```

This starts esbuild in watch mode. Changes to TypeScript files will automatically rebuild.

### Linting

```bash
npm run lint
```

### Building for Production

```bash
npm run build
```

This runs ESLint, TypeScript type checking, and creates a production build.

### Version Bumping

```bash
npm run version
```

Updates version numbers in manifest.json and versions.json.

---

## Testing & Debugging

### Debug Mode

Open Obsidian's developer console with `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS).

### Common Debugging Scenarios

#### Feed Not Loading

1. Check the console for network errors
2. Verify the feed URL is accessible
3. Test with a CORS proxy if needed

#### Settings Not Saving

1. Check `data.json` in the plugin folder
2. Verify `saveSettings()` is being called
3. Look for migration issues in `loadSettings()`

#### UI Not Updating

1. Ensure `render()` or `refresh()` is called after state changes
2. Check that `saveSettings()` is awaited before re-rendering

---

## Contributing Guidelines

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Keep functions focused and small

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and build (`npm run build`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Adding New Features

1. **New Feed Type**: Extend `FeedParser` and `MediaService`
2. **New View**: Create a new view class and register it in `main.ts`
3. **New Setting**: Add to `RssDashboardSettings` and `DEFAULT_SETTINGS`
4. **New UI Component**: Create in `src/components/` and import styles

---

## Resources

- [Obsidian API Documentation](https://docs.obsidian.md/Reference/TypeScript+API)
- [Obsidian Plugin Development](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)
- [Atom Syndication Format](https://tools.ietf.org/html/rfc4287)
- [JSON Feed Specification](https://www.jsonfeed.org/version/1.1/)

---

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues)
- **Discord Community**: [Join the discussion](https://discord.gg/9bu7V9BBbs)

---

Welcome to the team! 🎉
