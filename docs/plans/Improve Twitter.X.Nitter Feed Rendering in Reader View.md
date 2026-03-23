## Improve X/Twitter/Nitter Feed Rendering (Reader View)

### Summary
Make Nitter items read cleanly in the RSS Reader by (1) using a compact author/handle/date title in the Reader (only), (2) rendering a single properly-formatted tweet body (no “Feed description” callout), and (3) replacing Nitter “tweet stats” markup with a compact icon row when present.

### Key Changes
- **Reader-only title override (Nitter items)**
  - Add `isNitterItem(item)` detection using `item.feedUrl` and/or `item.link` hostname (treat any host containing `nitter` as Nitter).
  - Add `formatNitterReaderTitle(item)` that outputs `Name (@handle) · YYYY-MM-DD`:
    - `handle`: prefer `item.author` if it looks like `@...`, else extract `@...` from `item.feedTitle`.
    - `name`: derive from `item.feedTitle` by removing the handle and common separators (`/`, `|`, parentheses).
    - `date`: `new Date(item.pubDate)` → ISO date `YYYY-MM-DD` (stable, no locale dependence).
  - Use that title in `src/views/reader-view.ts` for:
    - Header bar title (`this.titleElement`)
    - Reader H1 (`.rss-reader-item-title`)
    - View tab title (`getDisplayText()`)

- **Single tweet body, correct formatting, no feed description (Nitter items)**
  - Ensure Nitter items don’t show the description callout:
    - In `renderArticle(...)`, if `isNitterItem(item)`, skip the “Feed description” `<details>` section entirely.
  - Choose the best tweet HTML for the main body:
    - Prefer `item.description` when it contains richer formatting cues (`<br`, `<p`, `<blockquote>`, `<img>`) and/or is longer than `item.content`.
    - Otherwise fall back to `item.content`, then `fullContent`.
  - Avoid pointless full-page fetches for Nitter:
    - Update `isFeedContentPreferredHost(...)` in `src/views/reader-view.ts` to include Nitter hosts so `displayItem()` won’t try to fetch full article HTML for Nitter links and will reliably use feed HTML.

- **Stats icons (best-effort, when present)**
  - In `populateArticleHtml(...)`, when rendering Nitter content:
    - Parse the HTML and look for a “stats” container (e.g. `.tweet-stats`) or any occurrences of Nitter stat marker classes (`icon-comment`, `icon-retweet`, `icon-heart`, `icon-views`).
    - Replace that section with plugin-owned markup:
      - `<div class="rss-nitter-stats">` containing 4 stat “pills” with an icon placeholder + count.
    - After injecting HTML, call `setIcon(...)` on the placeholders to render Obsidian/Lucide icons (comment/retweet/heart/views).

- **Styling**
  - Add minimal styles to `src/styles/reader.css` for:
    - `.rss-nitter-stats` (horizontal row, small font, muted color, spacing)
    - `.rss-nitter-stat-icon` sizing/alignment to match existing reader typography

- **Changelog**
  - Add an entry to `CHANGELOG.md` describing:
    - Reader-only compact Nitter title
    - Single formatted tweet body + no description callout
    - Stats icon row when present

### Test Plan
- **Unit tests (Vitest + jsdom)**
  - Add a new test file (recommended) `test_files/unit/reader-view-nitter.test.ts`:
    - Title: given a Nitter `FeedItem` with `feedTitle="Name / @handle"` and a long tweet `item.title`, assert:
      - Header title + H1 + `getDisplayText()` use `Name (@handle) · YYYY-MM-DD`
    - Body: given `description` containing `<br><br>` and `content` containing equivalent text without `<br>`, assert:
      - No `.rss-reader-description-callout` is rendered
      - `.rss-reader-article-content` contains the `<br>` formatting from `description`
    - Stats: given content HTML containing a stats div / icon-* classes, assert:
      - The rendered DOM includes `.rss-nitter-stats`
      - Icon placeholders receive `dataset.icon` values via the stubbed `setIcon`

### Assumptions / Defaults
- Apply the compact title **only inside Reader view**; dashboard/list titles remain the original tweet text.
- Title date uses **ISO `YYYY-MM-DD`** derived from `pubDate`.
- Tweet stats rendering is **best-effort**: only transform when recognizable markup exists; otherwise render nothing extra (no new network calls).
