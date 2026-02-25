# Kagi Smallweb Bug Report

**Date**: 2026-02-25
**Investigator**: Debug Mode Analysis

## Summary

Four issues were reported affecting the Kagi Smallweb view. This document details the root cause analysis and proposed solutions for each.

---

## Issue 1: Follow Button Not Refreshing Kagi Page

### Description

Clicking the "+ Follow" button works properly (the feed is added), but the UI doesn't update to show the "Following" state. The button remains as "+ Follow" instead of changing to "Following".

### Root Cause Analysis

**Location**: [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts:494)

The subscription check compares the wrong URLs:

```typescript
// Line 494-495
const isSubscribed = this.plugin.settings.feeds.some(
  (f: Feed) => f.url === entry.blogUrl,
);
```

The problem is a URL mismatch:

- `entry.blogUrl` = `https://example.com` (the blog's origin URL from the Atom feed)
- `f.url` (stored feed) = `https://example.com/feed` (the discovered RSS feed URL)

When the user clicks "Follow", the [`handleSmallwebSubscribe`](src/views/kagi-smallweb-view.ts:593) function:

1. Discovers the RSS feed URL via [`discoverRssFeed()`](src/views/kagi-smallweb-view.ts:626) (e.g., `/feed`, `/rss`, `/atom.xml`)
2. Adds the feed with the RSS URL, not the blog URL
3. Calls `this.render()` to re-render

However, the `isSubscribed` check compares against `entry.blogUrl`, which will never match the stored feed URL.

### Proposed Solution

**Option A**: Store both URLs in the feed metadata

- Add a `blogUrl` field to the Feed type
- Check against both `f.url` and `f.blogUrl`

**Option B** (Recommended): Fix the comparison logic

- When checking subscription status, also check if any feed URL starts with the blogUrl:

```typescript
const isSubscribed = this.plugin.settings.feeds.some(
  (f: Feed) => f.url === entry.blogUrl || f.url.startsWith(entry.blogUrl + "/"),
);
```

**Option C**: Discover the feed URL before checking

- Call `discoverRssFeed()` once during initial render and cache the results
- Compare against the discovered feed URL

### Files to Modify

- [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts) - Line 494-495

---

## Issue 2: Published Dates Showing Incorrectly (Future Dates)

### Description

Cards show incorrect published dates:

- Mouseover shows "May 12, 2026, 8pm" (a future date)
- Article date shows "in 6,638,873 seconds"
- Older posts correctly show "2 weeks ago", "last month", etc.

### Root Cause Analysis

**Location**: [`src/utils/platform-utils.ts`](src/utils/platform-utils.ts:7) - [`formatRelativeTime()`](src/utils/platform-utils.ts:7)

The issue occurs when the parsed date is in the future (negative time difference). The function doesn't properly handle negative values:

```typescript
// Line 21-22
const diffInMs = now.getTime() - targetDate.getTime();
const diffInSeconds = Math.floor(diffInMs / 1000);
```

When `diffInMs` is negative (future date), `diffInSeconds` is also negative. The `Intl.RelativeTimeFormat` then produces confusing output:

```typescript
// Line 51
return rtf.format(-diffInSeconds, "second");
// If diffInSeconds is -6638873, this becomes rtf.format(6638873, 'second')
// Output: "in 6,638,873 seconds"
```

### Why This Happens

1. The Kagi Smallweb Atom feed may have dates parsed incorrectly
2. The date parsing in [`parseSmallwebAtomFeed()`](src/views/kagi-smallweb-view.ts:177) uses `new Date(updatedStr)` which can produce unexpected results with certain date formats
3. Timezone issues between UTC and local time

### Proposed Solution

1. **Add future date handling** in [`formatRelativeTime()`](src/utils/platform-utils.ts:7):

```typescript
// Handle future dates - treat as "Just now"
if (diffInMs < 0) {
  return "Just now";
}
```

2. **Add date validation** in [`parseSmallwebAtomFeed()`](src/views/kagi-smallweb-view.ts:177):

```typescript
let updatedAt: Date;
try {
  updatedAt = new Date(updatedStr);
  // If date is in the future, use current time
  if (updatedAt.getTime() > Date.now()) {
    updatedAt = new Date();
  }
} catch {
  updatedAt = new Date();
}
```

3. **Add debug logging** to identify problematic date strings from the API.

### Files to Modify

- [`src/utils/platform-utils.ts`](src/utils/platform-utils.ts) - [`formatRelativeTime()`](src/utils/platform-utils.ts:7)
- [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts) - [`parseSmallwebAtomFeed()`](src/views/kagi-smallweb-view.ts:177)

---

## Issue 3: Last Update Text Formatting Changes

### Description

User requests text changes:

1. Change "Last update:" to "Last Kagi update:"
2. Show time in UTC and EST (remove date from EST)
3. Change "Updated just now" to "Last local update: just now"

### Current Implementation

**Location**: [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts:302) - [`renderSmallwebHeader()`](src/views/kagi-smallweb-view.ts:265)

```typescript
// Lines 317-332 - Kagi API timestamp
const utcTime = this.smallwebFeedUpdatedAt
  .toISOString()
  .replace("T", " ")
  .replace(/\.\d+Z$/, " UTC");
const estTime = this.smallwebFeedUpdatedAt.toLocaleString("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

apiLink.createSpan({
  text: ` Last update: ${utcTime} / ${estTime} EST`,
});

// Lines 347-349 - Local cache timestamp
timestamp.appendText(
  ` Updated ${this.getSmallwebRelativeTime(this.smallwebCache.fetchedAt)}`,
);
```

### Proposed Solution

1. **Change "Last update:" to "Last Kagi update:"**

```typescript
apiLink.createSpan({
  text: ` Last Kagi update: ${utcTime} / ${estTime} EST`,
});
```

2. **Remove date from EST time** (keep only time):

```typescript
const estTime = this.smallwebFeedUpdatedAt.toLocaleString("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
```

3. **Change "Updated" to "Last local update:"**:

```typescript
timestamp.appendText(
  ` Last local update: ${this.getSmallwebRelativeTime(this.smallwebCache.fetchedAt)}`,
);
```

### Files to Modify

- [`src/views/kagi-smallweb-view.ts`](src/views/kagi-smallweb-view.ts) - [`renderSmallwebHeader()`](src/views/kagi-smallweb-view.ts:265)

---

## Issue 4: Card Title Text Extending Beyond Card Width

### Description

Post titles in cards extend beyond the card width. Previously they extended outside the card, now they extend behind it (hidden overflow). Only the title is affected, not the description.

### Root Cause Analysis

**Location**: [`src/styles/discover.css`](src/styles/discover.css:277)

The `.rss-discover-card-title` has proper text overflow styles:

```css
/* Lines 277-286 */
.rss-discover-card-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-normal);
  flex: 1;
  margin-right: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

However, the parent flex container doesn't have `min-width: 0`, which is required for text-overflow to work correctly in flex children:

```css
/* Lines 553-558 */
.rss-discover-card-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-grow: 1;
  /* Missing: min-width: 0; */
}
```

In CSS flexbox, flex items have a default `min-width: auto`, which prevents them from shrinking below their content size. This breaks `text-overflow: ellipsis`.

### Proposed Solution

Add `min-width: 0` to the flex container and ensure the title has proper constraints:

```css
.rss-discover-card-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-grow: 1;
  min-width: 0; /* Add this */
}

