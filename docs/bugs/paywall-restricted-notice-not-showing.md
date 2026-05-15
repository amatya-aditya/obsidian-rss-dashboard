# Bug Report: Paywall/Restricted Article Notice Not Displayed

## Summary

This original issue is resolved. Restricted/paywalled article handling now correctly shows both the toast notification and the inline reader banner while falling back to the feed excerpt.

The remaining issue is separate: some video feed items are not being identified as video content early enough, and are incorrectly treated as restricted articles. This can trigger false paywall messaging (example: Bloomberg video feed items).

## Steps to Reproduce

1. Open the RSS Dashboard plugin in Obsidian.
2. Add a feed with known paywalled/restricted articles (e.g., Bloomberg).
3. Attempt to open a restricted article (one that returns 403 or is detected as paywalled).
4. Observe the UI and notifications.

## Expected Behavior

- True restricted/paywalled articles should:
  - Show the toast: `Full article is restricted. Showing available feed excerpt.`
  - Show the inline paywall banner in reader surfaces.
  - Fall back to the feed excerpt.
- Video feed items should:
  - Be recognized as video content.
  - Avoid restricted/paywall messaging unless there is an actual restriction.

## Actual Behavior

- For restricted articles, toast and banner now appear correctly.
- For some video entries, the UI can still incorrectly show restricted/paywall messaging even when the linked content is accessible.

## Technical Context

- Codebase: obsidian-rss-dashboard (TypeScript, Obsidian API)
- Relevant files touched during implementation:
  - `src/utils/full-article-fetch.ts` (shared restricted/network fetch outcome and notice/banner constants)
  - `src/services/article-saver.ts` (restricted fallback handling + notice wiring)
  - `src/components/article-renderer.ts` (inline reader restricted flow and banner rendering)
  - `src/views/reader-view.ts` (reader tab restricted flow and banner rendering)
  - `src/views/dashboard-view.ts` (rerender behavior when restricted state changes)
  - `src/styles/reader.css` (reader paywall banner styling)
  - `src/services/feed-parser.ts` / `src/types/types.ts` (media metadata plumbing for video classification)
- Validation status:
  - Focused Vitest suites for restricted banner/notice behavior pass.
  - Feed parser + reader regression tests for media-type handling pass.
  - Build passes.

## Work Performed

- Implemented a shared full-article fetch outcome utility to distinguish `restricted`, `network`, and success states.
- Wired restricted detection into save flow and both reader surfaces.
- Added and verified toast notification behavior for restricted fallback.
- Added and refined inline paywall banner behavior (including CTA link to source URL).
- Ensured dashboard rerender/update logic preserves and reflects restricted state changes.
- Added targeted unit tests covering restricted fallback, notice emission, and banner rendering.
- Added video/media-related regression coverage to reduce false positives.

## Additional Notes

- The original bug in this document is now fixed.
- Current open issue: feed metadata does not always clearly indicate video items before restricted checks run in all real-world cases.
- Result: some video links are mislabeled as restricted/paywalled when they are not.
- Example class of affected items: Bloomberg video feed links.

## Current Status

- `Resolved`: Paywall toast + inline banner for truly restricted articles.
- `Open`: False restricted/paywall messaging on some video feed items due to media-type signaling/classification gaps.
- `Next tracking recommendation`: continue under a dedicated bug focused on video detection/misclassification rather than paywall notice visibility.

---

**Status update complete: paywall notice/banner visibility issue is resolved; remaining work is video feed misclassification causing false paywall indicators.**

/cc @maintainers @plugin-author
