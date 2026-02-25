# IDE Prompt: Kagi Smallweb Discovery Page

## Context

You are working on an Obsidian RSS plugin that includes a **Discover page** — a card-based UI for browsing and subscribing to curated RSS feeds. Each card displays a feed's title, summary, image, tags, type, and domain metadata. The plugin uses Obsidian's `requestUrl` API for all network requests (no native `fetch`).

Before writing any code, **export your complete implementation plan** to:

```
docs/plans/kagi-smallweb-discovery.md
```

Include in the plan: architecture decisions, component breakdown, data flow diagram (text-based), edge cases, and a phase checklist you will tick off as you go.

---

## Goal

Build a **standalone Kagi Smallweb page** that surfaces recently active small web posts as discovery cards. This is a "what's live right now" feed, not a static catalog. It is visually and architecturally separate from the main Discover page but shares its card CSS. Users can subscribe to any feed directly from this page.

---

## Phase 1 — Audit & Plan

### 1.1 Read the codebase first

Before touching any files:

- Read the existing `Discover` page component in full
- Identify the exact CSS classes used for: the page container, card grid, individual cards, card image, card title, card summary/description, tag chips, type badge, header bar, and dropdown menus
- Identify where and how `requestUrl` is called for feed fetching
- Identify the subscribe/add-feed action and how it is triggered and what parameters it takes
- Identify the existing header bar structure — specifically where dropdown menus are rendered and what component or element wraps them

Document all of this in `docs/plans/kagi-smallweb-discovery.md` before proceeding.

### 1.2 Understand the Kagi Smallweb API

The live feed endpoint is:

```
https://kagi.com/api/v1/smallweb/feed?limit=50
```

Key facts:

