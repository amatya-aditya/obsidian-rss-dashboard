# Mastodon Integration Plan

**Date:** May 19, 2026  
**Status:** In Progress  
**Scope:** Add Mastodon profile feed resolution to RSS Dashboard via RSS auto-discovery

## Overview

Support Mastodon profile URLs such as `https://mastodon.social/@username` by resolving the RSS feed already advertised by the public profile page. This keeps the feature aligned with the plugin's existing RSS-first architecture and avoids building a separate Mastodon API ingestion pipeline.

## Key Constraint: No OAuth Required

This integration must work without OAuth authentication. The current supported design satisfies that by using HTML auto-discovery from the profile page rather than token-gated account lookup APIs.

### Viability Check

- Confirmed: public Mastodon profile pages advertise RSS feeds via HTML auto-discovery.
- Confirmed: this requires no OAuth or user token.
- Rejected approach: `GET /api/v1/accounts/lookup` is not a safe default for this feature because current Mastodon docs mark it as requiring a user token.

If RSS auto-discovery proves unreliable across common instances, the feature should be reconsidered before adding more complexity.

## Implementation Plan

### Current design

- Detect Mastodon profile URLs:
  - `https://instance/@username`
  - `https://instance/users/username`
- Fetch the public profile HTML.
- Extract the `<link rel="alternate" type="application/rss+xml">` URL.
- Resolve relative RSS URLs against the profile origin.
- Pass the resolved feed URL through the existing feed preview and parsing pipeline.

### Code changes

#### New file

- `src/services/mastodon-service.ts`
  - Detect Mastodon profile URLs
  - Fetch profile HTML
  - Extract RSS auto-discovery links
  - Return resolved feed URL or `null`

#### Modified files

- `src/services/media-service.ts`
  - Add `isMastodonUrl()`
  - Add `getMastodonRssFeed()`

- `src/modals/feed-manager/feed-preview-loader.ts`
  - Add Mastodon detection and resolution
  - Return Mastodon conversion metadata for the UI

- `src/modals/feed-manager/add-feed-modal.ts`
  - Use the shared preview loader path
  - Display Mastodon conversion notice
  - Route eligible folders to the configured RSS default

- `src/modals/feed-manager/edit-feed-modal.ts`
  - Display Mastodon conversion notice
  - Route eligible folders to the configured RSS default

### Documentation

- Update `docs/development/README.md` with supported Mastodon URL patterns
- Document that the integration uses native RSS auto-discovery rather than Mastodon API timeline conversion

## Testing Strategy

### Service tests

`test_files/unit/services/mastodon-service.test.ts`

- Detects valid Mastodon profile URLs
- Rejects non-profile or status URLs
- Extracts absolute RSS URLs from profile auto-discovery
- Resolves relative RSS URLs against the profile page
- Returns `null` when the page does not advertise RSS
- Returns `null` when the request fails

### Feed manager tests

- `test_files/unit/discover/feed-preview-loader.test.ts`
  - Detects Mastodon URL and routes to `mastodon-service`
  - Returns feed preview data for valid Mastodon profiles
  - Marks the result as a Mastodon conversion

- `test_files/unit/modals/add-feed-modal.test.ts`
  - Shows Mastodon conversion notice
  - Routes eligible folders to the configured default RSS folder

- `test_files/unit/modals/edit-feed-modal.test.ts`
  - Shows Mastodon conversion notice
  - Routes eligible folders to the configured default RSS folder

## Current Progress

### Completed

- `mastodon-service.ts` created
- Mastodon URL resolution added to preview loading
- Feed manager add/edit flows updated to use shared preview resolution
- Conversion notice support added for Mastodon
- Focused unit tests added and passing

### Remaining

- Validate against real Mastodon instances
- Update developer-facing docs
- Run broader regression coverage if we decide to expand this beyond the current slice

## Similarity To Existing Integrations

This mirrors the X/Twitter to Nitter flow at the UX layer:

- User pastes a profile URL
- Plugin resolves it to a feed URL
- Plugin shows a conversion notice
- Existing RSS parsing pipeline handles the rest

The difference is that Mastodon uses native RSS auto-discovery instead of redirecting to a third-party feed frontend.

## Risks

- High risk: some instances may omit or alter RSS discovery markup
- Medium risk: instance-specific HTML variations may require more defensive parsing
- Low risk: normal profile-page fetch cost is acceptable for preview-time resolution

## Abort Condition

If reliable unauthenticated RSS discovery is not available across supported Mastodon instances, scrap the feature and document that decision rather than introducing OAuth or a more complex API integration path.
