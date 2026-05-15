# Bug Report: Auto-tag Videos Not Applied

Last updated: May 12, 2026

## Summary

The `Settings > Media > Auto-tag videos` feature is enabled, but video items are still not receiving a video tag on refresh.

This remains reproducible even after:

- Refreshing all feeds
- Switching storage mode from shard to legacy and back
- Applying recent media-detection and tag-name compatibility patches

## Severity

- Type: Functional regression / feature failure
- Impact: Medium to high for users relying on tag-driven workflows and filters

## User-Reported Reproduction (Confirmed)

1. Enable `Settings > Media > Auto-tag videos`.
2. Add or refresh feeds containing URL-detectable video entries.
3. Example feed item:

```xml
<item>
  <title><![CDATA[Henry Wang on US-China Summit Expectations]]></title>
  <link>https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video</link>
  <guid isPermaLink="true">https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video</guid>
  <media:content url="https://assets.bwbx.io/images/...jpg" type="image/jpeg">
    <media:thumbnail url="https://assets.bwbx.io/images/...jpg"></media:thumbnail>
  </media:content>
</item>
```

4. Observe that the item is not tagged with `Video`/`Videos` after refresh.

## Expected Behavior

- The item should be detected as `mediaType = "video"` based on known video URL route patterns.
- With `Auto-tag videos` enabled, the item should receive the configured video tag (resolved from available tags, e.g. `Video` or `Videos`) for both YouTube and non-YouTube video feeds.

## Actual Behavior

- Item appears to remain untagged in real use, despite video-like URL and feature enabled.

## Technical Notes

### Recently Implemented Fixes

- Media detection adjusted so `media:content type="image/*"` does not automatically suppress URL-based video route detection for known video routes (Bloomberg pattern).
- Non-YouTube auto-tag lookup updated to accept both `Video` and `Videos` tag names.
- Regression tests added in `test_files/unit/services/media-service.detect-and-process-feed.test.ts` for:
  - Bloomberg video route + image media content
  - Auto-tag with `Video`
  - Auto-tag with `Videos`

### Root Cause (Confirmed)

- Runtime settings state could contain malformed `availableTags` (for example `null`), because load normalization did not enforce an array for that field.
- `MediaService.applyMediaTags` assumed `availableTags` was always a valid array and called `.find(...)` directly.
- For YouTube feeds, this threw during post-parse tagging and the refresh path returned the old feed object.
- The refresh catch path swallowed the exception without useful context, which made the issue appear as a generic YouTube fetch failure.
- A second classification gap affected Bloomberg-style video entries: when `media:content` used `medium="image"`, the detection logic returned `article` too early, before URL-route fallback (`/news/videos/...`) could mark the item as `video`.

### Fix Implemented

- Added defensive guard in `MediaService.applyMediaTags` to no-op when `availableTags` is missing/invalid instead of throwing.
- Normalized `availableTags` in settings load path (`loadAndNormalizeSettings`) to default array when persisted value is invalid.
- Hardened media-tag migration to always leave `settings.availableTags` as a normalized array.
- Added refresh error logging in feed parser catch block for diagnosability.
- Added focused regression tests for malformed `availableTags` across media-service, settings-loader, and migration coverage.
- Updated media classification precedence so `mediaContentMedium = "image"` still allows known video-route URL fallback (for example Bloomberg `/news/videos/...`).
- Added Bloomberg regressions in both media-service unit tests and feed-parser integration tests to verify Video tag application when image metadata is present.

## Hypotheses to Investigate Next

1. `applyMediaTags` is not reached in a specific refresh/import path used by the UI.
2. `availableTags` at runtime does not contain either `Video` or `Videos` for affected vault state.
3. Tag mutation is applied in-memory but overwritten later in refresh/save pipeline.
4. The UI surface displaying tags is stale and not reflecting updated item tags after refresh.
5. Feed-level `mediaType` or item-level `mediaType` is being reset after detection.

## Suggested Debug Plan

1. Add temporary diagnostics around:
   - `MediaService.detectAndProcessFeed`
   - `MediaService.applyMediaTags`
   - post-merge item state before save
2. Capture one affected feed refresh end-to-end:
   - before parse
   - after detection
   - after tagging
   - before/after persistence
3. Validate persisted item tag arrays in both storage modes for the same item.
4. Verify dashboard/reader rendering path reads the persisted tags after refresh.

## Current Status

- Status: Fixed (hotfix implemented)
- Reproducible: Not observed after patch in focused verification
- Test status: Focused regression suites pass (`84` tests across media-service and feed-parser, plus prior `34` tests across media-service, settings-loader, and migration)

/cc @maintainers @plugin-author
