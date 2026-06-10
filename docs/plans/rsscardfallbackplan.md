# RSS Dashboard — Missing Cover Image Fix Plan

> **Plugin:** `obsidian-rss-dashboard`
> **Issue:** Feeds without cover images fire `404` requests for `undefined` URLs, causing network lag and layout reflow as cards resolve their image state after initial render.
> **Strategy:** Fix the upstream `undefined` URL bug by filtering out invalid URLs during parsing. For articles that legitimately have no image, implement a fallback mechanism to use the feed's favicon/icon as the card image instead of leaving it blank.

---

## Step 1 — Detect and filter invalid images in the Parser

**File:** `src/services/feed-parser/feed-parser-class.ts` or related image extraction helpers.

**What to do:**
Currently, our parser is emitting `<img src='undefined' />` when the feed lacks an image. We need to add strict filtering when assigning `item.image` or `item.coverImage`. If the extracted string is `"undefined"`, `"null"`, empty, or a non-URL, it should be nullified.

## Step 2 — Fallback to Feed Icon in the Parser or Component

**File:** `src/services/feed-parser/feed-parser-class.ts` (if setting `coverImage`) or the UI Component rendering the card.

**What to do:**
When an article has no valid `coverImage`, we should fall back to the feed's icon.

- `FeedParser.parseFeed` already resolves the feed's icon into `newFeed.iconUrl`.
- We can assign `item.coverImage = feed.iconUrl` (or keep a new field `fallbackIcon`) during parsing.
- Alternatively, we update the card rendering component (`ArticleCard.svelte` or equivalent) to use `article.feedIconUrl` if `article.coverImage` is empty or invalid.

## Step 3 — Apply Styling for Favicon Fallback

**File:** `src/styles/` or the component styles.

**What to do:**
A favicon/icon is likely square and lower resolution than a hero image.

- Apply `object-fit: contain` or `object-fit: scale-down` instead of `cover` if the image is a fallback icon.
- Ensure the background of the image container matches the card or has a neutral styling so the icon looks natural and not awkwardly stretched.

## Step 4 — Verification

- Feeds with hero images should still display the hero image normally.
- Articles without hero images (like some NPR articles) should display the feed's favicon.
- The DOM should not contain any `<img src="undefined">` tags. No 404 network errors should occur.