- This is a **free, unauthenticated** API endpoint — no API key required
- Returns an **Atom XML feed** (not JSON)
- Refreshed every ~5 hours by Kagi
- Supports a `?limit=` query parameter (confirmed via GitHub issue #279)
- Each `<entry>` contains: `<title>`, `<link>`, `<author><name>`, `<updated>`, and `<content>` or `<summary>` with the post excerpt
- The **author name** typically corresponds to the blog/site name
- The **link href** is the individual post URL; the blog root URL must be derived from it (strip path)
- There is no category or tag metadata in the feed entries themselves

Document the parsed field mapping in your plan.

---

## Phase 2 — Create the Standalone Page File

### 2.1 File location

Create a **new standalone file** for this feature. Do not modify the existing Discover page file. Suggested path:

```
src/views/KagiSmallwebView.ts   (or .tsx / .svelte / match the existing file convention)
```

Mirror the file structure and export pattern of the existing Discover page view so it integrates cleanly with whatever view registration system the plugin uses.

### 2.2 Page structure

The page should have three sections stacked vertically:

**Header bar**

- Title: "Smallweb" with the Kagi logo inline (use the SVG from `https://kagi.com/favicon.ico` or a simple text fallback "✦ Kagi Smallweb")
- Subtitle text: _"Recently published posts from independent blogs, curated by Kagi. Refreshed every 5 hours."_
- A "Refresh" button that re-fetches the feed on demand
- A live timestamp showing when the feed was last fetched, formatted as "Updated X minutes ago"
- A search/filter input (see Phase 4)

**Card grid**

- Reuse the exact same CSS grid class from the Discover page
- Cards rendered from parsed Atom feed entries (see Phase 3)

**Footer**

- Attribution line: "Feed data from [Kagi Small Web](https://kagi.com/smallweb) · [Browse all ~5,000 feeds](https://kagi.com/smallweb/opml)"

---

## Phase 3 — Fetch & Parse the Atom Feed

### 3.1 Fetching

Use `requestUrl` from the Obsidian API — not native `fetch`. Example pattern:

```typescript
import { requestUrl } from "obsidian";

const response = await requestUrl({
  url: "https://kagi.com/api/v1/smallweb/feed?limit=50",
  method: "GET",
});
const xmlText = response.text;
```

Default to `limit=50` on initial load. This keeps the payload small and fast.

### 3.2 XML parsing

Use the browser's built-in `DOMParser` to parse the Atom XML — do not add any new npm dependencies for this:

```typescript
const parser = new DOMParser();
const doc = parser.parseFromString(xmlText, "text/xml");
const entries = Array.from(doc.querySelectorAll("entry"));
```

### 3.3 Data model

Parse each entry into this interface:

```typescript
interface SmallwebEntry {
  postTitle: string; // <title> text content
  postUrl: string; // <link href="..."> or <link rel="alternate">
  blogName: string; // <author><name> text content
  blogUrl: string; // derived: strip path from postUrl to get root domain URL
  updatedAt: Date; // parsed from <updated>
  excerpt: string; // <summary> or <content> text, stripped of HTML tags, truncated to 200 chars
  domain: string; // extracted hostname e.g. "hamvocke.com"
}
```

For `excerpt`: strip all HTML tags using a regex or `innerHTML`/`textContent` trick, then truncate to 200 characters with an ellipsis. Never display raw HTML in the card.

For `blogUrl`: use `new URL(entry.postUrl).origin` — this gives you the clean root domain.

### 3.4 Caching

Cache the last-fetched result in memory (component state) with a timestamp. On re-render or re-open, if the cache is less than 5 minutes old, do not re-fetch — just re-render from cache. Show the cached timestamp in the header. This avoids hammering the API on every view open.

Do not persist the cache to disk.

---

## Phase 4 — Render Cards

### 4.1 Card structure

Each card must use the **exact same CSS classes** as the existing Discover page cards. Do not create new CSS classes for the card shell, grid, or layout — inherit everything. Only add new CSS if something truly has no equivalent (e.g. the "live" indicator badge).

Map the `SmallwebEntry` fields to card slots as follows:

| Card slot                | Source field                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| Card title               | `blogName` (the blog, not the post title)                                      |
| Card description/summary | `excerpt` (the post excerpt)                                                   |
| Card image               | None — use a generated fallback (see 4.2)                                      |
| Primary tag chip         | `domain` (e.g. "hamvocke.com")                                                 |
| Secondary tag chip       | Relative time string (e.g. "2 hours ago")                                      |
| Type badge               | "Smallweb" — use a distinct color if the badge supports it                     |
| Post title sub-line      | `postTitle` rendered in smaller text below the blog name                       |
| Subscribe button         | Triggers the existing subscribe/add-feed action with `blogUrl` as the feed URL |

The subscribe button label should be **"+ Follow Blog"**.

### 4.2 Image fallback

Since the Kagi API provides no images, generate a simple deterministic avatar for each card:

- Use the first letter of `blogName` as the character
- Generate a background color by hashing `domain` to one of 8–10 muted pastel hues
- Render as a square `<div>` with centered text in the same dimensions as the card image slot
- This should feel like a "letter avatar" (similar to Google Contacts / Notion avatars)

Do not fetch any external images for the cards.

### 4.3 Loading & error states

- **Loading**: Show a grid of skeleton cards (same dimensions as real cards, pulsing opacity animation) while the fetch is in progress. Aim for 6 skeletons in the grid.
- **Error**: Show a single centered error card with the message "Could not load Kagi Smallweb feed. Check your internet connection." and a Retry button.
- **Empty**: Should not occur with this API, but if `entries.length === 0`, show "No posts found."

---

## Phase 5 — Search & Filter

Add a search input in the page header. It should filter the rendered cards in real time (no re-fetch) against these fields: `blogName`, `domain`, `postTitle`, `excerpt`.

Requirements:

- Case-insensitive substring match
- Debounce input by 150ms before filtering
- Show a "X results" count below the search bar when a query is active
- Clearing the search restores all cards
- Match the visual style of any existing search inputs in the plugin; if none exist, use a simple styled `<input type="text">` with placeholder "Search blogs and posts…"

---

## Phase 6 — Entry Point in the Discover Header

### 6.1 Navigation button

Add a navigation button/link to the existing **Discover page header**, placed next to the existing dropdown menus.

- Label: **"✦ Smallweb"** (or use an appropriate icon if the plugin uses an icon system)
- Clicking it opens the `KagiSmallwebView` — match whatever navigation/routing pattern the plugin already uses to switch between views (do not add a new pattern)
- The button should be visually consistent with the existing header controls — same height, font, and spacing as the dropdowns next to it
- Do not restructure or reorder any existing header elements; only append the new button

### 6.2 Back navigation

The Kagi Smallweb page should have a **"← Discover"** back link in its own header that returns to the main Discover page using the same navigation pattern.

---

## Phase 7 — Subscribe Flow

When the user clicks **"+ Follow Blog"** on a card:

1. Call the existing subscribe/add-feed function with `blogUrl` (the blog root URL, not the individual post URL)
2. After a successful subscribe, change the button on that card to a disabled **"✓ Following"** state
3. If the feed URL is already subscribed (check against existing feeds), show the button as **"✓ Following"** immediately on render — do not allow duplicate subscribes
4. If the subscribe fails, show a brief inline error on the card: "Could not add feed. Try subscribing manually."

Do not show any modal or confirmation dialog — keep it a single-click action.

---

## Phase 8 — Polish & Edge Cases

Address the following before considering the feature complete:

- **CORS**: `requestUrl` bypasses CORS in Obsidian's environment — confirm this works and document it in your plan
- **Large excerpts**: Some Atom `<content>` fields may contain thousands of words. Always truncate at 200 chars regardless of source length
- **Malformed entries**: Wrap per-entry parsing in a try/catch — if an entry fails to parse, skip it silently and continue
- **blogUrl derivation edge cases**: Some post URLs may be subdomains (e.g. `user.bearblog.dev`). Use the full origin including subdomain, not just the apex domain
- **Feed entries with no author**: Fall back to the domain name as `blogName` if `<author><name>` is absent
- **Repeated blog appearances**: The same blog may appear multiple times in the feed (multiple recent posts). Render each post as its own card — do not deduplicate. Users should see the blog's activity level
- **Mobile/narrow pane**: Ensure the card grid degrades gracefully to 1–2 columns in narrow Obsidian panes. Use the same responsive breakpoints as the Discover page

---

## Constraints

- **Do not modify** the existing Discover page logic, layout, or CSS beyond adding the navigation button in Phase 6
- **Do not add** new npm dependencies — use only what is already in `package.json` plus browser-native APIs
- **Do not use** native `fetch` — use `requestUrl` exclusively for network calls
- **Do not store** any feed data to disk or Obsidian vault
- All new UI must be dark-mode compatible if the existing plugin supports dark mode
- All new files must follow the existing code style (TypeScript strictness level, import ordering, naming conventions — check existing files)

---

## Deliverables Checklist

- [ ] `docs/plans/kagi-smallweb-discovery.md` — implementation plan exported before coding begins
- [ ] `src/views/KagiSmallwebView.ts` (or equivalent) — standalone page file
- [ ] Navigation button added to Discover header
- [ ] Atom feed fetched and parsed via `requestUrl` + `DOMParser`
- [ ] Cards rendered with correct CSS inheritance and letter avatars
- [ ] Search/filter working with debounce
- [ ] Loading skeletons and error state implemented
- [ ] Subscribe flow working with duplicate detection
- [ ] Back navigation implemented
- [ ] All edge cases from Phase 8 handled
- [ ] No regressions on existing Discover page
