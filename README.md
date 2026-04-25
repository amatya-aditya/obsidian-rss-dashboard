<div align="center">
  <a href="https://github.com/amatya-aditya/obsidian-rss-dashboard" target="_blank">
    <img src="https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/assets/logo.png" alt="RSS Dashboard Logo" width="10%" />
  </a>
</div>

<h1 align="center">RSS Dashboard</h1>
<h4 align="center">Only the feeds you need</h4>
<h4 align="center">Stream the world's knowledge into your vault: RSS, podcasts, YouTube, and more, all in one dashboard</h4>

## Screenshots

<br>
<p align="center">
  <img src="https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/dev/assets/2.2/2.2_Dashboard.jpg" alt="RSS Dashboard main dashboard view">
</p>

<p align="center">
  <img src="https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/dev/assets/2.2/2.2_Dashboard_feedview_light.jpg" alt="RSS Dashboard feed view in light mode">
</p>

<p align="center">
  <a href="https://github.com/amatya-aditya/obsidian-rss-dashboard/releases/latest">
    <img src="https://img.shields.io/github/v/release/amatya-aditya/obsidian-rss-dashboard?style=flat-square&color=573E7A&label=release" alt="Latest release">
  </a>
  <img src="https://img.shields.io/github/release-date/amatya-aditya/obsidian-rss-dashboard" alt="Release date">
  <a href="https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/amatya-aditya/obsidian-rss-dashboard" alt="License">
  </a>
  <img src="https://img.shields.io/github/downloads/amatya-aditya/obsidian-rss-dashboard/total" alt="Total downloads">
  <a href="https://github.com/amatya-aditya/obsidian-rss-dashboard/issues">
    <img src="https://img.shields.io/github/issues/amatya-aditya/obsidian-rss-dashboard" alt="Open issues">
  </a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/amatya_aditya" target="_blank">Buy me a coffee</a>
</p>

<p align="center">
  <a href="https://ko-fi.com/Y8Y41FV4WI" target="_blank">
    <img height="36" style="border:0;height:36px;" src="https://storage.ko-fi.com/cdn/kofi2.png?v=6" border="0" alt="Buy me a coffee at ko-fi.com" />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/YwBu3Kdn1Qk" target="_blank">
    <img src="https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_play_button_icon_%282013%E2%80%932017%29.svg" style="width: 50px; height: auto;" alt="Watch the demo on YouTube">
  </a>
</p>

<p align="center">
  <a href="#about">About</a> |
  <a href="#community">Community</a> |
  <a href="#features">Features</a> |
  <a href="#screenshots">Screenshots</a> |
  <a href="#roadmap">Roadmap</a> |
  <a href="#installation">Installation</a> |
  <a href="#getting-started">Getting Started</a> |
  <a href="#troubleshooting">Troubleshooting</a> |
  <a href="#license">License</a>
</p>

## About

RSS Dashboard is a free, open source community plugin for Obsidian that makes it easy to manage your RSS feeds, YouTube subscriptions, podcasts, and Twitter/X feeds in one place. Data is stored locally, and content that comes through the plugin can be saved directly to your vault with a click. Twitter/X links are supported through native Nitter resolution, so profile URLs can be turned into feed subscriptions automatically.

## Community

