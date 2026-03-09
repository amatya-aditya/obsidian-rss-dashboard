# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Watch mode: builds main.js + styles.css incrementally
npm run build      # Production build: runs ESLint + tsc type-check + esbuild (minified)
npm run lint       # Run ESLint on TypeScript files only
npm run version    # Bump version in manifest.json/versions.json (run before tagging)
```

There are no tests in this project.

The build produces two output files (not committed to git):
- `main.js` — bundled plugin code (entry point: `main.ts`)
- `styles.css` — bundled CSS (entry point: `src/styles/index.css`)

## Architecture

This is an **Obsidian plugin** written in TypeScript. All state is stored via Obsidian's built-in `loadData`/`saveData` API (persisted to `.obsidian/plugins/rss-dashboard/data.json` in the user's vault). There is no external database or local file storage for feed data.

### Entry point

`main.ts` — `RssDashboardPlugin` extends Obsidian's `Plugin` class. It:
- Instantiates and wires together all services (`FeedParser`, `ArticleSaver`, `OpmlManager`, `MediaService`)
- Registers the three custom views
- Handles background OPML import queue with status bar progress
- Owns feed CRUD operations (`addFeed`, `editFeed`, `refreshFeeds`, etc.) which mutate `this.settings.feeds` then call `saveSettings()`
- Runs `migrateLegacySettings()` on load to handle schema changes

### Views (`src/views/`)

| File | View type constant | Description |
|------|--------------------|-------------|
| `dashboard-view.ts` | `RSS_DASHBOARD_VIEW_TYPE` | Main dashboard with sidebar + article list |
| `discover-view.ts` | `RSS_DISCOVER_VIEW_TYPE` | Curated feed browser (data from `src/discover/discover-feeds.json`) |
| `reader-view.ts` | `RSS_READER_VIEW_TYPE` | Article reader with fetch + Readability + Turndown pipeline |
| `video-player.ts` | — | YouTube embed component used within reader |
| `podcast-player.ts` | — | Audio player with theme support |

### Components (`src/components/`)

- `sidebar.ts` — Left sidebar: folder tree, feed list, tags section
- `article-list.ts` — Article grid/list (card or list view), pagination, filtering, sorting
- `folder-suggest.ts` — Autocomplete text field for folder selection (used in modals)

### Services (`src/services/`)

- `feed-parser.ts` — Fetches and parses RSS/Atom/JSON feeds; auto-detects YouTube channels/playlists and converts them to RSS URLs; detects `mediaType` (article/video/podcast)
- `article-saver.ts` — Saves articles as Markdown files using template variable substitution (`{{title}}`, `{{content}}`, `{{date}}`, etc.); handles `savedTemplates` and frontmatter
- `opml-manager.ts` — OPML import/export; `parseOpmlMetadata()` returns feed metadata without fetching items; `generateOpml()` serializes current feeds
- `media-service.ts` — YouTube URL-to-RSS conversion (channel, user, playlist)
- `web-viewer-integration.ts` — Optional integration with the Web Viewer community plugin

### Settings (`src/settings/settings-tab.ts`)

Implements `PluginSettingTab`. All settings are typed in `src/types/types.ts` with the `RssDashboardSettings` interface and `DEFAULT_SETTINGS` constant. New settings fields must be added to both.

### CSS (`src/styles/`)

CSS is modular — `index.css` imports all partials via `@import`. esbuild bundles them into `styles.css`. Each partial covers a specific UI concern (layout, sidebar, articles, card-view, list-view, reader, controls, modals, podcast-player, podcast-themes, responsive, settings, discover, dropdown-portal).

### Types (`src/types/types.ts`)

Central type definitions. Key interfaces:
- `FeedItem` — individual article; `mediaType` distinguishes article/video/podcast
- `Feed` — a subscribed feed with its items array
- `RssDashboardSettings` — entire plugin state serialized to disk
- `FeedMetadata` — lightweight feed descriptor used during OPML import

## Release Process

Releases are fully automated via `.github/workflows/release.yml` and triggered by pushing a git tag:

```bash
npm run version   # updates manifest.json and versions.json
git add manifest.json versions.json
git commit -m "chore: bump version to X.Y.Z"
git tag X.Y.Z     # no leading "v"
git push && git push --tags
```

- **Stable releases**: tag format `X.Y.Z` → creates a draft release
- **Beta releases**: tag format `X.Y.Z-beta.N` (no `v` prefix) → creates a draft prerelease

The workflow builds the plugin, then uploads `main.js`, `manifest.json`, `styles.css`, and `obsidian-rss-dashboard.zip` as release assets.
