# RSS Dashboard 2.7.0 — Reddit

Published: 2026-09-25
Platform: Reddit
Release: 2.7.0

---

**Title:** RSS Dashboard 2.7.0 — import your starred articles from Inoreader/FreshRSS, image lightbox, safer storage + more

Hi Reddit! We just released **RSS Dashboard 2.7.0**, with a fairly large set of updates focused on portability, data safety, and making the reading experience a little nicer.

For anyone unfamiliar with it, RSS Dashboard is a free, open-source RSS reader built directly inside Obsidian.

### ⭐ Import your starred articles

The biggest addition in 2.7.0 is **Import starred articles**.

You can now bring starred items over from **Inoreader, FreshRSS, and other supported Google Reader-compatible `starred.json` exports**.

Before anything is imported, you can preview the articles by source feed, choose exactly what you want to keep, preserve exported labels as tags, and automatically create feeds you aren't already subscribed to.

Imported articles initially use the content included in the export, with a **Fetch now** option in the Reader if you want RSS Dashboard to retrieve the full article.

### 🖼️ Full-size image viewing

Click or tap any image in the Reader to open it in a full-resolution lightbox with zoom and pan.

### 🎧 Reading and organization improvements

2.7.0 also adds:

- A simpler podcast episode list with improved mobile controls
- New **Date > Feed** and **Folder > Feed** grouping options
- Controls for choosing whether **starred, saved, tagged, and unread articles** are protected from automatic cleanup
- Independent stars and tags — starring an article no longer automatically creates a `Favorite` tag
- A new **What's New** summary after major updates

There are also quite a few storage, backup, sync, feed parsing, sidebar, and refresh fixes underneath all of this.

### ⚠️ Storage change coming in 3.0

One important heads-up for existing users:

**Legacy JSON and Shard storage v1 are now deprecated and will become read-only in RSS Dashboard 3.0.**

If you're still using either mode, migrate to **Shard storage v2** under **Settings → Storage** before upgrading to 3.0.

### More details

Full 2.7.0 release notes:  
https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/docs/releases/2.7.0.md

GitHub release:  
https://github.com/amatya-aditya/obsidian-rss-dashboard/releases/tag/2.7.0

Repository:  
https://github.com/amatya-aditya/obsidian-rss-dashboard

The project remains free, open source, and ad-free. Feedback, bug reports, and feature ideas are always welcome.

Happy reading!