Want to help shape the next release? Join our [Discord server](https://discord.gg/9bu7V9BBbs). It is where we:

- Help build the manually curated Discover page, with one-click subscriptions grouped by category
- Discuss ideas, questions, and best practices in real time
- Share sneak peeks of upcoming features and gather early feedback

Join here: https://discord.gg/9bu7V9BBbs

## Features

### Feed and Media Support

| **Feature**                  | **Description**                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| **Multi-Format RSS Support** | Support for RSS, Atom, XML and JSON feeds with automatic feed discovery and parsing |
| **YouTube Integration**      | Convert YouTube channels to RSS feeds with embedded video playback                  |
| **Podcast Support**          | Full podcast feed support with an integrated podcast player                         |
| **Twitter/X Support**        | Convert Twitter/X profile URLs to chronological Nitter RSS feeds automatically      |
| **Media Detection**          | Automatic detection of video and podcast content                                    |

### Reading and Saving

| **Feature**               | **Description**                                                             |
| ------------------------- | --------------------------------------------------------------------------- |
| **Article Reader View**   | Built-in reader with full article content fetching and Markdown conversion  |
| **Article Saving**        | Save articles as Markdown files with customizable templates and frontmatter |
| **Custom Templates**      | Customize saved article output with variable substitution                   |
| **Pagination**            | Paginated article lists with configurable page sizes                        |
| **Android/Apple Support** | Responsive support for cross-platform mobile devices                        |

### Organization and Workflow

| **Feature**             | **Description**                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| **Folder Organization** | Organize feeds into folders and subfolders with hierarchical structure |
| **Tag Management**      | Add custom tags to feeds and articles for better organization          |
| **Article Filtering**   | Filter articles by read status, age, starred, saved, and more          |
| **Article Sorting**     | Sort articles by newest, oldest, and group by feed, date, or folder    |
| **Auto-Refresh**        | Automatic feed refresh with configurable intervals                     |
| **OPML Import/Export**  | Import and export feed subscriptions in OPML format                    |

### Discovery

| **Feature**       | **Description**                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Discover Page** | Curated collection of RSS feeds organized by categories                            |
| **Kagi Smallweb** | Browse and subscribe to a curated stream of smaller independent blogs and websites |

## Roadmap

Looking for upcoming features? The old README planned-features list now lives in [docs/plans/public-roadmap.md](docs/plans/public-roadmap.md), along with links to other public-facing plans that have not been implemented yet.

## Installation

### Community Plugins Directory

1. Open **Settings** in Obsidian.
2. Go to **Community plugins** and disable **Restricted mode** if it is enabled.
3. Click **Browse**.
4. Search for `RSS Dashboard`.
5. Click **Install**, then **Enable**.

### Installing Through BRAT

1. Install BRAT from Obsidian's Community Plugins browser.
2. Copy the repository URL: `https://github.com/amatya-aditya/obsidian-rss-dashboard`
3. Open the command palette and run `BRAT: Add a beta plugin for testing`.
4. Paste the repository URL into the modal and select the latest version.
5. Click **Add Plugin** and wait for BRAT to finish.
6. Open **Settings** -> **Community plugins**.
7. Refresh the plugin list if needed.
8. Find **RSS Dashboard** and enable it.

### Manual Installation

1. Download the latest release files (`manifest.json`, `styles.css`, `main.js`) from the [Releases page](https://github.com/amatya-aditya/obsidian-rss-dashboard/releases).
2. Create a folder named `rss-dashboard` in your vault's `.obsidian/plugins` directory.
3. Copy the downloaded files into that folder.
4. Enable the plugin in **Settings** -> **Community plugins**. You may need to restart Obsidian before it appears.

## Getting Started

### Adding Your First Feed

1. Open the RSS Dashboard view using the ribbon icon or the command palette.
2. Click the `+` button in the sidebar to add a new feed.
3. Enter a feed URL or website URL. The plugin will try to auto-discover the feed for you.
4. Choose a folder to organize the feed.
5. Click **Add Feed** to subscribe.

### Using the Discover Page

1. Open the RSS Discover view using the Discover icon or the command palette.
2. Browse curated feeds organized by category.
3. Use the Kagi Smallweb button at the top of the Discover sidebar to open a curated collection of smaller independent blogs and websites.
4. Use filters or search to find content you want to follow.
5. Click **Add Feed** on any feed card to subscribe instantly.

### Reading Articles

1. Click any article in the dashboard to open it in the reader view.
2. Use the built-in reader for a cleaner reading experience.
3. Save articles as Markdown files for long-term storage in your vault.
4. Use the video player for YouTube content or the audio player for podcasts.
5. YouTube embeds use Privacy Enhanced Mode through `youtube-nocookie.com`, and each video includes a visible **Watch on YouTube** link.

### Organizing Your Feeds

1. Create folders and subfolders to organize your subscriptions.
2. Drag and drop feeds and folders to reorder them and build the structure you want more directly.
3. Add tags to categorize your content.
4. Use the filtering and sorting options to find specific articles quickly.
5. Export your feed list as OPML for backup or migration.

## Development

### Local Setup

This repo targets Node 22 for local development and CI. Both `.nvmrc` and `.node-version` are pinned to `22`.

If you use `nvm`, run:

```bash
nvm use
npm ci
```

### Local Development

Use the development build while making changes locally:

```bash
nvm use
npm ci
npm run dev
```

### Local CI-Equivalent Commands

Run the same install and unit test flow used in GitHub Actions:

```bash
nvm use
npm ci
npm run test:unit -- --coverage
```

### Production Build

To mirror the release workflow build step locally:

```bash
nvm use
npm ci
npm run build
```

## Troubleshooting

### Common Issues

**Feed not loading**:

- Check that the feed URL is correct.
- Try refreshing the feed manually.
- Some feeds require authentication.

**YouTube feeds not working**:

- Make sure you are using a valid YouTube channel, user, or playlist URL.
- Try using the channel ID instead of a custom URL.
- Some channels have disabled RSS feeds.
- YouTube feed retrieval is currently limited, and only about 15 YouTube feeds can usually be fetched at a time.
- Embedded playback uses `youtube-nocookie.com` with a strict referrer policy to satisfy current YouTube embed requirements.

**Podcast audio not playing**:

- Check that the audio URL is accessible.
- Some podcasts require authentication.
- Try opening the audio URL in a browser.

### Getting Help

If you run into an issue or have a suggestion:

- Create an issue on [GitHub](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues)
- Join the [Discord community](https://discord.com/invite/9bu7V9BBbs)
- Check existing issues for known fixes and workarounds

## YouTube Embeds and Terms

RSS Dashboard resolves YouTube feed items to a canonical `videoId`, renders the embedded player through Privacy Enhanced Mode (`https://www.youtube-nocookie.com/embed/...`), and provides a standard **Watch on YouTube** link that opens the original video in your browser or native YouTube app.

The plugin does not add YouTube download features, background audio-only playback, or ad-blocking behavior around the embedded player.

YouTube embeds and API usage are subject to:

- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)

## Support the Development

If you find this plugin useful, consider supporting its long-term development:

<p align="center">
  <a href="https://www.buymeacoffee.com/amatya_aditya" target="_blank">Buy me a coffee</a>
</p>

<p align="center">
  <a href="https://ko-fi.com/Y8Y41FV4WI" target="_blank">
    <img height="36" style="border:0;height:36px;" src="https://storage.ko-fi.com/cdn/kofi2.png?v=6" border="0" alt="Buy me a coffee at ko-fi.com" />
  </a>
</p>

## Other Plugins by Me

1. [Media Slider](https://github.com/amatya-aditya/obsidian-media-slider)
2. [Zen Space](https://github.com/amatya-aditya/obsidian-zen-space)

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
