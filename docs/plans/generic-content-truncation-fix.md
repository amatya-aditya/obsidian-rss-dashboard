# Implementation Plan: Generic Content Truncation Fix

## Overview
This plan addresses the issue where non-paywalled articles with rich content in `content:encoded` are truncated or missing in the reader view. The fix ensures that the reader prefers feed content when fetched full-article content is thin, teaser-like, or nav-heavy. This is a generic solution applicable across feeds, not limited to specific hosts.

## Goals
1. Ensure rich feed content (e.g., `content:encoded`) is preferred when fetched content is low quality.
2. Maintain existing restricted/paywall behavior.
3. Align behavior across both rendering paths (ReaderView and ArticleRenderer).
4. Avoid regressions in restricted content handling or sanitization safety.

## Steps

### 1. Baseline and Risk Mapping
- Confirm current selection/fallback flow in `ReaderView` and `ArticleRenderer`.
- Identify all points where fetched content overrides feed content.
- Ensure identical behavior changes across both paths.

### 2. Phase 1 - Shared Quality Evaluator
- Create a utility function `compareContentQuality(feedHtml, fetchedHtml, url)`.
- Use heuristics:
  - Text length (normalized, stripped of tags).
  - Paragraph count.
  - Link density.
  - Teaser/read-more markers.
- Output decision metadata:
  ```typescript
  {
    preferFeed: boolean,
    preferFetched: boolean,
    reason: string
  }
  ```

### 3. Phase 2 - Integrate into ReaderView
- File: `src/views/reader-view.ts`
- Replace fetched-content-only gate in `displayItem()` with comparator-driven selection.
- Preserve restricted failure behavior.
- Ensure skip-fetch rules for tweet/video content remain intact.

### 4. Phase 3 - Integrate into ArticleRenderer
- File: `src/components/article-renderer.ts`
- Apply the same comparator in its content selection branch.
- Align behavior with `ReaderView`.

### 5. Phase 4 - Harden Cleanup Interaction
- File: `src/views/reader-view.ts`
- Ensure aggressive strip routines (navigation/headline/duplicate lead removal) only affect chosen fetched content.
- Prevent degradation of feed-selected content paths.

### 6. Phase 5 - Tests
- Extend unit tests for multi-feed scenarios:
  - Rich `content:encoded` with short fetched content → prefer feed.
  - Substantial fetched content → prefer fetched.
  - Equivalent bodies → deterministic stable choice.
- Add cases modeled on Ars Technica/BigThink patterns (summary + content:encoded body + read-full-article links).

### 7. Phase 6 - Verification and Guardrails
- Run targeted unit suites for parser, fetch helpers, reader view, and article renderer.
- Run full repository test suite to validate no regressions.
- Manual smoke tests:
  - Feeds with full content in `content:encoded`.
  - Restricted/paywalled links to confirm unchanged banner behavior.

## Relevant Files
- `src/views/reader-view.ts`: Main selection and rendering decisions.
- `src/components/article-renderer.ts`: Duplicate selection path.
- `src/utils/fetch-helpers.ts`: Existing blocked/restricted heuristics.
- `src/services/feed-parser.ts`: Reference confirmed `content:encoded` priority.
- `src/utils/safe-html.ts`: Ensure sanitization safety remains unchanged.
- `test_files/unit/views/reader-view-restricted-banner.test.ts`: Regression guard for restricted fallback.
- `test_files/unit/services/feed-parser.test.ts`: Extend fixtures/assertions for rich `content:encoded` selection outcomes.
- `test_files/unit/services/fetch-helpers.test.ts`: Add low-quality fetched-content scenarios.

## Verification
1. Add unit tests for comparator outcomes:
   - Long feed body + short fetched output → prefer feed.
   - Substantial fetched output → prefer fetched.
   - Equivalent bodies → deterministic stable choice.
2. Run targeted unit suites for parser, fetch helpers, reader view, and article renderer.
3. Run full test suite for regression coverage.
4. Manual smoke test with at least two known affected feeds and one restricted article.

## Decisions Captured
- **Included**: Generic cross-feed fix.
- **Included**: Both rendering paths.
- **Excluded**: Host allowlisting as primary solution.
- **Excluded**: Major Readability pipeline rewrite unless tests force it.

## Further Considerations
1. Centralize comparator thresholds as constants for easy tuning.
2. Add optional telemetry/debug logging for development builds.
3. Consider a future setting to let users globally prefer feed content or auto mode (default).