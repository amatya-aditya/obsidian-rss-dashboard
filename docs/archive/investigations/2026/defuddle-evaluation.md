# Defuddle evaluation (vs current article/podcast parsing)

Date: 2026-03-15

This note compares [kepano/defuddle](https://github.com/kepano/defuddle) with the current parsing/extraction/sanitization paths in this plugin, and recommends whether to adopt it (especially with a future YouTube metadata/description utility in mind).

## Executive summary

- **Podcast show notes:** Defuddle is **not a replacement** for our current approach. Podcast show notes are already in-feed HTML; the main need is **safe rendering** (sanitization), which we handle with a strict allowlist (`src/utils/safe-html.ts`).
- **Article “reader mode” / saved-article content:** Defuddle is **plausibly a better long-term option** than `@mozilla/readability` + ad-hoc cleanup + `turndown`, but it’s not a drop-in swap in our current environment (we parse fetched HTML via `DOMParser`, without loading page CSS).
- **Recommendation:** Don’t rewrite everything immediately. If we adopt Defuddle, do it as an **optional content-extraction backend** (A/B behind a setting or internal flag), and use the adoption to **factor shared utilities** used by both article viewing and article saving.

## What Defuddle is

Defuddle is a content extraction library from the creator of Obsidian (kepano). It’s designed to “defuddle” messy web pages into clean, readable output. Key points from the project docs:

- **Purpose:** Extract main content + metadata from a web page and optionally output **Markdown**.
- **Approach:** It’s positioned as an alternative to Mozilla Readability with additional heuristics and “standardization” of HTML structure.
- **Outputs:** Can return cleaned HTML plus extracted metadata; the “full” bundle also supports Markdown conversion (and some math handling).
- **Used in an official Obsidian project:** Obsidian Web Clipper has release notes referencing updates to Defuddle and moving extraction logic into shared utilities.

Links:

- Defuddle repo: https://github.com/kepano/defuddle
- Defuddle playground/docs: https://kepano.github.io/defuddle/
- Obsidian Web Clipper releases (mentions Defuddle + shared utils): https://github.com/obsidianmd/obsidian-clipper/releases

### Bundles + outputs (implementation detail)

Defuddle ships multiple bundles intended for different environments/use-cases:

- `defuddle/core`: extraction + standardization (no Markdown conversion)
- `defuddle/node`: node-oriented bundle (includes node-specific pieces like JSDOM)
- `defuddle/full`: includes additional features (notably Markdown conversion)
- `defuddle/full/node`: “full” features + node bundle

If we adopt Defuddle in this plugin, the likely question is whether we want:

- **Defuddle HTML output + our existing `turndown` rules**, or
- **Defuddle’s own Markdown output**, and how its output compares with our `turndown`-based Markdown in real feeds/pages.

## Security note

Defuddle is **not a sanitizer**. Regardless of extractor, anything fetched from the web should still be treated as untrusted.

Also, Defuddle had at least one npm advisory for XSS/injection issues in older versions (fixed in `0.9.0`). If we adopt it, we should:

- Pin Defuddle to a **patched** version (`>= 0.9.0`), and preferably track upstream releases.
- Continue to sanitize or render safely (e.g., avoid `innerHTML` in UI; convert to Markdown where appropriate; use allowlist sanitization for any HTML we do inject).

Advisory reference:

- https://advisories.gitlab.com/pkg/npm/defuddle/CVE-2026-30830/

## Current architecture in this plugin (as of 2.3.0-alpha.2)

This repo currently has **separate** parsing/extraction paths for different media types and even for “article viewing” vs “article saving”.

### Feed parsing (XML → `FeedItem`)

- Primary: `src/services/feed-parser.ts`
  - Parses RSS/Atom/JSON feeds.
  - Normalizes common fields (e.g., `content:encoded`, `itunes:*`, enclosure).
  - Does light cleanup (e.g., CDATA cleanup, text sanitization for some fields), but it is **not** a web-page readability extractor.

### Article reader view (web page → readable HTML → Markdown)

- `src/views/reader-view.ts`
  - Fetches article HTML (`robustFetch`), parses into a `Document` via `DOMParser`.
  - Extracts “readable” content with `@mozilla/readability` (with fallbacks to `main/article/...` selectors, then `doc.body`).
  - Converts extracted HTML to Markdown with `turndown`.
  - Performs URL normalization (e.g., converting relative URLs in content).

### Article saving (web page → cleaned HTML → Markdown + template/frontmatter)

- `src/services/article-saver.ts`
  - Has its own fetch + extraction and its own HTML cleanup rules (removing scripts/ads/svg, normalizing links, table classing, etc.).
  - Uses `@mozilla/readability` and `turndown`.
  - Generates frontmatter and applies user templates.

Observation: **Reader-view and ArticleSaver duplicate responsibilities** (fetching full page content, extracting main content, cleaning HTML, converting to Markdown). This is the strongest argument for shared utilities regardless of Defuddle adoption.

### Podcast playback (feed item → select notes HTML → sanitize render)

- UI: `src/views/podcast-player.ts`
  - Picks show notes HTML with a clear precedence (`content` → `description` → `itunes.summary` → `summary`).
  - Renders show notes by **sanitizing and appending** (does not use `innerHTML`).
- Sanitization: `src/utils/safe-html.ts`
  - Very strict allowed tag list and safe-`href` handling.

This is intentionally different from article extraction: podcasts don’t need “readability” extraction; they need safe display of in-feed HTML.

## Would Defuddle be “better” than our current article parser?

For article pages, Defuddle is the most relevant comparison point.

Potential benefits (in principle):

- **Cleaner extraction**: Upstream focus is specifically on readable content extraction and structure standardization.
- **Metadata**: Centralized extraction of title/author/date/etc may reduce our site-specific heuristics.
- **Markdown output**: If Defuddle’s Markdown conversion produces more consistent output than `turndown` alone, it may reduce post-processing and “quirky” Markdown.

Important constraints (in this plugin’s environment):

- Our current reader/saver flows parse fetched HTML with `DOMParser` in an isolated document. Defuddle’s docs mention using page “mobile styles” to improve extraction; if that relies on computed styles from loaded CSS, we may not get the full benefit without additional work (e.g., rendering in a hidden frame/JSdom context with CSS loading, which is expensive and brittle).
- We already have a large set of “hardening” behavior around article extraction:
  - blocked/challenge detection
  - fallbacks when Readability returns low-signal content
  - URL normalization (especially images and `srcset`)
  - template/frontmatter generation
  Any Defuddle integration should preserve these behaviors or provide equivalents.

Net: Defuddle looks promising, but “better” depends on running real-world samples through both pipelines in *our* execution context.

## Would Defuddle be “better” than our current podcast parser?

Mostly no, because the “podcast parser” here is not trying to extract readability content from a web page.

- Podcast show notes come from feed fields (`content:encoded`, `description`, `itunes:summary`).
- The key risk is malicious HTML in feeds; Defuddle is not meant to be an HTML sanitizer.
- Our current sanitizer (`src/utils/safe-html.ts`) is intentionally restrictive and appropriate for in-app rendering.

If anything, Defuddle could only help with podcast show notes if we wanted to:

- Convert feed HTML → Markdown for “save episode notes” workflows, or
- Normalize/standardize messy show notes HTML before converting to Markdown.

But that should be evaluated as a **separate** feature and still requires sanitizer-safe rendering when in HTML form.

## Recommendation: adopt Defuddle as a backend, and factor shared utilities

### 1) Don’t rewrite everything immediately

Start with a “spike” integration for **articles only**:

- Add Defuddle as an optional extractor in a new shared module (see below).
- Run a small corpus of real web pages through:
  - current pipeline (`Readability` + our cleanup + `turndown`)
  - Defuddle pipeline (Defuddle HTML/Markdown output)
- Compare:
  - extraction success rate (non-empty, meaningful content)
  - Markdown cleanliness (headings, lists, code blocks, links, images)
  - performance (time + memory in Obsidian/Electron)

### 2) Create shared content utilities regardless (helps YouTube too)

Even if we keep Readability for now, we should converge on shared “content pipeline” helpers used by:

- `src/views/reader-view.ts` (reader mode)
- `src/services/article-saver.ts` (saving to vault)
- a future `src/services/youtube-metadata.ts` (or similar)

Suggested shape (conceptual, not implemented here):

- `ContentFetcher`: fetch HTML with consistent headers + retry + blocked-page detection
- `MainContentExtractor`: interface with implementations:
  - `ReadabilityExtractor` (current)
  - `DefuddleExtractor` (optional)
- `HtmlStandardizer`: remove noise, normalize links, convert relative URLs, handle images/srcset
- `HtmlToMarkdown`: wrapper around `turndown` rules (and/or Defuddle markdown output)
- `SafeHtmlRenderer`: use `sanitizeAndAppendHtml` for any UI that renders HTML

This reduces duplication and gives us a clean place to plug in YouTube “description → Markdown” or “watch page → extracted description + metadata”.

### 3) Keep sanitizer responsibilities separate

Treat content extraction and HTML sanitization as separate layers:

- Defuddle/Readability: “what is the main content?”
- Sanitizer (`safe-html.ts`) / Markdown conversion: “how can we render/store it safely?”

## YouTube: how Defuddle fits (and doesn’t)

YouTube’s RSS feeds already provide usable title/date/link; “description” quality varies.

For a future YouTube episode-like details view, you likely want:

- channel, published date, duration
- description (preferably in Markdown)
- maybe tags/categories, and thumbnails

Options:

1. **YouTube Data API**: best quality metadata, but requires user API key / auth story.
2. **Scrape the watch page**: no API key, but brittle. An extractor like Defuddle *might* help, but YT pages are highly scripted and change often.

Recommendation: design the YouTube utility around a **pluggable data source** (API first where available, scraping fallback), and keep output rendering on the “safe” path (Markdown preferred; any HTML strictly sanitized).
