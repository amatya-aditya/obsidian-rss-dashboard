# iOS Full-Article Fetch Failure

## Description
When RSS feeds (such as Psychology Today) only provide a short summary, the plugin falls back to fetching the full HTML and parsing it with Readability. This works on Desktop and Android, but consistently fails on iOS.

## Symptoms
- **Substack:** Works on iOS (full content provided via `content:encoded`).
- **Psychology Today:** Only loads summary on iOS; full content on Desktop/Android.

## Investigation & Attempted Fixes
1. **XML Namespace Parsing:** Updated `feed-parser.ts` to use `getElementsByTagNameNS`. Fixed Substack; Psychology Today still fails on iOS.
2. **User-Agent Spoofing:** Added a desktop Chrome User-Agent header to `fetchFullArticleContent`. Did **not** resolve the iOS issue — iOS `requestUrl` ignores/overrides custom headers at the OS level.

## Root Cause
On iOS, Obsidian runs inside a WKWebView/Capacitor shell. Apple's `URLSession` networking layer:
1. **Strips/overrides the `User-Agent` header** regardless of what the JS layer passes.
2. Presents a native-iOS UA to the remote server, which Cloudflare and other WAFs detect as bot-like or mobile-blocked, returning a challenge page (`"Just a moment..."`) instead of article content.

## Solution (Implemented)
A **tiered fetch-with-proxy-fallback** system in `src/utils/fetch-helpers.ts`:

1. **Direct fetch** via `robustFetch` — the existing path, unchanged for Desktop/Android.
2. **Blocked response detection** (`isBlockedResponse`) — checks for Cloudflare challenge markers, WAF "Access Denied" pages, and very short/empty responses.
3. **Proxy retry** — if the direct fetch is blocked and the user has enabled the CORS proxy in settings, the article URL is re-fetched via the configured proxy base URL.

### Settings
A new **"Proxy"** section has been added to the General settings tab with:
- **Enable CORS proxy** — toggle (off by default)
- **Proxy URL** — text input (e.g. `https://api.allorigins.win/raw?url=`), visible only when the toggle is on

### Files Changed
- `src/types/types.ts` — added `corsProxyEnabled`, `corsProxyUrl` to settings interface and defaults
- `src/utils/fetch-helpers.ts` — **new**: `isBlockedResponse`, `fetchWithProxyFallback`
- `src/views/reader-view.ts` — refactored `fetchFullArticleContent` to delegate to `fetchWithProxyFallback`
- `src/services/article-saver.ts` — same refactor; accepts optional `corsProxyUrl` in constructor
- `src/views/dashboard-view.ts` — passes proxy URL to `ArticleSaver` at instantiation
- `src/settings/settings-tab.ts` — Proxy section added to General tab
- `test_files/unit/fetch-helpers.test.ts` — 17 unit + integration tests

## Next Steps
- User to enable the proxy in plugin settings on iOS and test Psychology Today.
- Check the Obsidian developer console for `[RSS Dashboard]` log messages confirming which fetch path was used.
- If `allorigins.win` is slow, consider self-hosting a lightweight proxy (e.g. Cloudflare Worker acting as a relay).
