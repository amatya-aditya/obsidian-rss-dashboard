# P2-2: Safe HTML Tests - Handoff (post P2-1)

## Status

P2-2 is complete (delivered on 2026-03-29).

- Added: `test_files/unit/utils/safe-html.test.ts`
- Verified: `npm run test:unit` is green (75 files / 558 tests)
- Verified (targeted coverage): `src/utils/safe-html.ts` @ Lines 100% | Branches 81.57% | Functions 100%
- Next recommended phase: P2-3 Video Player tests (`docs/development/p2-3-handoff.md`)

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P2-2 targets HTML sanitization in `src/utils/safe-html.ts`. This code is security-sensitive (XSS / unsafe link handling) and also impacts how article content renders in the UI.

## Task (P2-2)

Add unit tests for `src/utils/safe-html.ts`.

- Create: `test_files/unit/utils/safe-html.test.ts`
- Target: `src/utils/safe-html.ts`
- Target coverage: 80%+
- Risk: High (security + rendering correctness)

## What to Test

### `sanitizeAndAppendHtml(container, rawHtml)`

Baseline:
- No-op on empty/whitespace-only input (container remains unchanged).

Blocked tags are removed entirely:
- `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>` do not appear in output.

Allowed tags are preserved:
- `p`, `br`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `pre`, `blockquote`, `a`.

Disallowed tags are "unwrapped":
- Example: `<div><span>Text</span></div>` results in just `Text` (children preserved, wrapper tags removed).

Event handler attributes stripped:
- Any `on*` attributes (`onclick`, `onerror`, etc.) are removed before sanitizing/append.

Links (`<a>`) are constrained:
- Safe hrefs are allowed: `http://`, `https://`, `mailto:`
- Unsafe hrefs are dropped: `javascript:...`, empty/whitespace
- When allowed, the anchor receives:
  - `target="_blank"`
  - `rel="noopener noreferrer"`
  - trimmed `href`
- When href is unsafe, the `<a>` should still render its text content but without an `href`.

Nested structures:
- Mixed allowed + blocked + disallowed tags sanitize deterministically (blocked removed, disallowed unwrapped, allowed preserved).

## Testing Notes

- These tests can run in jsdom using `document.createElement("div")` as the container.
- Prefer asserting on DOM structure (`querySelector`, `getAttribute`, `textContent`) rather than snapshots.
