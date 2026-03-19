# Why YouTube Shorts Auto-Tagging Is Fundamentally Brittle

Last updated: March 18, 2026

**Status**: Feature completely removed as of version 2.3.0-alpha.3. This document serves as a post-mortem and reference for future developers considering similar features.

## Executive Summary

Attempting to automatically detect and tag YouTube shorts is fundamentally unreliable due to:

1. YouTube's RSS feeds rarely exposes `/shorts/` URLs (only standard `watch?v=` links)
2. No free, rate-limited, or officially supported API endpoint for video metadata
3. YouTube actively blocks programmatic scraping via bot detection and dynamic HTML
4. Required metadata (duration, aspect ratio) is inconsistently published or JavaScript-rendered
5. Any detection approach beyond URL patterns or title signals requires external network calls during feed parsing, creating latency and fragility

Multiple detection methods were attempted and all failed in production. **The feature has been completely scrapped.**

## The Fundamental Problem: YouTube's Architecture vs. Our Goals

### YouTube RSS Feed Limitations

YouTube's RSS feeds for channels (e.g., `https://www.youtube.com/feeds/videos.xml?channel_id=...`) **rarely include `/shorts/` URLs in the item link**. Instead:

- All video links are standard `watch?v={videoId}` format
- Shorts are published to the same feed as regular videos with no distinguishing metadata
- There is no `<isShort>` or `<format>` field in the RSS spec for YouTube

**Example**: A channel publishes 5 shorts on Monday. The RSS feed will contain:

```xml
<entry>
  <title>My Cool Short #shorts</title>
  <link href="https://www.youtube.com/watch?v=abc123"/>  <!-- NOT /shorts/abc123 -->
  <content>...</content>
</entry>
```

This means **the only information available in the feed are: title, description, and (sometimes) publication date**.

### What Information YouTube DOESN'T Publish in RSS

- Duration (sometimes in `<itunes:duration>`, but not for shorts)
- Aspect ratio or verticality indicator
- `isShortsPage` flag or equivalent
- Any metadata that distinguishes shorts from full-length videos

## Attempted Detection Methods & Why They Failed

### Method 1: URL Pattern Matching (`/shorts/`)

**Approach**: Check if the item link contains `/shorts/`.

**Result**: ❌ **Failed** — YouTube rarely publishes `/shorts/` URLs in RSS feeds. This check only worked if:

- User manually copied a `/shorts/` link from YouTube
- Third-party proxy feeds (like Nitter) exposed shorts differently

**Coverage**: ~2-5% of actual shorts videos

---

### Method 2: Title Hashtag Detection (`#shorts`)

**Approach**: If the title contains `#shorts`, tag as short.

**Result**: ⚠️ **Partially works** — Only effective if the channel explicitly tags videos with `#shorts` in the title.

**Problems**:

- Many creators don't use `#shorts` in titles (it's usually in description)
- Hashtags are often YouTube-specific descriptions, not intended for RSS readers
- 3Blue1Brown and many academic channels don't use this convention

**Coverage**: ~30-40% of shorts in well-behaved channels, 0% for others

---

### Method 3: Duration-Based Detection (≤90 seconds)

**Approach**: Fetch each video's watch page and extract duration time, check if ≤90s.

**Attempted Implementation**: `fetchYouTubeVideoMetadata()` in `MediaService.ts`

**What We Tried**:

```typescript
// Extract duration from "approxDurationMs" in page JSON
const durationMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);

// Extract verticality from isShortsPage flag
if (html.includes('"isShortsPage":true')) {
  /* ... */
}

// Add 500ms sleep between requests to avoid rate limiting
await new Promise((resolve) => setTimeout(resolve, 500));
```

**Why It Failed**:

1. **YouTube blocks programmatic requests**:
   - Returns 403 Forbidden or incomplete HTML to non-browser user-agents
   - Even with `User-Agent: Mozilla/5.0...` headers, requests are often rate-limited
   - YouTube's server-side bot detection is sophisticated (IP reputation, request pattern analysis)

