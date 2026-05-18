# Mastodon Integration Plan

**Date:** May 18, 2026  
**Status:** Proposed  
**Scope:** Add Mastodon profile feed resolution to RSS Dashboard

## Overview

Integrate Mastodon feed resolution into the RSS Dashboard plugin by leveraging the Mastodon API to fetch public timelines. Users will be able to paste a Mastodon profile URL (e.g., `https://mastodon.social/@username`) and have it automatically converted into an RSS feed.

## Key Constraint: No OAuth Required

**Critical Design Constraint:** This integration **must work without OAuth authentication**. If public Mastodon timelines cannot be accessed via the API without authentication, this feature will be **not viable** and should be **scrapped**.

### Viability Check

- ✅ Mastodon API allows unauthenticated read access to public timelines
- ✅ Users can fetch any public profile's statuses via `/api/v1/accounts/:id/statuses`
- ✅ No authentication token required for public data

If this assumption proves incorrect during implementation, the feature will be deprecated.

## 1. Implementation Plan

### 1.1. Research and Setup

- **Understand Mastodon API**:
  - Public timeline endpoint: `GET /api/v1/accounts/:id/statuses`
  - Account lookup: `GET /api/v1/accounts/lookup?acct=username@instance`
  - Ensure all endpoints are accessible without authentication
  - Verify compatibility across federated instances

- **Data Transformation**:
  - Convert Mastodon API responses (JSON) into RSS feed format
  - Map fields:
    - Mastodon status → RSS item
    - Account name → Feed title
    - Instance URL → Feed link
    - Status created_at → pubDate
    - Status content → description
    - Media attachments → enclosures/images

### 1.2. Code Changes

#### New Files

- `src/services/mastodon-service.ts`
  - Handle URL detection and parsing
  - Fetch account information from public API
  - Transform Mastodon JSON to RSS-compatible format
  - Error handling for invalid URLs, rate limits, unreachable instances

#### Modified Files

- `src/modals/feed-manager/feed-preview-loader.ts`
  - Add Mastodon URL detection (similar to existing X/Twitter and YouTube patterns)
  - Route Mastodon URLs to `mastodon-service`
  - Return transformed feed data for preview

- `src/services/media-service.ts`
  - Add `isMastodonUrl()` method
  - Add `getMastodonRssFeed()` method (analogous to `getNitterRssFeed()`)

#### Documentation

- Update `docs/development/README.md` with Mastodon integration notes
- Add Mastodon platform documentation to feed validation guide if needed

### 1.3. Public API Limitations & Fallbacks

- **Rate Limiting**: Mastodon instances may rate-limit API requests
  - Add exponential backoff retry logic
  - Display user-friendly rate limit messages

- **Instance Variations**: Different Mastodon instances may have slightly different API responses
  - Implement defensive parsing to handle variations
  - Test against multiple instances (mastodon.social, pixelfed, peertube, etc. if they expose compatible endpoints)

---

## 2. Test-Driven Development (TDD) Cycle

### 2.1. Red Phase: Write Failing Tests

#### Service Layer Tests (`test_files/unit/services/mastodon-service.test.ts`)

```ts
describe("MastodonService", () => {
  describe("URL Detection", () => {
    it("detects valid Mastodon profile URLs");
    it("rejects invalid Mastodon URLs");
    it("handles instance variations (mastodon.social, pixelfed.social, etc.)");
  });

  describe("Account Lookup", () => {
    it("fetches account info from Mastodon API using username and instance");
    it("throws error for non-existent account");
    it("throws error for unreachable instance");
  });

  describe("Timeline Fetching", () => {
    it("fetches public statuses for an account");
    it("filters out non-public statuses");
    it("handles empty timelines gracefully");
  });

  describe("Data Transformation", () => {
    it("transforms Mastodon status to RSS item with correct fields");
    it("extracts and includes media attachments as enclosures");
    it("sanitizes HTML content from statuses");
    it("handles replies and threads correctly");
  });

  describe("Error Handling", () => {
    it("handles API rate limiting with appropriate message");
    it("handles network errors gracefully");
    it("handles malformed JSON responses");
    it("handles instance timeouts");
  });
});
```

#### Feed Manager Integration Tests (`test_files/unit/modals/feed-preview-loader-mastodon.test.ts`)

```ts
describe("FeedPreviewLoader - Mastodon", () => {
  it("detects Mastodon URL and routes to mastodon-service");
  it("returns feed preview data for valid Mastodon profile");
  it("displays appropriate error message for invalid profile");
  it("displays Mastodon conversion notice similar to X/Nitter");
});
```

### 2.2. Green Phase: Implement Minimum Code to Pass Tests

1. **Create `src/services/mastodon-service.ts`**:
   - `isMastodonUrl(url: string): boolean`
   - `parseMastodonUrl(url: string): { username: string; instance: string }`
   - `async fetchMastodonAccount(username: string, instance: string)`
   - `async fetchMastodonTimeline(accountId: string, instance: string)`
   - `transformStatusToRssItem(status: MastodonStatus): RssItem`
   - `async resolveMastodonFeed(url: string): Promise<FeedPreviewData>`

2. **Update `src/services/media-service.ts`**:
   - Add `isMastodonUrl()` and `getMastodonRssFeed()` methods

3. **Update `src/modals/feed-manager/feed-preview-loader.ts`**:
   - Add Mastodon detection before other platform checks
   - Integrate mastodon-service

