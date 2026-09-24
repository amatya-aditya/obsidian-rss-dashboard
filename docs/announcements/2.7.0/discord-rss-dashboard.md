# RSS Dashboard 2.7.0 — RSS Dashboard Discord

Published: 2026-09-23
Platform: RSS Dashboard Discord
Release: 2.7.0

---

Hey all! RSS Dashboard **2.7.0** is now available! 🎉

This release has been a big one behind the scenes, with a focus on **bringing your reading history with you, protecting your data, and making everyday reading and organization a little nicer.**

# Highlights

## ⭐ Import your starred articles

You can now bring starred articles into RSS Dashboard from **Inoreader, FreshRSS, and other supported Google Reader-compatible `starred.json` exports**.

Preview everything before importing, keep exported labels as tags, choose which articles to bring over, and automatically create feeds you don't already follow.

Find **Import starred articles** in the command palette, **Settings → Import/Export**, or **Manage Feeds** in the sidebar.

## 🖼️ Image lightbox

Click or tap an image in the Reader to open it full size with **zoom and pan**.

## 🎧 Reading, listening, and organizing

- Podcasts now use a simpler episode list with cleaner mobile controls.
- New **Date > Feed** and **Folder > Feed** grouping options give you more ways to organize the Dashboard.
- You can now choose whether **starred, saved, tagged, and unread articles** are protected from automatic cleanup.
- Starring and tagging are now independent—starring an article no longer automatically adds a **Favorite** tag.

## 🛡️ Safer storage

2.7.0 includes several important storage and sync fixes designed to better protect article state, recover from missing or corrupted shard files, improve backups, and make it clearer where your RSS Dashboard data is stored.

### Important storage notice

**Legacy JSON and Shard storage v1 are now deprecated and will become read-only in RSS Dashboard 3.0.**

If you're still using either mode, please switch to **Shard storage v2** from **Settings → Storage** before upgrading to 3.0.

# Also new: What's New

You may have noticed something different after updating: **RSS Dashboard now has a What's New popup!**

We'll use it to give you a short, friendly overview of the most important changes after major updates. You can reopen it any time from **Settings → About**.

There are plenty of additional fixes and smaller improvements in this release, so check out the full release notes and changelog if you'd like to dig deeper.

**Release:** https://github.com/amatya-aditya/obsidian-rss-dashboard/releases/tag/2.7.0  
**Release notes:** https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/docs/releases/2.7.0.md  
**Changelog:** https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/CHANGELOG.md

As always, please report bugs, feature requests, or anything that doesn't look right through the GitHub Issues page or in <#1381661424727883898>.

Available now through the Obsidian Community Plugins updater or GitHub.

Happy reading!