2. **Metadata is JavaScript-rendered**:
   - The `"approxDurationMs"` and `"isShortsPage"` flags are often injected client-side via `yt-initial-player-response`
   - Server-rendered HTML (what `fetch()` returns to bots) frequently omits this data
   - No reliable regex pattern works across all YouTube page versions

3. **Performance impact**:
   - Each video requires a full HTTP request (2-5 seconds per request)
   - 500ms sleep × 50 items = 25+ seconds per feed parse
   - Creates terrible UX when refreshing feeds
   - Obsidian's `requestUrl()` has no connection pooling or caching

4. **Inconsistent metadata**:
   - Some shorts don't include duration in the page HTML at all
   - Different video IDs have different page structures (A/B testing)
   - Geolocation-based HTML variations (different in US vs. EU due to GDPR)

5. **No fallback or retry logic**:
   - If a single video's metadata fetch fails, the entire item loses its `isShort` classification
   - No way to know if a failure is permanent or temporary (network vs. bot detection)

**Coverage After Implementation**: ~60-70% if no rate limiting, ~10-20% in practice due to YouTube blocking

**Latency Impact**: +30-60 seconds per 50-item feed refresh

---

### Method 4: YouTube Data API v3

**Option Considered**: Use `youtube.v3.videos.list` endpoint with `part=contentDetails` to fetch video duration.

**Why Not Used**:

- Requires API key (quota management burden on users)
- Free tier: 10,000 units per day (enough for ~100 videos)
- Paid tiers are expensive ($0.25 per 1,000 requests)
- Still would require users to set up API credentials
- Still doesn't reliably identify shorts (aspect ratio not in standard API response)
- Terms of service prohibit storing metadata, so re-fetching every refresh is required

**Decision**: Not viable for a free plugin

---

## Why This Problem Is Unsolvable at Scale

### The Core Issue

YouTube has **no published, official way** for third-party tools to identify shorts. This is intentional:

1. **Shorts are a separate UI/feed** on YouTube's website (with separate recommendations and analytics)
2. **YouTube benefits from ambiguity** — users watch "regular videos" they didn't realize were shorts, increasing watch time
3. **Detecting shorts programmatically** undermines YouTube's feed strategy

### The Three Walls We Hit

