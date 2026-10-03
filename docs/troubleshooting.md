# Troubleshooting & FAQ

Common issues and solutions for RSS Dashboard.

## Feed Issues

### Feed not loading or updating

**Problem:** A feed appears in your list but articles don't load or update.

**Solutions:**
1. Check that the feed URL is correct and accessible
2. Try refreshing the feed manually (use the refresh icon or command palette)
3. Some feeds require authentication—verify the URL is for a public feed
4. Check your internet connection
5. Some feeds may have rate limiting—wait a few minutes and try again

### "Invalid feed URL" error

**Problem:** You get an error when trying to add a feed.

**Solutions:**
1. Verify the URL starts with `http://` or `https://`
2. Make sure the URL is actually a valid feed URL (RSS, Atom, JSON)
3. Try pasting the website URL instead; RSS Dashboard will attempt to auto-discover the feed
4. Check that the URL doesn't have typos or extra spaces

### Feed URL is malformed error

**Problem:** "Feed URL is malformed" when using URI subscription.

**Solutions:**
1. Ensure the feed URL is properly URL-encoded (spaces → %20, etc.)
2. Use this URI format: `obsidian://rss-dashboard?action=add-feed&url=<encoded-url>`
3. Test the URL in a browser first to confirm it's accessible

## YouTube Feeds

### YouTube feeds not working

**Problem:** YouTube channel/playlist feeds aren't loading content.

**Solutions:**
1. Verify you're using a valid YouTube channel, user, or playlist URL
2. Try using the channel ID instead of a custom vanity URL
3. Some channels have disabled RSS feeds—check the channel settings
4. YouTube feed fetching is currently limited; typically around 15 YouTube feeds can be active at once
5. If still failing, try re-adding the channel URL

### YouTube videos don't play

**Problem:** Embedded YouTube videos don't play in the reader.

**Solutions:**
1. Check your internet connection
2. YouTube embeds use Privacy Enhanced Mode—ensure you're not blocking `youtube-nocookie.com`
3. Try clicking the "Watch on YouTube" link to open in your browser
4. Some older videos may have restricted embedding—these must be opened in YouTube directly

## Podcasts & Media

### Podcast audio not playing

**Problem:** Podcast episodes don't play or audio is silent.

**Solutions:**
1. Verify the audio URL is accessible (try opening it in a browser)
2. Some podcasts require authentication—check if the feed needs login info
3. Your browser or Obsidian may be blocking audio—check security settings
4. Try a different podcast to confirm it's not a single-feed issue
5. Clear your browser cache if audio playback is stuck

### Media playback is slow

**Problem:** Videos or podcasts buffer or play slowly.

**Solutions:**
1. Check your internet connection speed
2. Try pausing and resuming playback
3. Lower video quality if available
4. Close other bandwidth-heavy applications
5. Try a different media file to isolate the issue

## Organization & Syncing

### Feeds disappeared after sync

**Problem:** Feeds vanish when syncing to a new device.

**Solutions:**
1. **Most common cause:** The plugin loaded before Obsidian Sync finished pulling data
   - On new devices: Wait for "Fully synced" message before enabling the plugin
   - Re-disable the plugin, wait 2 minutes, then re-enable it
2. Verify folder paths match exactly across all devices (Settings → RSS Dashboard → Storage)
3. Check that both `data.json` location and Storage folders are synced
4. Use Shard Storage v2 for better reliability with sync
5. See the detailed [Syncing Guide](./syncing.md) for step-by-step setup

### Storage location issues

**Problem:** "Folder names must match" error or data not syncing.

**Solutions:**
1. Check that storage folder names are identical on all devices
2. Avoid folder names starting with `.` (these are hidden)
3. Ensure the metadata storage location also uses the same folder naming
4. Use `rss-dashboard-data` instead of `.rss-dashboard-data`, for example

## Getting Help

Can't find a solution? Try these resources:

- **[GitHub Issues](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues)** — Report bugs or ask questions
- **[Discord Community](https://discord.gg/9bu7V9BBbs)** — Get real-time help from the community
- **[Getting Started Guide](./getting-started.md)** — Step-by-step walkthrough
- **[Documentation Hub](./README.md)** — All available guides and references

When reporting an issue, include:
- RSS Dashboard version (from Settings)
- Operating system
- The specific error message
- Steps to reproduce the issue
- Any relevant screenshots or logs