### 2.3. Refactor Phase: Optimize & Clean Up

- Extract common HTTP handling into utilities
- Refactor error messages for consistency
- Consolidate duplicated API fetch logic
- Ensure test coverage meets project thresholds (40% lines, 33% branches, 34% functions)

---

## 3. Testing Strategy

### 3.1 Test File Structure

```
test_files/unit/
  ├── services/
  │   └── mastodon-service.test.ts       (new)
  ├── modals/
  │   └── feed-preview-loader-mastodon.test.ts (new)
  └── fixtures/
      └── mastodon/
          ├── account-response.json       (sample API response)
          ├── timeline-response.json      (sample timeline)
          └── edge-cases.json             (empty, locked, etc.)
```

### 3.2 Mocking Strategy

- Mock `requestUrl` from Obsidian to simulate API responses
- Use fixtures from `test_files/unit/fixtures/mastodon/` for realistic data
- Test against multiple Mastodon API response formats

### 3.3 Test Coverage Requirements

- Minimum statement coverage: 40% (project threshold)
- All new code paths must have corresponding tests
- Edge cases: empty timelines, private accounts, rate limits, network errors

---

## 4. Implementation Milestones

### Milestone 1: Service Layer Foundation

**Deliverable:** `mastodon-service.ts` with full API integration

- ✅ URL detection and parsing
- ✅ Account lookup via public API
- ✅ Timeline fetching
- ✅ Data transformation to RSS format
- ✅ Error handling
- ✅ 100% test coverage for service

**Tests:** `mastodon-service.test.ts` (all tests passing)

### Milestone 2: Feed Manager Integration

**Deliverable:** Updated feed preview loader and media service

- ✅ Mastodon URL detection in feed manager
- ✅ Integration with mastodon-service
- ✅ Feed preview display
- ✅ User-facing status messages

**Tests:** `feed-preview-loader-mastodon.test.ts` (all tests passing)

### Milestone 3: Documentation & Polish

**Deliverable:** Updated project documentation

- ✅ Add Mastodon section to `docs/development/README.md`
- ✅ Document API patterns and limitations
- ✅ Add example Mastodon feed URLs

**Tests:** Verify overall test suite remains at 100% pass rate

### Milestone 4: Viability Validation

**Critical Gate:** Confirm Mastodon feeds work without OAuth

- ✅ Test against multiple instances
- ✅ Verify rate limiting is acceptable
- ✅ If blockers found → **SCRAP FEATURE**

---

## 5. Viability Constraints & Exit Criteria

### Must Be True for Feature to Proceed

1. ✅ Mastodon API allows unauthenticated access to public timelines
2. ✅ Rate limits are reasonable for background refresh cycles
3. ✅ API responses are consistent enough to parse reliably

### If Any Constraint is Violated

- **Action:** Immediately deprecate this feature
- **Reason:** Authentication complexity (OAuth, token management) is out of scope
- **Result:** Remove Mastodon integration code and tests; document decision in `docs/archive/`

---

## 6. Similarities to Existing Integrations

This implementation mirrors the **X/Twitter → Nitter** pattern:

- User pastes URL (Twitter profile → Mastodon profile)
- Plugin detects platform and fetches feed
- Plugin displays conversion notice to user
- Feed is stored in settings for background refresh

Similar to Twitter/Nitter:

```ts
// Current pattern for Twitter
static getNitterRssFeed(url: string): string | null {
  const xMatch = url.match(/(?:x|twitter)\.com\/([^/?#]+)/);
  if (xMatch?.[1]) {
    const username = xMatch[1];
    return `https://nitter.net/${username}/rss`;
  }
  return null;
}

// Proposed pattern for Mastodon
static async getMastodonRssFeed(url: string): Promise<string | null> {
  const mastodonMatch = url.match(/([a-zA-Z0-9.-]+\.(social|online|world|etc))\/@([^/?#]+)/);
  if (mastodonMatch?.[3]) {
    const [, instance, , username] = mastodonMatch;
    return await MastodonService.resolveMastodonFeed(username, instance);
  }
  return null;
}
```

---

## 7. Known Differences from Twitter/Nitter

| Aspect         | Twitter/Nitter             | Mastodon              |
| -------------- | -------------------------- | --------------------- |
| URL Structure  | Fixed (twitter.com, x.com) | Variable per instance |
| Feed Format    | Standardized Nitter RSS    | Variable API format   |
| Authentication | None required              | None required ✅      |
| Public Access  | Yes                        | Yes ✅                |
| Rate Limiting  | Nitter varies              | Per-instance limits   |

---

## 8. Next Steps

1. **Create `mastodon-service.ts`** with TDD approach (Red → Green → Refactor)
2. **Write and pass service layer tests**
3. **Integrate with feed manager**
4. **Run full test suite** to ensure no regressions
5. **Validate viability** against real Mastodon instances
6. **Document** in developer guide if successful; **archive** if constraints violated

---

## Risk Assessment

- **High Risk:** API authentication requirement → **Exit immediately**
- **Medium Risk:** Rate limiting too aggressive → Implement caching/backoff
- **Low Risk:** API format variations → Handle with defensive parsing
- **Low Risk:** Performance impact → Monitor via test suite

**Abort Condition:** If OAuth or authentication is required, scrap entire feature and document the decision.