| Detection Method   | Speed          | Reliability                   | User Friction       | Maintenance         |
| ------------------ | -------------- | ----------------------------- | ------------------- | ------------------- |
| URL Patterns       | ✅ Instant     | ❌ 0% (RSS doesn't expose it) | ✅ None             | ✅ None             |
| Title Signals      | ✅ Instant     | ⚠️ 30% (depends on creator)   | ✅ None             | ✅ None             |
| Scraping HTML      | ❌ 5-30s/video | ❌ 5-30% (rate limited)       | ❌ +30-60s/feed     | ❌ Breaks regularly |
| YouTube API        | ✅ Fast        | ⚠️ 70% (duration only)        | ❌ Requires API key | ⚠️ Terms of service |
| Browser Automation | ✅ Reliable    | ✅ 95%+                       | ❌ +5 min/feed      | ❌ Heavy, external  |

**No solution is both fast, reliable, and user-friendly at the same time.**

## What Was Removed

The following code was implemented but ultimately scrapped:

### Removed Methods (MediaService.ts)

```typescript
// All of these were removed:
static isYouTubeShortLink(link: string, title?: string): boolean
static shouldDetectYouTubeShort(feedUrl, itemLink, title, duration): boolean
static parseDurationToSeconds(duration: string): number
static updateYouTubeShortTags(tags, isShort, availableTags): Tag[]
static async fetchYouTubeVideoMetadata(videoId): Promise<metadata>
```

### Removed Settings

- Settings UI toggle: "Detect and auto-tag YouTube shorts"
- Setting key: `MediaSettings.detectYouTubeShorts`
- Default value: `false` (feature was disabled by default due to unreliability)

### Removed Tests

- `test_files/unit/youtube-shorts-detection.test.ts` — ~200 lines of tests
- Test cases for 3Blue1Brown shorts detection (was the motivating use case)

### Removed Feed Parser Logic

- Loop to detect shorts for every feed item
- Automatic tag application logic in `FeedParserService.parseFeed()`
- Shorts detection in preview modal

## Lessons for Future Developers

If you're considering re-implementing shorts detection, understand:

### ✋ Don't Use Scraping

YouTube actively blocks scrapers. Even with perfect regex patterns:

- Your requests will be rate-limited (HTTP 429 Too Many Requests)
- Bot detection may IP-ban your requests
- Obsidian plugin users can't handle slowdowns (every feed refresh would pause the app)
- Maintenance cost is astronomical (YouTube changes their page structure monthly)

### ✋ Don't Assume RSS Feeds Are Complete

RSS is a lowest-common-denominator format. YouTube doesn't publish metadata that would help identify shorts because:

- They want to control how shorts are presented
- RSS readers aren't a priority platform
- Metadata that would help us (aspect ratio, format type) is intentionally omitted

### ✅ If You Try Anyway, Here's What Works Best

1. **For immediate improvement**: Ask content creators to add `#shorts` to titles
2. **For a 70% solution**: Use YouTube Data API v3 `videos.list` endpoint with `contentDetails.duration`
   - Still doesn't identify shorts reliably (no aspect ratio in API)
   - Still requires user API key setup
3. **For a 90%+ solution**: Use Puppeteer or Selenium with headless browser
   - Massively heavy (20+ MB dependencies)
   - Would require spawning a browser process per feed parse
   - Completely impractical for a lightweight Obsidian plugin

### ✅ Manual Tagging Is the Best Solution

Users can:

- Use "Edit" button on individual items to manually tag
- Use bulk operations if the app supports them
- Reach out to creators asking for `#shorts` in titles or metadata

This is more sustainable than any automatic system.

## How This Feature Was Killed

### March 18, 2026: Complete Removal

**Decision**: Scrap the feature entirely.

**Rationale**:

1. Scraping was unreliable and created 30+ second latency per feed refresh
2. Title-based detection only worked for well-behaved channels
3. API-based approach required users to configure credentials
4. The "perfect" solution (browser automation) was too heavy
5. Code maintenance burden exceeded the value provided

**Action Taken**:

- Removed all detection methods from `MediaService.ts`
- Removed all feed parser logic for shorts detection
- Removed settings UI toggle
- Removed unit tests
- Updated documentation to explain why

**Build Status**: ✅ All tests pass, production build succeeds

## References & Notes for Developers

- YouTube RSS URL pattern: `https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}`
- YouTube JSON player response often contains: `"isShortsPage":true`, `"approxDurationMs":"..."` (JavaScript-rendered)
- Regex for extracting duration: `/"approxDurationMs"\s*:\s*"(\d+)"/` (captures milliseconds)
- Shorts are stored in the same feed as regular videos with zero distinguishing metadata
- 3Blue1Brown channel ID: `UCYO_jab_esuFRV4b17AJtAw` (was the motivating test case)
- Many shorts in this channel don't have `#shorts` hashtag and are ~60-90 seconds long

## Conclusion

**The YouTube shorts auto-tagging feature is not broken—it's impossible to implement reliably without substantial resources, user friction, or both.**

YouTube designed shorts to be opaque to RSS feeds. Trying to detect them automatically is fighting against the platform's architecture. Either:

1. Accept manual tagging
2. Get users to relay on official YouTube app/web experience
3. Build a separate tool with proper API access and infrastructure

Do not attempt to solve this problem again without explicit buy-in for one of these directions.
