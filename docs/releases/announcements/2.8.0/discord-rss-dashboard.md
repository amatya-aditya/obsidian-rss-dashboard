# RSS Dashboard 2.8.0 — RSS Dashboard Discord

- Prepared: 2026-11-05
- Platform: RSS Dashboard Discord
- Release: 2.8.0

---

Hey everyone! RSS Dashboard **2.8.0** has just been released! 🎉 This release brings many new features and improvements, turning workflows that used to take extra steps into things you can do right inside Obsidian.

### 📖 Read full articles without leaving Obsidian

Before today, RSS Dashboard only showed the article content supplied by the feed; reading the full webpage meant opening a browser and leaving Obsidian. Now the Reader can fetch the webpage in the background, and you can switch between RSS and fetched content with a separate reading position for each version.

Saved-note templates now let you edit templates independently, choose a default, assign templates per feed, and configure folders and filename patterns. Choose whether a template saves RSS or fetched content, and use `{{contentSource}}` to record which version was saved.

### 🖼️ Card cover improvements

Card image covers can now be fetched directly from the source article and missing card images can be replaced if the site offers one. A new button to fetch and replace images has been added directly to each card, and a 'fetch all card images' button has been added to the dashboard toolbar.

### 🎨 Tag enhancements

Tags have received a major overhaul. Set default background and text colors under **Settings → Tags**, and choose from the **System**, **Vintage**, **Pastel**, and **High Contrast** palettes or use **Randomize**. Tags without individual colors inherit the defaults, and the **Edit tag** menu includes the new color options.

### 🎧 Podcast and media upgrades

- Podcast episodes with timestamps in their descriptions now have clickable chapter markers on the seek bar. A preview bar also shows how far playback will advance before the sleep timer stops it.
- Twitch VODs and live channels now play in the Reader and inline reader. YouTube videos embedded in feed content can play on demand, and saved YouTube items can include playable embeds.
- Video Focus mode works with Twitch and YouTube, hiding the watch link and source line along with surrounding article details.
- Fetched Bluesky posts now show their text and images in the Reader; posts with video show a poster and a **Watch on Bluesky** link.

### ✨ More in 2.8.0

- On phones and tablets, swipe between the sidebar, dashboard, and Reader; adjust article title size and choose whether cards animate while pressed. Animations respect your system's reduced-motion setting.
- Saved filenames can be up to 245 characters, with safer handling of emoji and other UTF-8 characters.
- Reddit feeds have been removed from Discover ahead of Reddit's RSS retirement; your existing subscriptions are unchanged.
- Startup is faster with large feed libraries, and read, star, tag, and playback changes appear sooner. Sync across devices, feed parsing, article images, and saved content are more reliable.
- More keyboard and screen-reader support, plus phone refinements: tag controls stack more cleanly, lightbox buttons stay clear of the status and home bars, card covers keep their usual background when tapped, and stars update as soon as you unstar.

There are additional fixes and smaller improvements in this release. See the full release notes and changelog for the complete details.

- **Release:** https://github.com/amatya-aditya/obsidian-rss-dashboard/releases/tag/2.8.0
- **Release notes:** https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/docs/releases/2.8.0.md
- **Changelog:** https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/CHANGELOG.md

If you'd like to support the plugin's continued development and our commitment to **free, open-source, ad-free software**, sponsorship and donation links are available in the README and under **Settings → About**. Any support is appreciated!

As always, please report bugs, feature requests, or anything that doesn't look right through the GitHub Issues page or in <#1381661424727883898>.

Available now through the Obsidian Community Plugins updater or GitHub.

Happy reading!
