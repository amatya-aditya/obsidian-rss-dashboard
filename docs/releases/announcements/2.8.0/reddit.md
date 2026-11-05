# RSS Dashboard 2.8.0 — Reddit

- Prepared: 2026-11-05
- Platform: Reddit
- Release: 2.8.0

---

**Suggested title:** RSS Dashboard 2.8.0 — read full articles in Obsidian, fetch covers, customize saved notes + more

Hi Reddit! **RSS Dashboard 2.8.0** has just been released! This release contains many new features and improvements, turning workflows that used to take extra steps into things you can do right inside Obsidian.

For anyone unfamiliar with it, RSS Dashboard is a free, open-source RSS reader built directly inside Obsidian.

### 📖 Read full articles without leaving Obsidian

Before today, RSS Dashboard only showed the article content that was supplied by the feed; reading the full webpage meant opening a browser and leaving Obsidian. Now the Reader can fetch the webpage in the background and you can switch between RSS and fetched content with a separate reading position for each version.

Saved-note templates now allow you to edit templates independently, choose a default, assign templates per feed, and configure folders and filename patterns. Choose whether a template saves RSS or fetched content, and use `{{contentSource}}` to record which version was saved.

### Card cover improvements

Before today, card covers came from the feed. Now you can fetch a cover from its source article, replace a missing or existing cover when the site provides one, or restore the feed's image. Use the button on a card to fetch its cover, or the dashboard toolbar button to fetch covers for cards on the current page. Already-fetched covers are skipped.

### Tag enhancements

Tags have received a major overhaul. Set default background and text colors under **Settings → Tags**, and choose from the **System**, **Vintage**, **Pastel**, and **High Contrast** palettes or use **Randomize**. Tags without individual colors inherit the defaults, and the **Edit tag** menu includes the new color options.

### 🎧 Podcast and media upgrades

- Podcast episodes whose descriptions include timestamps now have clickable chapter markers on the seek bar.
- If you have a sleep timer enabled, a colored preview bar shows how far playback will advance before the sleep timer stops it.
- Twitch VODs and live channels, plus YouTube embeds, now play in the Reader. **Video Focus mode** works with Twitch and YouTube.

### ✨ More in 2.8.0

- On phones and tablets, the new **Swipe between panels** setting lets you move between the sidebar, dashboard, and Reader with swipes. When enabled, it replaces Obsidian's swipe gestures inside the plugin's views.
- Adjust article title size, and choose whether cards animate while pressed.
- Startup is faster with large feed libraries, article-state changes appear sooner, and sync across devices is more reliable. Users with large feeds should notice a significant performance improvement.
- More keyboard and screen-reader support, improved feed and publisher handling, and cleaner saved article content.

### More details

- Full 2.8.0 release notes: https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/docs/releases/2.8.0.md
- GitHub release: https://github.com/amatya-aditya/obsidian-rss-dashboard/releases/tag/2.8.0
- Repository: https://github.com/amatya-aditya/obsidian-rss-dashboard

RSS Dashboard remains free, open source, and ad-free. Feedback, bug reports, and feature ideas are always welcome.

Happy reading!