.rss-discover-card-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-normal);
  flex: 1;
  margin-right: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0; /* Add this for extra safety */
}
```

### Files to Modify

- [`src/styles/discover.css`](src/styles/discover.css) - Lines 553-558 and 277-286

---

## Implementation Priority

| Issue                   | Priority | Complexity | Impact                    |
| ----------------------- | -------- | ---------- | ------------------------- |
| Issue 1 (Follow button) | High     | Medium     | Core functionality broken |
| Issue 2 (Future dates)  | Medium   | Low        | User confusion            |
| Issue 3 (Text changes)  | Low      | Low        | Cosmetic                  |
| Issue 4 (Card title)    | Medium   | Low        | UI polish                 |

## Recommended Fix Order

1. **Issue 1** - Fix the subscription check URL comparison
2. **Issue 4** - Add CSS min-width constraints
3. **Issue 2** - Add future date handling
4. **Issue 3** - Update text labels

---

## Additional Notes

### Testing Recommendations

1. **Issue 1**: Test with multiple blogs that have different RSS URL patterns (`/feed`, `/rss`, `/atom.xml`, etc.)
2. **Issue 2**: Add unit tests for `formatRelativeTime()` with edge cases (future dates, invalid dates, very old dates)
3. **Issue 4**: Test with very long blog names and post titles on different screen widths

### Debug Logging Suggested

For Issue 2, add temporary logging to identify problematic date strings:

```typescript
console.debug("[Kagi Smallweb] Parsed date:", {
  raw: updatedStr,
  parsed: updatedAt,
  isFuture: updatedAt.getTime() > Date.now(),
});
```
