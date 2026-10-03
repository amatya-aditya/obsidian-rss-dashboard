# Getting Started with RSS Dashboard

This guide walks you through adding your first feed, discovering content, reading articles, and saving them to your vault.

## Adding Your First Feed

The easiest way to start is by adding a feed from a familiar source.

1. Open **RSS Dashboard** using the ribbon icon or command palette.
2. Click the **+** button in the sidebar to open the Add Feed modal.
3. Paste a feed URL or website URL:
   - Direct feed URL: `https://example.com/feed.xml`
   - Website URL: `https://example.com` (the plugin will auto-discover the feed)
   - YouTube channel: Paste the channel URL, and the plugin converts it to an RSS feed
   - Podcast: Paste the podcast feed URL
4. Choose a folder to organize the feed (or create a new one).
5. Click **Add Feed** to subscribe.

**Pro tip:** Try adding a familiar news source or YouTube channel first to get comfortable with the interface.

## Using the Discover Page

Find new feeds in the curated Discover page, organized by category and topic.

1. Open **RSS Discover** using the Discover icon or command palette.
2. Browse the **Categories** section to find curated collections of handpicked feeds.
3. Click any category to expand or collapse it.
4. Use **Kagi Smallweb** button to explore a curated collection of smaller independent blogs and websites.
5. Use filters or search to find specific content.
6. Click **Add Feed** on any feed card to subscribe instantly (one-click subscribe).

## Reading Articles

Once you've added feeds, the dashboard displays all articles from your subscriptions.

1. Click any article title in the dashboard to open it in the reader view.
2. Use the **reader view** for a distraction-free reading experience:
   - Full article content is fetched and displayed
   - Images and formatting are preserved
   - Content is rendered as Markdown for consistency
3. For **video content** (YouTube, podcasts):
   - Use the built-in video player or podcast player
   - YouTube embeds use Privacy Enhanced Mode via `youtube-nocookie.com`
   - Each video includes a visible **Watch on YouTube** link
4. Track your progress through articles:
   - Mark articles as read
   - Star articles for later
   - The plugin remembers where you left off in videos and podcasts

## Organizing Your Feeds

Create a system that works for you using folders, tags, and filters.

1. **Folders:** Create folders and subfolders to group feeds by category or topic.
2. **Drag and drop:** Reorganize feeds and folders by dragging them in the sidebar.
3. **Tags:** Add custom tags to feeds or articles for additional organization.
4. **Filtering:** Filter articles by:
   - Read status (read/unread)
   - Age (last 24 hours, week, month)
   - Starred articles
   - Saved articles
   - By feed or folder
5. **Sorting:** Sort articles by newest, oldest, or group by feed, date, or folder.

## Saving Articles

Save important articles to your vault as permanent Markdown files.

1. Open an article in the reader view.
2. Click **Save Article** (or use the save button).
3. Choose where to save the file in your vault.
4. The plugin saves the article as Markdown with:
   - Full article content
   - Customizable frontmatter (title, date, feed, URL, tags, etc.)
   - Optional custom templates for formatting

**Pro tip:** Set up custom save templates in settings to control exactly what gets saved and how it's formatted.

## One-Click Subscribe

Subscribe to feeds directly from external apps and websites using Obsidian's URI protocol.

Use this format in browser extensions or apps:

```
obsidian://rss-dashboard?action=add-feed&url=<encoded-feed-url>
```

Example:

```
obsidian://rss-dashboard?action=add-feed&url=https%3A%2F%2Fexample.com%2Frss.xml
```

The plugin opens with the Add Feed modal ready to subscribe.

## Auto-Refresh

Feeds can be automatically refreshed based on your settings (off by default). Note: Feeds cannot be refreshed while Obsidian is closed. If you are interested in that functionality, [FreshRSS](https://freshrss.org/index.html) is a popular and viable solution.

1. Go to **Settings** > **RSS Dashboard** > **Refresh Settings**.
2. Set the refresh interval (e.g., every 30 minutes).
3. The plugin runs updates in the background without interrupting your work.

## Next Steps

Now that you've added your first feed, explore these guides:

- **[Organization Guide](./tags-primer.md)** — Detailed walkthrough of tags, folders, and filtering
- **[Storage Guide](./storage-vault-shards-guide.md)** — Learn about data storage options
- **[Keyboard Shortcuts](./keyboard-shortcuts.md)** — Speed up your workflow
- **[Troubleshooting](./troubleshooting.md)** — Common issues and solutions
- **[Documentation Hub](./README.md)** — Full documentation index

## Tips & Tricks

- **Quick add:** Use the command palette to add feeds without opening the sidebar
- **Search:** Use the search box in Discover to find feeds by name or keyword
- **Sync:** Set up Obsidian Sync or another sync solution to keep your feeds across devices (see [Syncing Guide](./syncing.md))
- **Backups:** Export your subscriptions as OPML regularly as a backup
